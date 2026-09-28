import importlib.util
import unittest
from unittest.mock import patch
import tempfile
import json
import io
from contextlib import redirect_stdout
from pathlib import Path

MODULE = Path(__file__).with_name('city_freshness_runner.py')
if MODULE.exists():
    spec = importlib.util.spec_from_file_location('city_freshness_runner', MODULE)
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
else:
    runner = None

CITY = 'b9e684e4-54b3-41ff-8f97-4426423893c2'
SOURCE = '44444444-4444-4444-8444-444444444444'
NOW = '2026-09-22T08:00:00Z'

def source(**extra):
    return dict(id=SOURCE, city_id=CITY, url='https://example.org/operator', active=True,
                enabled=True, cadence='daily', cadence_owner='m1_city_freshness',
                interval_seconds=259200, auto_publish=False, due=True,
                source_updated_at='2026-09-20T08:00:00Z', window_start='2026-09-20T00:00:00Z',
                proof_signature='c'*32,
                previous_fingerprint=None, stale_fields=[], unknown_fields=[], **extra)

def inventory(rows):
    return dict(schema_version=1,city_id=CITY,city_slug='annweiler',city_profile='city-annweiler',
                enabled=True,sources=rows,configured_count=len(rows),excluded_count=0)

def page(**extra):
    result=dict(url='https://example.org/operator',available=True,http_status=200,
                parser_status='text_extracted',truncated=False,text='Öffnungszeiten Dienstag 11:00 – 22:00',
                sha256='a'*64,retrieved_at=NOW,links=[])
    result.update(extra)
    return result

class FreshnessTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(runner, 'The isolated review-only stage must exist')

    def test_disabled_manual_and_foreign_owner_sources_are_not_fetched(self):
        rows=[]
        for index,changes in enumerate(({'enabled':False},{'cadence':'manual'},{'cadence_owner':'m1_daily_preflight'},{'active':False})):
            row=source();row.update(changes);row['id']=f'00000000-0000-4000-8000-{index:012d}';rows.append(row)
        result=runner.run_inventory(inventory(rows),profile='city-annweiler',fetch=lambda _:self.fail('must not fetch'),now=NOW)
        self.assertEqual(result['counts']['checked'],0)
        self.assertEqual(result['counts']['excluded'],4)

    def test_unchanged_source_never_claims_verified_fields_or_publication(self):
        row=source();row['previous_fingerprint']=runner.fingerprint(page())
        result=runner.run_inventory(inventory([row]),profile='city-annweiler',fetch=lambda _:page(),now=NOW)
        self.assertEqual(result['sources'][0]['comparison'],'unchanged')
        self.assertFalse(result['field_facts_verified'])
        self.assertFalse(result['public_data_changed'])
        self.assertEqual(result['counts']['unchanged'],1)

    def test_changed_source_produces_hash_diff_and_retains_stale_fact_warning(self):
        row=source();row.update(previous_fingerprint='b'*64,stale_fields=['opening_hours.2'])
        result=runner.run_inventory(inventory([row]),profile='city-annweiler',fetch=lambda _:page(),now=NOW)
        self.assertEqual(result['sources'][0]['comparison'],'changed')
        self.assertEqual(result['sources'][0]['before_fingerprint'],'b'*64)
        self.assertEqual(result['counts']['stale'],1)
        self.assertEqual(result['counts']['needs_review'],1)

    def test_redirect_truncation_and_http_failures_cannot_be_no_change(self):
        for response in (page(url='https://example.org/other'),page(truncated=True),page(http_status=404)):
            result=runner.run_inventory(inventory([source()]),profile='city-annweiler',fetch=lambda _,p=response:p,now=NOW)
            self.assertEqual(result['sources'][0]['comparison'],'unverified')
            self.assertEqual(result['counts']['failed'],1)
            self.assertEqual(result['counts']['needs_review'],1)

    def test_not_due_and_bounded_batches_do_not_fetch_extra_sources(self):
        row=source();row['due']=False
        result=runner.run_inventory(inventory([row]),profile='city-annweiler',fetch=lambda _:self.fail('not due'),now=NOW)
        self.assertEqual(result['counts']['not_due'],1)
        self.assertEqual(result['counts']['deferred'],0)
        rows=[source() for _ in range(3)]
        for index,row in enumerate(rows):row['id']=f'00000000-0000-4000-8000-{index:012d}'
        result=runner.run_inventory(inventory(rows),profile='city-annweiler',fetch=lambda _:page(),now=NOW,max_sources=2)
        self.assertEqual(result['counts']['checked'],2)
        self.assertEqual(result['counts']['deferred'],1)
        self.assertEqual(result['status'],'partial')

    def test_profile_mismatch_fails_before_fetch(self):
        with self.assertRaises(ValueError):
            runner.run_inventory(inventory([source()]),profile='city-other',fetch=lambda _:self.fail('wrong city'),now=NOW)

    def test_exception_metadata_does_not_leak_source_body_or_secret_text(self):
        def fail(_):raise RuntimeError('Bearer SECRET customer@example.org')
        result=runner.run_inventory(inventory([source()]),profile='city-annweiler',fetch=fail,now=NOW)
        self.assertEqual(result['sources'][0]['error_code'],'fetch_failed')
        self.assertNotIn('SECRET',str(result))
        self.assertNotIn('customer@example.org',str(result))

    def test_empty_inventory_is_not_reported_as_completed_city_verification(self):
        result=runner.run_inventory(inventory([]),profile='city-annweiler',fetch=lambda _:self.fail('empty'),now=NOW)
        self.assertEqual(result['status'],'not_configured')
        self.assertFalse(result['city_current'])

    def test_source_failure_is_fetched_once_when_multiple_entities_share_the_url(self):
        calls=[]
        def fail(url):calls.append(url);raise TimeoutError()
        second=source();second['id']='55555555-5555-4555-8555-555555555555'
        result=runner.run_inventory(inventory([source(),second]),profile='city-annweiler',fetch=fail,now=NOW)
        self.assertEqual(calls,['https://example.org/operator'])
        self.assertEqual(result['counts']['failed'],2)

    def test_recording_uses_only_review_rpc_fields_and_validates_the_receipt(self):
        payloads=[]
        def record(payload):
            payloads.append(payload)
            return dict(check_id='66666666-6666-4666-8666-666666666666',source_id=SOURCE,public_data_changed=False,comparison='baseline')
        result=runner.run_inventory(inventory([source()]),profile='city-annweiler',fetch=lambda _:page(),record=record,now=NOW)
        self.assertEqual(result['counts']['recorded'],1)
        self.assertEqual(set(payloads[0]),{'schema_version','profile','source_id','source_updated_at','window_start','proof_signature','attempted_at','fetch_status','http_status','source_sha256','fingerprint','error_code'})
        self.assertNotIn('Öffnungszeiten',str(payloads))
        bad=runner.run_inventory(inventory([source()]),profile='city-annweiler',fetch=lambda _:page(),record=lambda _:dict(check_id=None,public_data_changed=False),now=NOW)
        self.assertEqual(bad['counts']['record_failed'],1)
        self.assertEqual(bad['status'],'partial')

    def test_dispatch_budget_does_not_claim_unstarted_profiles_ran(self):
        with tempfile.TemporaryDirectory() as temporary:
            config=Path(temporary)/'config.json'
            config.write_text(json.dumps(dict(schema_version=1,enabled=True,profiles=[dict(profile='city-annweiler',enabled=True)])))
            output=io.StringIO()
            with patch.object(runner.time,'monotonic',side_effect=[0,901]), patch.object(runner.subprocess,'run') as child, redirect_stdout(output):
                status=runner.main(['--config',str(config),'--record'])
            child.assert_not_called()
            report=json.loads(output.getvalue())
            self.assertEqual(report['profiles_run'],0)
            self.assertEqual(report['profiles_deferred'],1)
            self.assertEqual(report['status'],'partial')
            self.assertEqual(status,20)

    def test_link_target_change_changes_the_fingerprint_without_claiming_dead_links(self):
        self.assertNotEqual(runner.fingerprint(page(links=[{'url':'https://example.org/old'}])),runner.fingerprint(page(links=[{'url':'https://example.org/new'}])))

if __name__ == '__main__':unittest.main()
