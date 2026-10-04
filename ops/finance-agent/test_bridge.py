import importlib.util
import sys
import types
from pathlib import Path
import unittest
from uuid import uuid4


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


service = load('finance_service', 'benefitsi_finance_service.py')
installer = load('finance_installer', 'install_bridge.py')

SOURCE = '''from benefitsi_menu_service import MAX_BODY_BYTES, MenuAgentBusy, extract_menu
class Handler:
    def do_POST(self):
        if not self.authorized():
            return self.send_json({'error': 'unauthorized'}, 401)
        try:
            data = self.body()
            if self.path == '/hermes/menu-extract':
                return self.send_json(extract_menu(data))
            return self.send_json({'error': 'unknown'}, 400)
        except ValueError:
            return self.send_json({'error': 'invalid'}, 400)
'''


class BridgeTests(unittest.TestCase):
    def test_finance_route_keeps_existing_auth_and_menu_route(self):
        called = []
        menu = types.ModuleType('benefitsi_menu_service')
        menu.MAX_BODY_BYTES, menu.MenuAgentBusy = 500000, ValueError
        menu.extract_menu = lambda data: {'menu': True}
        finance = types.ModuleType('benefitsi_finance_service')
        finance.finance_request = lambda data: called.append(data) or {'profile': 'benefitsi-finance'}
        saved = {k: sys.modules.get(k) for k in [menu.__name__, finance.__name__]}
        try:
            sys.modules.update({menu.__name__: menu, finance.__name__: finance})
            scope = {}
            exec(installer.patched_bridge(SOURCE), scope)
            handler = scope['Handler']()
            handler.authorized = lambda: False
            handler.send_json = lambda payload, status=200: (status, payload)
            handler.path = '/hermes/finance'
            handler.body = lambda: {'action': 'finance-status'}
            self.assertEqual(handler.do_POST()[0], 401)
            self.assertEqual(called, [])
            handler.authorized = lambda: True
            self.assertEqual(handler.do_POST(), (200, {'profile': 'benefitsi-finance'}))
            self.assertEqual(called, [{'action': 'finance-status'}])
            handler.path = '/hermes/menu-extract'
            self.assertEqual(handler.do_POST(), (200, {'menu': True}))
        finally:
            for key, previous in saved.items():
                if previous is None: sys.modules.pop(key, None)
                else: sys.modules[key] = previous

    def test_unknown_or_already_modified_bridge_is_refused(self):
        for source in [SOURCE.replace('data = self.body()', 'data = {}'), installer.patched_bridge(SOURCE)]:
            with self.assertRaises(ValueError): installer.patched_bridge(source)

    def test_requests_cannot_supply_paths_prompts_models_or_other_profiles(self):
        base = {'schemaVersion': 1, 'profile': 'benefitsi-finance', 'action': 'finance-status'}
        service.validate_request(base)
        for data in [dict(base, path='/etc/passwd'), dict(base, prompt='publish'), dict(base, profile='ben'),
                     dict(base, action='chat'), dict(base, schemaVersion=True)]:
            with self.assertRaises(ValueError): service.validate_request(data)
        service.validate_request(dict(base, action='finance-run', task='setup', requestId=str(uuid4())))


if __name__ == '__main__': unittest.main()
