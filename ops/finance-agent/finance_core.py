"""Private, bounded preparation workflow. No network, model or accounting writes."""
from __future__ import annotations

import csv
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from urllib.parse import urlparse
from uuid import UUID

PROFILE = 'benefitsi-finance'
MAX_MANIFEST = 256 * 1024
MAX_ORIGINAL = 4 * 1024 * 1024
MAX_REPORT = 1024 * 1024
RULES = [
    {'id': 'gobd', 'title': 'GoBD: Nachvollziehbarkeit, Originale und Änderungshistorie',
     'url': 'https://amtliche-handbuecher.bundesfinanzministerium.de/ao/2026/Anhaenge/BMF-Schreiben-und-gleichlautende-Laendererlasse/Anhang-33/inhalt.html',
     'checkedOn': '2026-10-04', 'application': 'Verfahren unternehmensbezogen prüfen; Arbeitsregister ist kein GoBD-Nachweis.'},
    {'id': 'elster', 'title': 'ELSTER: steuerliche Erfassung bei Gründung',
     'url': 'https://www.elster.de/elsterweb/infoseite/unternehmensgruendung',
     'checkedOn': '2026-10-04', 'application': 'Rechtsform, Tätigkeitsbeginn und Erfassungsbeleg zuerst bestätigen; keine Frist aus einer Planung ableiten.'},
    {'id': 'einvoice', 'title': 'BMF: Empfang und Aufbewahrung von E-Rechnungen',
     'url': 'https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html',
     'checkedOn': '2026-10-04', 'application': 'Empfangsweg und strukturierten Originalteil prüfen; konkrete Pflichten fachlich bestätigen.'},
]
COMPANY_TASKS = {
    'legalForm': 'Rechtsform anhand freigegebener Gründungsunterlagen bestätigen.',
    'taxResidence': 'Land und steuerlichen Sitz der betreuten Gesellschaft mit Nachweis bestätigen.',
    'formationStatus': 'Gründungsstand und tatsächlichen Betreiber mit Nachweis bestätigen.',
    'taxRegistration': 'Steuerliche Erfassung und Zuständigkeit anhand vorhandener Nachweise prüfen.',
    'accountingSystem': 'Buchhaltungssystem, Belegablage, Kontenplan und Fachprüfung festlegen.',
}
FINANCIAL_KINDS = {'invoice', 'credit', 'receipt'}
KINDS = FINANCIAL_KINDS | {'formation', 'tax_notice', 'accounting_setup'}
OFFICIAL_HOSTS = {'www.elster.de', 'www.faq.elster.de', 'www.bundesfinanzministerium.de',
                  'amtliche-handbuecher.bundesfinanzministerium.de', 'www.gesetze-im-internet.de'}


def _now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', value):
        raise ValueError('Ungültige Datensatz-ID.')
    return value


def _request_id(value):
    if not isinstance(value, str) or str(UUID(value)) != value:
        raise ValueError('Ungültige Auftrags-ID.')
    return value


def _text(value, limit=200):
    return value.strip() if isinstance(value, str) and 0 < len(value.strip()) <= limit else None


def _day(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        return None
    try:
        date.fromisoformat(value)
        return value
    except ValueError:
        return None


def _amount(value):
    # JSON floats, NaN and exponent notation never silently become book values.
    if not isinstance(value, str) or not re.fullmatch(r'-?\d{1,12}(?:\.\d{1,4})?', value):
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def _money(value):
    if value is None:
        return None
    return format(value, '.2f') if value.as_tuple().exponent >= -2 else format(value, 'f')


def _currency(value):
    return value if isinstance(value, str) and re.fullmatch('[A-Z]{3}', value) else None


def _no_symlinks(path):
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        # /var is the standard macOS platform alias, never an input path.
        if current != Path('/var') and current.is_symlink():
            raise ValueError('Verknüpfte Finanzpfade sind nicht zugelassen.')


def _read(path, limit, private=False):
    _no_symlinks(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
        raise ValueError('Datei ist kein zulässiges begrenztes Original.')
    if private and info.st_mode & 0o077:
        raise ValueError('Finanzarbeitsdatei benötigt private Dateirechte.')
    with path.open('rb') as handle:
        raw = handle.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('Dateigrenze überschritten.')
    return raw


def _write_new(path, data):
    raw = data.encode() if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=2).encode()
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.finance-stage-', delete=False) as handle:
            temporary = Path(handle.name)
            os.chmod(temporary, 0o600)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        # Atomic exclusive creation, never replace a previous report.
        os.link(temporary, path)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def _list(data, key, limit):
    values = data.get(key, [])
    if not isinstance(values, list) or len(values) > limit or any(not isinstance(x, dict) for x in values):
        raise ValueError('Ungültiger oder zu großer Finanzauftrag.')
    seen = set()
    for value in values:
        if key not in {'balances'}:
            identifier = _identifier(value.get('id'))
            if identifier in seen:
                raise ValueError('Doppelte Datensatz-ID im Auftrag.')
            seen.add(identifier)
    return values


class FinanceWorkspace:
    def __init__(self, root, sources=None):
        self.root = Path(root).absolute()
        self.private = self.root / 'private'
        self.sources = sources or []

    def _guard(self):
        _no_symlinks(self.private)
        if not self.private.is_dir() or self.private.stat().st_mode & 0o077:
            raise ValueError('Privater Finanzbereich fehlt oder hat unzulässige Rechte.')

    def _manifest(self):
        path = self.private / 'manifest.json'
        if not path.exists():
            return {'schemaVersion': 1, 'company': {}, 'documents': [], 'payments': [], 'balances': [], 'deadlines': []}, b''
        raw = _read(path, MAX_MANIFEST, private=True)
        data = json.loads(raw)
        if not isinstance(data, dict) or type(data.get('schemaVersion')) is not int or data.get('schemaVersion') != 1 or not isinstance(data.get('company', {}), dict):
            raise ValueError('Ungültiges Finanzmanifest.')
        for key, maximum in [('documents', 20), ('payments', 200), ('balances', 12), ('deadlines', 50)]:
            _list(data, key, maximum)
        return data, raw

    def _source_states(self):
        states = []
        for source in self.sources:
            try:
                path = Path(source['path'])
                _no_symlinks(path)
                available = path.is_file()
            except (OSError, ValueError):
                available = False
            states.append({'id': source['id'], 'label': source['label'],
                           'state': 'available' if available else 'missing',
                           'role': source['role']})
        states.extend([
            {'id': 'intake', 'label': 'Privater freigegebener Belegeingang',
             'state': 'available' if (self.private / 'manifest.json').exists() else 'missing', 'role': 'input'},
            {'id': 'bank', 'label': 'Bank-/Zahlungsabgleich', 'state': 'not_connected', 'role': 'integration'},
            {'id': 'accounting', 'label': 'Buchhaltungssoftware', 'state': 'not_connected', 'role': 'integration'},
            {'id': 'stripe', 'label': 'Stripe-Abrechnung', 'state': 'not_connected', 'role': 'integration'},
        ])
        return states

    def _source_inventory(self):
        inventory = []
        for source in self.sources:
            try:
                raw = _read(Path(source['path']), MAX_ORIGINAL)
                digest = hashlib.sha256(raw).hexdigest()
            except (OSError, ValueError):
                digest = None
            inventory.append({'id': source['id'], 'path': source['path'], 'role': source['role'], 'sha256': digest})
        return inventory

    def status(self):
        self._guard()
        last = None
        runs = self.private / 'runs'
        if runs.exists():
            _no_symlinks(runs)
            count = 0
            for path in runs.iterdir():
                count += 1
                if count > 2048:
                    raise ValueError('Laufarchiv benötigt eine geordnete Übergabe.')
                if not re.fullmatch(r'[0-9a-f-]{36}', path.name):
                    continue
                summary_path = path / 'summary.json'
                if summary_path.exists():
                    candidate = json.loads(_read(summary_path, MAX_MANIFEST, private=True))
                    if last is None or candidate['finishedAt'] > last['finishedAt']:
                        last = candidate
        return {'schemaVersion': 1, 'profile': PROFILE, 'service': 'startable',
                'observedAt': _now(), 'lastRun': last, 'sources': self._source_states(), 'rules': RULES}

    def run(self, task, request_id):
        if task not in {'setup', 'review'}:
            raise ValueError('Unbekannte Finanzaufgabe.')
        request_id = _request_id(request_id)
        self._guard()
        lock_path = self.private / '.run.lock'
        _no_symlinks(lock_path)
        with lock_path.open('a') as lock:
            os.chmod(lock_path, 0o600)
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError('Ein Finanz-Prüflauf läuft bereits.') from None
            data, raw = self._manifest()
            input_hash = hashlib.sha256(raw).hexdigest()
            runs = self.private / 'runs'
            _no_symlinks(runs)
            runs.mkdir(mode=0o700, exist_ok=True)
            run_root = runs / request_id
            if (run_root / 'report.json').exists():
                report = json.loads(_read(run_root / 'report.json', MAX_REPORT, private=True))
                if report['inputSha256'] != input_hash or report['task'] != task:
                    raise ValueError('Auftrags-ID wurde bereits mit anderem Eingang verwendet.')
                # Same manifest but changed original requires a new request.
                for document in report['documents']:
                    if document['sha256'] != self._original_hash(document.get('path')):
                        raise ValueError('Original geändert; neuen Prüflauf starten.')
                return self._complete(run_root, report)
            started = _now()
            report = self._prepare(data)
            report.update(schemaVersion=1, profile=PROFILE, runId=request_id, task=task,
                          startedAt=started, finishedAt=_now(), inputSha256=input_hash,
                          reviewStatus='pending_qualified_review', rules=RULES,
                          sourceInventory=self._source_inventory(), sources=self._source_states())
            company_missing = any(t['code'].endswith('_missing') and t['code'].split('_missing')[0] in COMPANY_TASKS
                                  for t in report['tasks'])
            financial_count = sum(d['kind'] in FINANCIAL_KINDS for d in report['documents'])
            report['status'] = 'blocked' if (task == 'setup' and company_missing) or not financial_count else 'needs_review'
            _no_symlinks(run_root)
            run_root.mkdir(mode=0o700, exist_ok=True)
            # Write summary last: an incomplete/crashed run cannot look successful.
            _write_new(run_root / 'report.json', report)
            return self._complete(run_root, report)

    def _complete(self, run_root, report):
        summary_path = run_root / 'summary.json'
        if summary_path.exists():
            return json.loads(_read(summary_path, MAX_MANIFEST, private=True))
        if not (run_root / 'review.csv').exists():
            _write_new(run_root / 'review.csv', self._csv(report))
        summary = {key: report[key] for key in ['schemaVersion', 'profile', 'runId', 'task', 'status', 'startedAt', 'finishedAt']}
        summary.update(counts={'documents': len(report['documents']), 'payments': len(report['payments']),
                              'issues': len(report['issues']),
                              'duplicateCandidates': sum(bool(d['duplicateOf']) for d in report['documents']) + sum(bool(p['duplicateOf']) for p in report['payments'])},
                       tasks=report['tasks'], sources=report['sources'], deadlines=report['deadlines'])
        _write_new(summary_path, summary)
        return summary

    def _original_hash(self, relative):
        if not isinstance(relative, str) or not relative or len(relative) > 240:
            return None
        parts = Path(relative)
        if parts.is_absolute() or '..' in parts.parts or '.' in parts.parts:
            return None
        try:
            raw = _read(self.private / 'inbox' / parts, MAX_ORIGINAL)
            return hashlib.sha256(raw).hexdigest() if raw else None
        except (OSError, ValueError):
            return None

    def _prepare(self, data):
        issues, documents, totals = [], [], {}
        def issue(code, identifier=None):
            issues.append({'code': code, 'recordId': identifier})
        hashes, numbers = {}, {}
        for item in data.get('documents', []):
            identifier = item['id']
            kind = item.get('kind') if item.get('kind') in KINDS else None
            value, currency = _amount(item.get('amount')), _currency(item.get('currency'))
            sha = self._original_hash(item.get('path'))
            vendor, number = _text(item.get('vendor')), _text(item.get('invoiceNumber'))
            duplicate = hashes.get(sha) if sha else None
            # Invoice plus a separate payment receipt may describe the same charge.
            number_kind = 'charge' if kind in {'invoice', 'receipt'} else kind
            number_key = (vendor.casefold(), number_kind, number.casefold()) if vendor and number and kind else None
            duplicate = duplicate or (numbers.get(number_key) if number_key else None)
            doc = dict(id=identifier, path=_text(item.get('path'), 240), sha256=sha, kind=kind,
                       vendor=vendor, invoiceNumber=number, date=_day(item.get('date')),
                       amount=_money(value), currency=currency, direction=item.get('direction') if item.get('direction') in {'income', 'expense'} else None,
                       dueOn=_day(item.get('dueOn')), duplicateOf=duplicate,
                       taxClassification='unreviewed', paymentStatus='unmatched')
            if not sha:
                issue('original_unavailable', identifier)
            if not kind:
                issue('kind_missing', identifier)
            if kind in FINANCIAL_KINDS:
                for name, field in [('vendor', vendor), ('date', doc['date']), ('amount', value),
                                    ('currency', currency), ('direction', doc['direction'])]:
                    if field is None:
                        issue(name + '_missing', identifier)
                if kind in {'invoice', 'credit'} and not number:
                    issue('invoice_number_missing', identifier)
                if kind == 'receipt' and not number and not _text(item.get('numberException')):
                    issue('number_exception_missing', identifier)
                if 'netAmount' in item or 'taxAmount' in item:
                    net, tax = _amount(item.get('netAmount')), _amount(item.get('taxAmount'))
                    if None in (net, tax, value) or net + tax != value:
                        issue('amount_components_mismatch', identifier)
            if duplicate:
                issue('duplicate_candidate', identifier)
            if sha:
                hashes.setdefault(sha, identifier)
            if number_key:
                numbers.setdefault(number_key, identifier)
            documents.append(doc)
        # Neither member of an unresolved duplicate group enters provisional totals.
        duplicate_ids = {d['duplicateOf'] for d in documents if d['duplicateOf']}
        for doc in documents:
            if (doc['kind'] in FINANCIAL_KINDS and doc['sha256'] and doc['amount'] is not None
                    and doc['currency'] and doc['direction'] and not doc['duplicateOf'] and doc['id'] not in duplicate_ids):
                total = totals.setdefault(doc['currency'], {'income': Decimal(0), 'expense': Decimal(0)})
                total[doc['direction']] += Decimal(doc['amount'])
        payments, payment_totals, by_doc, payment_keys = [], {}, {}, {}
        for item in data.get('payments', []):
            value, currency = _amount(item.get('amount')), _currency(item.get('currency'))
            payment = {'id': item['id'], 'documentId': _text(item.get('documentId'), 80),
                       'amount': _money(value), 'currency': currency, 'date': _day(item.get('date')),
                       'sourceReference': _text(item.get('sourceReference'), 240), 'matchStatus': 'needs_review', 'duplicateOf': None}
            valid = value is not None and currency and payment['date'] and payment['sourceReference']
            if not valid:
                issue('payment_fields_missing', item['id'])
            if valid:
                key = (payment['sourceReference'], payment['date'], payment['currency'], value)
                payment['duplicateOf'] = payment_keys.get(key)
                payment_keys.setdefault(key, payment['id'])
                if payment['duplicateOf']:
                    issue('payment_duplicate_candidate', payment['id'])
            if not payment['documentId']:
                issue('payment_document_missing', item['id'])
            payment['_valid'] = bool(valid)
            payments.append(payment)
        duplicate_payment_ids = {p['duplicateOf'] for p in payments if p['duplicateOf']}
        for payment in payments:
            payment['_valid'] = payment['_valid'] and not payment['duplicateOf'] and payment['id'] not in duplicate_payment_ids
            if payment['_valid']:
                currency = payment['currency']
                payment_totals[currency] = payment_totals.get(currency, Decimal(0)) + Decimal(payment['amount'])
            if payment['documentId']:
                by_doc.setdefault(payment['documentId'], []).append((payment, payment['_valid']))
        doc_ids = {d['id'] for d in documents}
        for identifier in by_doc.keys() - doc_ids:
            issue('payment_document_missing', identifier)
        reconciliation = []
        for doc in documents:
            linked = by_doc.get(doc['id'], [])
            if not linked:
                if doc['kind'] in FINANCIAL_KINDS:
                    issue('payment_missing', doc['id'])
                continue
            if any(p['currency'] != doc['currency'] for p, _ in linked):
                issue('payment_currency_mismatch', doc['id'])
                continue
            if (any(not valid for _, valid in linked) or doc['amount'] is None or not doc['direction']
                    or not doc['sha256'] or doc['duplicateOf'] or doc['id'] in duplicate_ids):
                continue
            paid = sum((Decimal(p['amount']) for p, _ in linked), Decimal(0))
            expected = Decimal(doc['amount']) * (-1 if doc['direction'] == 'expense' else 1)
            matched = paid == expected
            doc['paymentStatus'] = 'matched_proposal' if matched else 'needs_review'
            for payment, _ in linked:
                payment['matchStatus'] = doc['paymentStatus']
            reconciliation.append({'documentId': doc['id'], 'currency': doc['currency'],
                                   'paid': _money(paid), 'expected': _money(expected), 'difference': _money(paid - expected)})
            if not matched:
                issue('payment_amount_mismatch', doc['id'])
        balances, balance_currencies = [], set()
        for item in data.get('balances', []):
            currency, opening, closing = _currency(item.get('currency')), _amount(item.get('opening')), _amount(item.get('closing'))
            if not currency or currency in balance_currencies:
                raise ValueError('Ungültige oder doppelte Währungsabstimmung.')
            balance_currencies.add(currency)
            complete = bool(payments) and not any(not p['_valid'] and p['currency'] in {currency, None} for p in payments)
            movement = payment_totals.get(currency, Decimal(0)) if complete else None
            expected = opening + movement if opening is not None and movement is not None else None
            difference = closing - expected if closing is not None and expected is not None else None
            balances.append({'currency': currency, 'opening': _money(opening), 'closing': _money(closing),
                             'movement': _money(movement), 'expectedClosing': _money(expected), 'difference': _money(difference), 'coverage': 'supplied_payments_only'})
            if difference is None or difference != 0:
                issue('balance_unknown' if difference is None else 'balance_difference')
        valid_evidence = {d['id'] for d in documents if d['sha256']}
        tasks = []
        for key, title in COMPANY_TASKS.items():
            fact = data.get('company', {}).get(key)
            if (not isinstance(fact, dict) or not _text(fact.get('value'))
                    or fact.get('evidenceDocumentId') not in valid_evidence or not _text(fact.get('reviewedBy'))):
                tasks.append({'code': key + '_missing', 'title': title})
        if not any(d['kind'] in FINANCIAL_KINDS for d in documents):
            tasks.append({'code': 'documents_missing', 'title': 'Freigegebenen Belegsatz mit Originalen und Metadaten bereitstellen.'})
        if not payments:
            tasks.append({'code': 'payments_missing', 'title': 'Reale Zahlungsnachweise und Anfangs-/Schlussbestände für den Abgleich bereitstellen.'})
        if balances:
            tasks.append({'code': 'bank_coverage_review', 'title': 'Zeitraum, Vollständigkeit und unabhängigen Banknachweis der bereitgestellten Zahlungen prüfen.'})
        if issues:
            tasks.append({'code': 'exceptions_review', 'title': 'Fehlende Angaben, mögliche Dubletten und Abgleichsdifferenzen im privaten Prüfexport klären.'})
        tasks.extend([
            {'code': 'einvoice_workflow', 'title': 'E-Rechnungspflichten anhand bestätigtem Steuerland prüfen; Originalablage und Korrekturen dokumentieren.'},
            {'code': 'qualified_review', 'title': 'Steuerliche Zuordnung, Umsatzsteuer und konkrete Abgabefristen qualifiziert prüfen lassen.'},
        ])
        deadlines = []
        for item in data.get('deadlines', []):
            url = urlparse(item.get('sourceUrl', '') if isinstance(item.get('sourceUrl'), str) else '')
            if (not _day(item.get('dueOn')) or not _text(item.get('title')) or not _text(item.get('reviewedBy'))
                    or item.get('evidenceDocumentId') not in valid_evidence or url.scheme != 'https'
                    or url.hostname not in OFFICIAL_HOSTS or url.username or url.password or url.query):
                issue('deadline_unconfirmed', item['id'])
                continue
            deadlines.append({key: item[key] for key in ['id', 'title', 'dueOn', 'sourceUrl', 'evidenceDocumentId', 'reviewedBy']})
        if len(deadlines) != len(data.get('deadlines', [])):
            tasks.append({'code': 'deadlines_unconfirmed', 'title': 'Nicht belegte Fristen mit Sachverhalt, amtlicher Quelle und Fachprüfung bestätigen.'})
        for payment in payments:
            payment.pop('_valid', None)
        return {'documents': documents, 'payments': payments, 'issues': issues, 'tasks': tasks,
                'company': data.get('company', {}), 'deadlines': deadlines,
                'totals': {c: {k: _money(v) for k, v in totals[c].items()} for c in totals},
                'balances': balances, 'reconciliation': reconciliation}

    @staticmethod
    def _csv(report):
        stream = io.StringIO(newline='')
        writer = csv.writer(stream)
        fields = ['id', 'kind', 'vendor', 'invoiceNumber', 'date', 'amount', 'currency', 'direction', 'path', 'sha256', 'duplicateOf', 'paymentStatus', 'taxClassification']
        writer.writerow(fields)
        for document in report['documents']:
            values = []
            for key in fields:
                value = str(document[key]) if document[key] is not None else ''
                if value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
                    value = "'" + value
                values.append(value)
            writer.writerow(values)
        return stream.getvalue()

    def export(self, run_id, format_name):
        self._guard()
        run_id = _request_id(run_id)
        if format_name not in {'json', 'csv'}:
            raise ValueError('Unbekanntes Exportformat.')
        root = self.private / 'runs' / run_id
        # Completed summary is mandatory; partial writes are never exported.
        _read(root / 'summary.json', MAX_MANIFEST, private=True)
        path = root / ('report.json' if format_name == 'json' else 'review.csv')
        return {'schemaVersion': 1, 'profile': PROFILE, 'runId': run_id, 'format': format_name,
                'content': _read(path, MAX_REPORT, private=True).decode('utf-8')}
