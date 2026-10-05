import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4


MODULE = Path(__file__).with_name('finance_core.py')
if MODULE.exists():
    spec = importlib.util.spec_from_file_location('finance_core', MODULE)
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)
else:
    core = None


class FinanceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(core, 'Der startbare Finanz-Prüfworkflow fehlt.')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'private/inbox').mkdir(parents=True)
        os.chmod(self.root / 'private', 0o700)
        self.manifest = {'schemaVersion': 1, 'company': {}, 'documents': [],
                         'payments': [], 'balances': [], 'deadlines': []}
        self.workspace = core.FinanceWorkspace(self.root, sources=[])

    def write(self):
        path = self.root / 'private/manifest.json'
        path.write_text(json.dumps(self.manifest))
        os.chmod(path, 0o600)

    def run_check(self, task='review', request_id=None):
        self.write()
        return self.workspace.run(task, request_id or str(uuid4()))

    def document(self, identifier='r1', path='original.xml', amount='100.00', currency='EUR', **extra):
        (self.root / 'private/inbox' / path).write_bytes(b'<original>unchanged</original>')
        return dict(id=identifier, path=path, kind='invoice', vendor='Fixture vendor',
                    invoiceNumber='INV-1', date='2026-10-01', amount=amount,
                    currency=currency, direction='expense', **extra)

    def test_empty_setup_is_real_run_but_bookkeeping_remains_blocked(self):
        result = self.run_check('setup')
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['task'], 'setup')
        self.assertEqual(result['counts']['documents'], 0)
        self.assertTrue(result['runId'])
        self.assertTrue(result['finishedAt'])
        self.assertEqual(result['deadlines'], [])
        self.assertTrue(any(t['code'] == 'legalForm_missing' for t in result['tasks']))
        self.assertTrue(any(t['code'] == 'taxResidence_missing' for t in result['tasks']))
        self.assertEqual(self.workspace.status()['lastRun'], result)

    def test_documents_create_review_export_and_leave_originals_unchanged(self):
        self.manifest['documents'] = [self.document()]
        path = self.root / 'private/inbox/original.xml'
        before = path.read_bytes()
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(export['documents'][0]['id'], 'r1')
        self.assertEqual(export['documents'][0]['amount'], '100.00')
        self.assertEqual(export['documents'][0]['taxClassification'], 'unreviewed')
        self.assertEqual(export['totals'], {'EUR': {'income': '0.00', 'expense': '100.00'}})
        self.assertTrue(export['inputSha256'])
        self.assertNotIn('Fixture vendor', json.dumps(run))

    def test_hash_and_invoice_duplicates_are_proposals_not_deletions_or_double_totals(self):
        self.manifest['documents'] = [self.document(), self.document('r2', 'copy.xml')]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertEqual(run['counts']['duplicateCandidates'], 1)
        self.assertEqual(export['totals'], {})
        self.assertTrue((self.root / 'private/inbox/copy.xml').exists())
        self.assertEqual(export['documents'][1]['duplicateOf'], 'r1')

    def test_repeated_request_reuses_same_run_and_rejects_changed_input(self):
        key = str(uuid4())
        first = self.run_check(request_id=key)
        second = self.workspace.run('review', key)
        self.assertEqual(first, second)
        self.assertEqual(len(list((self.root / 'private/runs').iterdir())), 1)
        self.manifest['documents'] = [self.document()]
        self.write()
        with self.assertRaises(ValueError):
            self.workspace.run('review', key)

    def test_missing_amount_stays_unknown_and_zero_is_preserved(self):
        self.manifest['documents'] = [self.document(amount=None)]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertIsNone(export['documents'][0]['amount'])
        self.assertEqual(export['totals'], {})
        self.assertIn('amount_missing', [i['code'] for i in export['issues']])
        self.manifest['documents'][0]['amount'] = '0.00'
        run2 = self.run_check()
        export2 = json.loads(self.workspace.export(run2['runId'], 'json')['content'])
        self.assertEqual(export2['documents'][0]['amount'], '0.00')

    def test_payments_in_different_currency_need_review_and_no_fx_is_invented(self):
        self.manifest['documents'] = [self.document(currency='USD')]
        self.manifest['payments'] = [{'id': 'p1', 'documentId': 'r1', 'amount': '-92.00',
            'currency': 'EUR', 'date': '2026-10-02', 'sourceReference': 'bank-fixture'}]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertIn('payment_currency_mismatch', [i['code'] for i in export['issues']])
        self.assertEqual(export['payments'][0]['matchStatus'], 'needs_review')
        self.assertEqual(export['totals'], {'USD': {'income': '0.00', 'expense': '100.00'}})

    def test_partial_payments_are_reconciled_as_sum_with_sign(self):
        self.manifest['documents'] = [self.document()]
        self.manifest['payments'] = [dict(id=identifier, documentId='r1', amount=amount,
            currency='EUR', date='2026-10-02', sourceReference='bank-fixture')
            for identifier, amount in [('p1', '-60.00'), ('p2', '-40.00')]]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertEqual(export['documents'][0]['paymentStatus'], 'matched_proposal')
        self.assertEqual(export['reconciliation'][0]['paid'], '-100.00')

    def test_balances_keep_missing_values_unknown_and_report_real_difference(self):
        self.manifest['balances'] = [{'currency': 'EUR', 'opening': '500.00', 'closing': '399.00'},
                                    {'currency': 'USD', 'opening': None, 'closing': None}]
        self.manifest['payments'] = [dict(id='p1', documentId=None, amount='-100.00',
            currency='EUR', date='2026-10-02', sourceReference='bank-fixture')]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertEqual(export['balances'][0]['expectedClosing'], '400.00')
        self.assertEqual(export['balances'][0]['difference'], '-1.00')
        self.assertIsNone(export['balances'][1]['expectedClosing'])

    def test_empty_or_invalid_payment_list_cannot_become_a_confirmed_zero_movement(self):
        self.manifest['balances'] = [{'currency': 'EUR', 'opening': '500.00', 'closing': '500.00'}]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertIsNone(export['balances'][0]['movement'])
        self.assertIsNone(export['balances'][0]['difference'])
        self.manifest['payments'] = [dict(id='p1', documentId=None, amount=None,
            currency='EUR', date='2026-10-02', sourceReference='bank-fixture')]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertIsNone(export['balances'][0]['expectedClosing'])

    def test_credit_and_invoice_numbers_do_not_create_a_false_duplicate(self):
        self.manifest['documents'] = [self.document(), self.document('c1', 'credit.xml', amount='-30.00')]
        (self.root / 'private/inbox/credit.xml').write_bytes(b'<credit>original</credit>')
        self.manifest['documents'][1]['kind'] = 'credit'
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertEqual(run['counts']['duplicateCandidates'], 0)
        self.assertEqual(export['totals']['EUR']['expense'], '70.00')

    def test_invoice_and_separate_receipt_for_same_invoice_are_duplicate_candidates(self):
        self.manifest['documents'] = [self.document(), self.document('receipt1', 'receipt.xml')]
        (self.root / 'private/inbox/receipt.xml').write_bytes(b'<receipt>payment receipt</receipt>')
        self.manifest['documents'][1]['kind'] = 'receipt'
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertEqual(run['counts']['duplicateCandidates'], 1)
        self.assertEqual(export['totals'], {})

    def test_copied_payment_cannot_turn_partial_payment_into_match(self):
        self.manifest['documents'] = [self.document()]
        self.manifest['payments'] = [dict(id=identifier, documentId='r1', amount='-50.00',
            currency='EUR', date='2026-10-02', sourceReference='bank-statement:line5')
            for identifier in ['p1', 'p2']]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertIn('payment_duplicate_candidate', [i['code'] for i in export['issues']])
        self.assertNotEqual(export['documents'][0]['paymentStatus'], 'matched_proposal')

    def test_same_payment_with_different_decimal_precision_is_still_a_duplicate(self):
        self.manifest['documents'] = [self.document()]
        self.manifest['payments'] = [dict(id=identifier, documentId='r1', amount=amount,
            currency='EUR', date='2026-10-02', sourceReference='bank-statement:line5')
            for identifier, amount in [('p1', '-50.00'), ('p2', '-50.0000')]]
        run = self.run_check()
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertIn('payment_duplicate_candidate', [i['code'] for i in export['issues']])
        self.assertNotEqual(export['documents'][0]['paymentStatus'], 'matched_proposal')

    def test_interrupted_export_write_is_recoverable_without_overwriting_report(self):
        run_id = str(uuid4())
        self.write()
        original_write = core._write_new
        def interrupted(path, data):
            if path.name == 'review.csv':
                raise OSError('fixture interrupted')
            original_write(path, data)
        core._write_new = interrupted
        try:
            with self.assertRaises(OSError): self.workspace.run('setup', run_id)
        finally:
            core._write_new = original_write
        report = self.root / 'private/runs' / run_id / 'report.json'
        before = report.read_bytes()
        result = self.workspace.run('setup', run_id)
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(report.read_bytes(), before)
        self.assertTrue((report.parent / 'summary.json').is_file())

    def test_private_workflow_sources_have_hashes_without_entering_summary(self):
        source = self.root / 'starter.xlsx'
        source.write_bytes(b'fixture-template')
        self.workspace.sources = [{'id': 'starter', 'label': 'Starter', 'role': 'template', 'path': str(source)}]
        run = self.run_check('setup')
        export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
        self.assertTrue(export['sourceInventory'][0]['sha256'])
        self.assertNotIn(str(source), json.dumps(run))

    def test_symlinks_and_traversal_cannot_read_other_private_data(self):
        self.manifest['documents'] = [self.document()]
        for path in ['../manifest.json', '/etc/passwd', 'linked']:
            if path == 'linked':
                (self.root / 'private/inbox/linked').symlink_to('/etc/passwd')
            self.manifest['documents'][0]['path'] = path
            run = self.run_check()
            export = json.loads(self.workspace.export(run['runId'], 'json')['content'])
            self.assertIn('original_unavailable', [i['code'] for i in export['issues']])
            self.assertIsNone(export['documents'][0]['sha256'])

    def test_unconfirmed_deadlines_and_company_claims_are_not_treated_as_facts(self):
        self.manifest['company']['legalForm'] = {'value': 'UG', 'evidenceDocumentId': 'missing'}
        self.manifest['deadlines'] = [dict(id='t1', title='Tax fixture', dueOn='2026-10-22',
            sourceUrl='https://example.com/rule', evidenceDocumentId='missing')]
        run = self.run_check('setup')
        self.assertEqual(run['deadlines'], [])
        self.assertIn('legalForm_missing', [t['code'] for t in run['tasks']])

    def test_verified_deadline_keeps_evidence_and_date(self):
        self.manifest['documents'] = [self.document()]
        self.manifest['deadlines'] = [dict(id='t1', title='Fixture deadline', dueOn='2026-11-01',
            sourceUrl='https://www.elster.de/elsterweb/infoseite/unternehmensgruendung',
            evidenceDocumentId='r1', reviewedBy='qualified-review-fixture')]
        run = self.run_check('setup')
        self.assertEqual(run['deadlines'][0]['dueOn'], '2026-11-01')

    def test_exports_are_private_and_csv_formula_injection_is_neutralized(self):
        self.manifest['documents'] = [self.document()]
        self.manifest['documents'][0]['vendor'] = '=CMD()'
        run = self.run_check()
        csv = self.workspace.export(run['runId'], 'csv')['content']
        self.assertIn("'=CMD()", csv)
        for path in (self.root / 'private/runs' / run['runId']).iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(ValueError):
            self.workspace.export('../manifest', 'json')

    def test_oversized_batch_and_duplicate_ids_fail_without_partial_success(self):
        self.manifest['documents'] = [self.document(str(i), str(i)+'.xml') for i in range(21)]
        with self.assertRaises(ValueError):
            self.run_check()
        self.manifest['documents'] = [self.document(), self.document('r1', 'other.xml')]
        with self.assertRaises(ValueError):
            self.run_check()


if __name__ == '__main__':
    unittest.main()
