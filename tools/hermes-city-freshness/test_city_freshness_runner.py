import importlib.util
import unittest
from unittest.mock import patch
import tempfile
import json
import io
from types import SimpleNamespace
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

    def test_typed_host_denial_is_report_only_and_keeps_existing_database_failure_contract(self):
        payloads=[]
        def fail(_):raise runner.SourceHostNotApproved('SECRET untrusted details')
        def record(payload):
            payloads.append(payload)
            return dict(check_id='66666666-6666-4666-8666-666666666666',source_id=SOURCE,public_data_changed=False,comparison='unverified')
        result=runner.run_inventory(inventory([source()]),profile='city-annweiler',fetch=fail,record=record,now=NOW)
        self.assertEqual(result['sources'][0].get('failure_reason'),'host_not_approved')
        self.assertEqual(result['sources'][0]['error_code'],'fetch_failed')
        self.assertEqual(result['sources'][0]['comparison'],'unverified')
        self.assertEqual(result['counts']['failed'],1)
        self.assertEqual(payloads[0]['error_code'],'fetch_failed')
        self.assertNotIn('failure_reason',payloads[0])
        self.assertNotIn('SECRET',str(result))

    def test_plain_exception_text_cannot_impersonate_a_host_policy_diagnostic(self):
        def fail(_):raise RuntimeError('host_not_approved City source domain is not approved for this MCP.')
        result=runner.run_inventory(inventory([source()]),profile='city-annweiler',fetch=fail,now=NOW)
        self.assertNotIn('failure_reason',result['sources'][0])

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


class RuntimeHostTests(unittest.TestCase):
    def runtime(self, profile='city-annweiler', hosts=None):
        directory=tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        policy=Path(directory.name)/'hosts.json'
        policy.write_text(json.dumps({'schema_version':1,'profiles':{'city-annweiler':{'exact_hosts':hosts or ['www.baeckerei-neu.de']}}}))
        original_hosts={'already-approved.example.org'}
        server=SimpleNamespace(APPROVED_CITY_SOURCE_EXACT_HOSTS=original_hosts,
            _profile_city_scope=lambda:CITY)
        # DNS and transport remain the existing server's responsibility. This
        # double asserts delegation and exact host semantics only.
        server._approved_city_source_host=lambda host:host.casefold().rstrip('.') in server.APPROVED_CITY_SOURCE_EXACT_HOSTS
        server._fetch_city_source=lambda url,max_chars:dict(url=url,max_chars=max_chars)
        with patch.object(runner,'SOURCE_HOSTS_PATH',policy), patch.object(runner,'load_module',side_effect=[SimpleNamespace(load_profile_environment=lambda _:{}),server]), patch.object(runner.sys,'path',list(runner.sys.path)):
            runtime=runner.Runtime(profile)
        return runtime,original_hosts

    def test_profile_enrollment_adds_exact_hosts_only_without_mutating_shared_policy(self):
        runtime,original=self.runtime()
        self.assertEqual(original,{'already-approved.example.org'})
        self.assertEqual(runtime.fetch('https://www.baeckerei-neu.de/filialen/'),{'url':'https://www.baeckerei-neu.de/filialen/','max_chars':30000})
        self.assertEqual(runtime.fetch('https://already-approved.example.org/')['max_chars'],30000)
        for host in ('baeckerei-neu.de','other.baeckerei-neu.de','www.baeckerei-neu.de.evil.org','unreviewed.example.org'):
            with self.assertRaises(runner.SourceHostNotApproved):runtime.fetch('https://'+host+'/')

    def test_other_profiles_do_not_receive_annweiler_business_hosts(self):
        runtime,_=self.runtime(profile='city-landau')
        with self.assertRaises(runner.SourceHostNotApproved):runtime.fetch('https://www.baeckerei-neu.de/')

    def test_host_policy_rejects_wildcards_urls_addresses_ports_and_noncanonical_names(self):
        for host in ('*.example.org','https://example.org','127.0.0.1','[::1]','localhost','example.org:443','example.org/path','EXAMPLE.org','example.org.','-bad.example.org','example..org','example.org-'):
            with self.subTest(host=host), self.assertRaises(ValueError):self.runtime(hosts=[host])

    def test_existing_fetch_guards_are_still_called_and_their_errors_are_not_reclassified(self):
        runtime,_=self.runtime()
        for url in ('http://www.baeckerei-neu.de/','https://name:secret@www.baeckerei-neu.de/','https://www.baeckerei-neu.de:8443/'):
            with patch.object(runtime.server,'_fetch_city_source',side_effect=ValueError('existing guard')) as fetch:
                with self.assertRaisesRegex(ValueError,'existing guard'):runtime.fetch(url)
                fetch.assert_called_once_with(url,max_chars=30000)

if __name__ == '__main__':unittest.main()
