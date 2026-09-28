#!/usr/bin/env python3
"""Isolated, deterministic source review stage for the existing hourly M1 worker.

It never calls a model or a content-writing RPC. A changed readable-source hash
is a review candidate, never a claim that particular business facts changed.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
import urllib.error
import urllib.request
from uuid import UUID

ROOT = Path('/Users/patrick/.hermes')
OWNER = 'm1_city_freshness'
INTERVAL_SECONDS = 259200
MAX_SOURCES = 20
MAX_RPC_BYTES = 512_000


def instant(value):
    parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('timezone_required')
    return parsed.astimezone(timezone.utc)


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def fingerprint(page):
    # Raw HTML changes (tracking attributes, styles) do not create reviews.
    # This fingerprint still does not prove unchanged editorial facts.
    text = ' '.join(str(page.get('text') or '').split())
    links = sorted({str(link.get('url')) for link in page.get('links', []) if isinstance(link, dict) and isinstance(link.get('url'), str)})
    return hashlib.sha256(json.dumps([text, links], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def permitted(source, city_id):
    return (source.get('city_id') == city_id and source.get('active') is True
            and source.get('enabled') is True and source.get('cadence') != 'manual'
            and source.get('cadence_owner') == OWNER and source.get('auto_publish') is False
            and source.get('interval_seconds') == INTERVAL_SECONDS)


def page_error(page, source, now):
    if page.get('available') is not True or not isinstance(page.get('http_status'), int) or not 200 <= page['http_status'] < 300:
        return 'source_unavailable'
    if page.get('url') != source['url']:
        return 'redirect_changed'
    if page.get('truncated') is not False or page.get('parser_status') != 'text_extracted' or not str(page.get('text') or '').strip():
        return 'incomplete_source'
    try:
        age = (now - instant(page['retrieved_at'])).total_seconds()
        if not -5 <= age <= 3600 or not re.fullmatch(r'[a-f0-9]{64}', str(page.get('sha256') or '')):
            return 'invalid_receipt'
    except (KeyError, TypeError, ValueError):
        return 'invalid_receipt'
    return None


def run_inventory(inventory, *, profile, fetch, record=None, now=None, max_sources=MAX_SOURCES):
    if (inventory.get('schema_version') != 1 or inventory.get('city_profile') != profile
            or profile != 'city-' + str(inventory.get('city_slug'))
            or not re.fullmatch(r'city-[a-z0-9][a-z0-9-]{0,79}', profile)):
        raise ValueError('city_profile_mismatch')
    city_id = str(UUID(inventory['city_id']))
    rows = inventory.get('sources')
    if not isinstance(rows, list) or len(rows) > 200:
        raise ValueError('inventory_invalid_or_truncated')
    if len({row.get('id') for row in rows}) != len(rows):
        raise ValueError('duplicate_source_inventory')
    limit = max(1, min(int(max_sources), MAX_SOURCES))
    fixed_now = instant(now) if now else None
    counts = dict(configured=int(inventory.get('configured_count', len(rows))), due=0, checked=0,
                  failed=0, deferred=0, not_due=0, excluded=int(inventory.get('excluded_count', 0)),
                  baseline=0, changed=0, unchanged=0, stale=0, needs_review=0, recorded=0, record_failed=0)
    report = dict(schema_version=1, profile=profile, city_id=city_id, city_slug=inventory['city_slug'],
                  checked_at=now or timestamp(), counts=counts, sources=[], public_data_changed=False,
                  field_facts_verified=False, city_current=False, provider_calls=0)
    if inventory.get('enabled') is not True:
        report['status'] = 'disabled'
        return report
    cache = {}
    for source in rows:
        if not permitted(source, city_id):
            counts['excluded'] += 1
            continue
        if source.get('due') is not True:
            counts['not_due'] += 1
            continue
        counts['due'] += 1
        if counts['checked'] + counts['failed'] >= limit:
            counts['deferred'] += 1
            continue
        attempted = now or timestamp()
        if source['url'] not in cache:
            try:
                cache[source['url']] = (fetch(source['url']), None)
            except Exception as error:
                http_error = error if isinstance(error, urllib.error.HTTPError) else error.__cause__
                http = http_error.code if isinstance(http_error, urllib.error.HTTPError) else None
                cache[source['url']] = ({'http_status': http}, 'fetch_failed')
        page, error_code = cache[source['url']]
        if error_code is None:
            error_code = page_error(page, source, fixed_now or datetime.now(timezone.utc))
        current = fingerprint(page) if error_code is None else None
        previous = source.get('previous_fingerprint')
        comparison = 'unverified' if error_code else ('baseline' if previous is None else ('unchanged' if previous == current else 'changed'))
        stale_fields = source.get('stale_fields') or []
        unknown_fields = source.get('unknown_fields') or []
        needs_review = bool(error_code or comparison == 'changed' or stale_fields or unknown_fields)
        counts['failed' if error_code else 'checked'] += 1
        if comparison != 'unverified':
            counts[comparison] += 1
        counts['stale'] += int(bool(stale_fields))
        counts['needs_review'] += int(needs_review)
        result = dict(source_id=source['id'], source_url=source['url'], comparison=comparison,
                      before_fingerprint=previous, after_fingerprint=current, error_code=error_code,
                      stale_fields=stale_fields, unknown_fields=unknown_fields, review_needed=needs_review)
        if record is not None:
            payload = dict(schema_version=1, profile=profile, source_id=source['id'],
                           source_updated_at=source['source_updated_at'], window_start=source['window_start'],
                           proof_signature=source['proof_signature'], attempted_at=attempted,
                           fetch_status='failed' if error_code else 'available', http_status=page.get('http_status'),
                           source_sha256=None if error_code else page['sha256'], fingerprint=current, error_code=error_code)
            try:
                receipt = record(payload)
                UUID(str(receipt.get('check_id')))
                if receipt.get('source_id') != source['id'] or receipt.get('public_data_changed') is not False:
                    raise ValueError('record_receipt_mismatch')
                result['check_id'] = receipt['check_id']
                result['review_job_id'] = receipt.get('review_job_id')
                result['persisted_comparison'] = receipt.get('comparison')
                counts['recorded'] += 1
            except Exception:
                counts['record_failed'] += 1
                result['record_error'] = 'record_or_readback_failed'
        report['sources'].append(result)
    report['status'] = ('not_configured' if not rows else 'partial' if counts['failed'] or counts['record_failed'] or counts['deferred']
                        else 'recorded' if counts['recorded'] else 'observed' if counts['checked'] else 'not_due')
    return report


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class Runtime:
    def __init__(self, profile):
        automation = ROOT / 'projects/benefitsi/automation'
        sys.path.insert(0, str(automation))
        preflight = load_module('freshness_existing_preflight', automation / 'sources_budget_preflight.py')
        os.environ.update(preflight.load_profile_environment(profile))
        self.server = load_module('freshness_existing_mcp', ROOT / 'projects/benefitsi/mcp/server.py')
        self.profile = profile
        self.city_scope = self.server._profile_city_scope()
        if not self.city_scope:
            raise ValueError('city_profile_scope_missing')

    def rpc(self, name, payload):
        if name not in ('city_freshness_inventory', 'record_city_freshness_review'):
            raise ValueError('rpc_not_permitted')
        base, key = self.server._admin_configuration()
        encoded = json.dumps(payload, allow_nan=False, separators=(',', ':')).encode()
        if len(encoded) > 16000:
            raise ValueError('rpc_payload_too_large')
        request = urllib.request.Request(base + '/rest/v1/rpc/' + name, data=encoded, method='POST',
                  headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
            raw = response.read(MAX_RPC_BYTES + 1)
        if len(raw) > MAX_RPC_BYTES:
            raise ValueError('rpc_response_too_large')
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError('rpc_response_invalid')
        return result

    def inventory(self):
        result = self.rpc('city_freshness_inventory', {'p_city_slug': self.profile[5:]})
        if result.get('city_id') != self.city_scope:
            raise ValueError('city_profile_scope_mismatch')
        return result

    def fetch(self, url):
        return self.server._fetch_city_source(url, max_chars=30_000)

    def record(self, payload):
        return self.rpc('record_city_freshness_review', {'p_city_slug': self.profile[5:], 'p_result': payload})


def atomic_report(path, report):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    temporary.replace(path)


def run_profile(profile, record_results):
    if not re.fullmatch(r'city-[a-z0-9][a-z0-9-]{0,79}', profile):
        raise ValueError('invalid_profile')
    directory = ROOT / 'profiles' / profile / 'logs/city-freshness'
    if not (ROOT / 'profiles' / profile / 'config.yaml').is_file():
        raise ValueError('profile_not_configured')
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'active.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'profile': profile, 'status': 'already_running'}
        runtime = Runtime(profile)
        inventory = runtime.inventory()
        report = run_inventory(inventory, profile=profile, fetch=runtime.fetch, record=runtime.record if record_results else None)
        if report['counts']['recorded']:
            readback = {row['id']: row for row in runtime.inventory()['sources']}
            for source in report['sources']:
                if source.get('check_id') and readback.get(source['source_id'], {}).get('last_check_id') != source['check_id']:
                    report['counts']['record_failed'] += 1
                    report['status'] = 'partial'
                    source['record_error'] = 'persisted_check_readback_mismatch'
        atomic_report(directory / 'latest.json', report)
        return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--profile')
    target.add_argument('--config', type=Path)
    parser.add_argument('--record', action='store_true')
    args = parser.parse_args(argv)
    try:
        if args.config:
            config = json.loads(args.config.read_text())
            if config.get('schema_version') != 1 or not isinstance(config.get('profiles'), list) or len(config['profiles']) > 20:
                raise ValueError('invalid_dispatch_config')
            if config.get('enabled') is not True:
                print(json.dumps({'status': 'disabled', 'profiles_run': 0}))
                return 0
            selected = [row['profile'] for row in config['profiles'] if row.get('enabled') is True]
            if len(set(selected)) != len(selected) or any(not re.fullmatch(r'city-[a-z0-9][a-z0-9-]{0,79}', name) for name in selected):
                raise ValueError('invalid_dispatch_profiles')
            failed = 0
            attempted = 0
            deferred = 0
            reports = []
            deadline = time.monotonic() + 900
            for profile in selected:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    deferred += 1
                    reports.append({'profile': profile, 'status': 'deferred_dispatch_budget'})
                    continue
                command = [sys.executable, str(Path(__file__).resolve()), '--profile', profile]
                if args.record:
                    command.append('--record')
                attempted += 1
                try:
                    completed = subprocess.run(command, timeout=remaining, check=False, capture_output=True, text=True)
                    failed += int(completed.returncode != 0)
                    if len(completed.stdout) > MAX_RPC_BYTES:
                        raise ValueError('child_report_too_large')
                    reports.append(json.loads(completed.stdout))
                except subprocess.TimeoutExpired:
                    failed += 1
                    reports.append({'profile': profile, 'status': 'dispatch_timeout'})
            print(json.dumps({'status': 'partial' if failed or deferred else 'dispatched', 'profiles_selected': len(selected),
                              'profiles_run': attempted, 'profiles_deferred': deferred, 'failed': failed, 'reports': reports}, ensure_ascii=False))
            return 20 if failed or deferred else 0
        result = run_profile(args.profile, args.record)
        print(json.dumps(result, ensure_ascii=False))
        return 20 if result.get('counts', {}).get('record_failed') else 0
    except Exception as error:
        # Never emit transport errors, credentials, source prose or tracebacks.
        print(json.dumps({'status': 'failed', 'error_code': 'freshness_stage_failed', 'error_type': type(error).__name__}))
        return 20


if __name__ == '__main__':
    raise SystemExit(main())
