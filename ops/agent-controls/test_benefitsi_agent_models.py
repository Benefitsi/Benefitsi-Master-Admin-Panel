import contextlib
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name('benefitsi_agent_models.py')

class NativeFixture:
    def __init__(self, root):
        self.root = root
        self.fail_save = False
        self.wrong_readback = False
    def read(self):
        return json.loads((self.root / 'config.yaml').read_text())
    def catalog(self, cfg):
        return [{'slug': 'openai-api', 'name': 'OpenAI API', 'models': ['test-a', 'test-b'],
                 'source': 'hermes', 'api_key': 'DO_NOT_EXPOSE', 'api_url': 'https://private.invalid'}]
    def switch(self, cfg, provider, model):
        return types.SimpleNamespace(success=True, target_provider=provider, new_model=model,
                                     api_mode='chat_completions', base_url='', api_key='DO_NOT_EXPOSE')
    def persist(self, cfg, result):
        if self.fail_save:
            raise RuntimeError('secret material in native exception')
        out = dict(cfg)
        out['model'] = {'provider': result.target_provider, 'default': result.new_model}
        if self.wrong_readback:
            out['model']['default'] = 'wrong'
        (self.root / 'config.yaml').write_text(json.dumps(out))

class AgentModels(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MODULE.exists(), 'Missing bounded native model adapter')
        spec = importlib.util.spec_from_file_location('model_adapter_fixture', MODULE)
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'config.yaml').write_text(json.dumps({'model': {'provider': 'openai-api', 'default': 'test-a'},
                                                        'other': {'preserved': True}}))
        self.native = NativeFixture(self.root)
        @contextlib.contextmanager
        def scope(profile):
            yield self.native
        self.addCleanup(patch.stopall)
        patch.object(self.mod, '_profile_root', return_value=self.root).start()
        patch.object(self.mod, '_native_scope', side_effect=scope).start()
    def req(self, action='model-options', profile='ben', **kwargs):
        return self.mod._request_in_process({'schemaVersion': 1, 'action': action, 'profileId': profile, **kwargs})
    def apply(self, **kwargs):
        args = dict(provider='openai-api', model='test-b', expectedProvider='openai-api',
                    expectedModel='test-a', confirmed=True,expectedRevision=self.mod._revision(self.native.read(),self.root))
        args.update(kwargs)
        return self.req('model-apply', **args)
    def test_catalog_projects_only_safe_fields(self):
        result = self.req()
        self.assertEqual(result['current'], {'provider':'openai-api', 'model':'test-a'})
        self.assertEqual(result['providers'][0]['models'][1], {'id':'test-b','label':'test-b'})
        self.assertNotIn('DO_NOT_EXPOSE', json.dumps(result))
        self.assertNotIn('private.invalid', json.dumps(result))
    def test_rejects_unconfirmed_apply_without_changes(self):
        before = (self.root / 'config.yaml').read_bytes()
        with self.assertRaisesRegex(ValueError, '^confirmation_required$'): self.apply(confirmed=False)
        self.assertEqual((self.root / 'config.yaml').read_bytes(), before)
    def test_validated_native_persistence_is_read_back_and_preserves_other_config(self):
        result = self.apply()
        self.assertEqual(result['current']['model'], 'test-b')
        self.assertTrue(result['readbackVerified'])
        self.assertTrue(self.native.read()['other']['preserved'])
        self.assertNotIn('DO_NOT_EXPOSE', json.dumps(result))
    def test_unknown_provider_and_model_do_not_change_config(self):
        before = (self.root / 'config.yaml').read_bytes()
        for kwargs, code in [({'provider':'unknown'},'unauthenticated_provider'),({'model':'no-such-model'},'unavailable_model')]:
            with self.assertRaisesRegex(ValueError, '^'+code+'$'): self.apply(**kwargs)
        self.assertEqual((self.root / 'config.yaml').read_bytes(), before)
    def test_direct_apply_requires_revision_without_any_mutation(self):
        with self.assertRaisesRegex(ValueError, '^invalid_request$'):
            self.apply(expectedRevision=None)
        self.assertEqual(self.native.read()['model']['default'],'test-a')

    def test_stale_readback_guard_rejects_write(self):
        with self.assertRaisesRegex(ValueError, '^configuration_changed$'): self.apply(expectedModel='old')
        with self.assertRaisesRegex(ValueError, '^configuration_changed$'): self.apply(expectedRevision='0'*64)
        self.assertEqual(self.native.read()['model']['default'], 'test-a')
    def test_same_value_preserves_file_and_does_not_resolve_credentials(self):
        before = (self.root / 'config.yaml').stat().st_mtime_ns
        self.native.switch = lambda *args: self.fail('Same selection must not perform native switch')
        result = self.apply(model='test-a')
        self.assertFalse(result['changed'])
        self.assertTrue(result['readbackVerified'])
        self.assertEqual((self.root / 'config.yaml').stat().st_mtime_ns, before)
    def test_native_failure_never_exposes_exception_and_readback_failure_is_not_success(self):
        self.native.fail_save = True
        with self.assertRaisesRegex(ValueError, '^persist_failed$'): self.apply()
        self.native.fail_save = False
        self.native.wrong_readback = True
        with self.assertRaisesRegex(ValueError, '^readback_failed$'): self.apply()
    def test_strict_allowlist_and_actions_reject_arbitrary_fields(self):
        with self.assertRaisesRegex(ValueError, '^unsupported_profile$'): self.req(profile='studio')
        with self.assertRaisesRegex(ValueError, '^invalid_request$'): self.req(command='whoami')
        with self.assertRaisesRegex(ValueError, '^invalid_request$'): self.req(action='exec')
    def test_malformed_request_types_fail_closed(self):
        for kwargs in ({'schemaVersion':True}, {'profileId':[]}, {'action':[]}):
            data={'schemaVersion':1,'profileId':'ben','action':'model-options',**kwargs}
            with self.assertRaisesRegex(ValueError, '^invalid_request$'):
                self.mod._request_in_process(data)

    def test_native_persistence_uses_installed_common_lock_and_preserves_unrelated_fields(self):
        import threading
        config = types.ModuleType('hermes_cli.config')
        config.save_config = lambda cfg: (self.root / 'config.yaml').write_text(json.dumps(cfg))
        switch = types.ModuleType('hermes_cli.model_switch')
        switch.apply_model_selection = lambda cfg, result: {'provider':result.target_provider,'default':result.new_model}
        common = types.ModuleType('hermes_cli.web_routers._common')
        common._CONFIG_MUTATION_LOCK = threading.RLock()
        modules={'hermes_cli.config':config,'hermes_cli.model_switch':switch,
                 'hermes_cli.web_routers._common':common}
        with patch.dict('sys.modules', modules):
            try:
                self.mod._Native().persist(self.native.read(), self.native.switch({},'openai-api','test-b'))
            except ImportError:
                self.fail('Native persistence did not use installed common lock')
        self.assertTrue(self.native.read()['other']['preserved'])
        self.assertEqual(self.native.read()['model']['default'], 'test-b')

    def test_menu_selection_controls_real_v2_route_with_explicit_budget_readiness_limit(self):
        result=self.req(profile='benefitsi-menu')
        self.assertTrue(result['starter']['appliesToNewJobs'])
        self.assertTrue(result['starter']['limitations'])

    def test_direct_finance_apply_is_rejected_before_native_work_or_config_write(self):
        before=(self.root/'config.yaml').read_bytes()
        self.native.catalog=lambda *a: self.fail('Finance must not resolve catalog before rejecting save')
        with self.assertRaisesRegex(ValueError, '^deterministic_profile$'):
            self.req('model-apply',profile='benefitsi-finance',provider='openai-api',model='test-b',expectedProvider='openai-api',expectedModel='test-a',confirmed=True,expectedRevision=self.mod._revision(self.native.read(),self.root))
        self.assertEqual((self.root/'config.yaml').read_bytes(),before)

    def test_finance_truthfully_describes_deterministic_existing_workflow(self):
        result = self.req(profile='benefitsi-finance')
        self.assertEqual(result['starter']['mode'], 'deterministic')
        self.assertFalse(result['starter']['appliesToNewJobs'])
        self.assertTrue(result['starter']['limitations'])

if __name__ == '__main__': unittest.main()
