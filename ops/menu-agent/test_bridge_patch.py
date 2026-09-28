import importlib.util
from pathlib import Path
import unittest
import io

spec = importlib.util.spec_from_file_location("installer", Path(__file__).with_name("install_bridge.py"))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

# The relevant interface, deliberately without production secrets or data.
SOURCE = '''from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
ALLOWED_PROFILES = {"nova", "ben"}
class Handler:
    def body(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size > 500000:
            raise ValueError("Anfrage ist zu groß.")
        return json.loads(self.rfile.read(size) or b"{}")
    def do_POST(self):
        if not self.authorized():
            return self.send_json({"error": "Nicht autorisiert."}, 401)
        try:
            data = self.body()
            return self.send_json({"error": "Unbekannte Aktion."}, 400)
        except ValueError as error:
            return self.send_json({"error": str(error)}, 400)
'''


class BridgePatchTests(unittest.TestCase):
    def handler(self):
        import json
        import sys
        from unittest.mock import patch
        service_spec = importlib.util.spec_from_file_location("benefitsi_menu_service", Path(__file__).with_name("benefitsi_menu_service.py"))
        service = importlib.util.module_from_spec(service_spec)
        service_spec.loader.exec_module(service)
        scope = {"json": json}
        with patch.dict(sys.modules, {"benefitsi_menu_service": service}):
            exec(installer.patched_bridge(SOURCE), scope)
        self.assertEqual(scope["ALLOWED_PROFILES"], {"nova", "ben"})
        return scope, scope["Handler"]()

    def test_larger_body_is_only_accepted_by_exact_menu_endpoint(self):
        _, handler = self.handler()
        handler.headers = {"Content-Length": "600002"}
        for path in ["/hermes", "/hermes/menu-extract?x=1", "/obsidian", "/hermes/menu-extract-extra"]:
            handler.path = path
            handler.rfile = io.BytesIO(b"{}" + b" " * 600000)
            with self.subTest(path=path), self.assertRaises(ValueError):
                handler.body()
        handler.path = "/hermes/menu-extract"
        self.assertEqual(handler.body(), {})
        for size in ["-1", str(6 * 1024 * 1024 + 1)]:
            handler.headers["Content-Length"] = size
            with self.assertRaises(ValueError): handler.body()

    def test_authentication_precedes_body_and_dispatch(self):
        _, handler = self.handler()
        handler.authorized = lambda: False
        handler.send_json = lambda payload, status=200: status
        handler.body = lambda: self.fail("Unauthorized body read")
        self.assertEqual(handler.do_POST(), 401)

    def test_busy_agent_returns_429(self):
        scope, handler = self.handler()
        handler.authorized = lambda: True
        handler.body = lambda: {}
        handler.path = "/hermes/menu-extract"
        handler.send_json = lambda payload, status=200: status
        def busy(_): raise scope["MenuAgentBusy"]()
        scope["extract_menu"] = busy
        self.assertEqual(handler.do_POST(), 429)

    def test_unknown_or_already_patched_bridge_is_not_overwritten(self):
        for source in [SOURCE.replace("500000", "400000"), installer.patched_bridge(SOURCE)]:
            with self.assertRaises(ValueError): installer.patched_bridge(source)

    def test_embedded_child_script_imports_are_preserved(self):
        source = SOURCE + '\nCHILD_SCRIPT = """\nfrom pathlib import Path\n"""\n'
        patched = installer.patched_bridge(source)
        self.assertTrue(patched.endswith('CHILD_SCRIPT = """\nfrom pathlib import Path\n"""\n'))
        self.assertEqual(patched.count("from benefitsi_menu_service import"), 1)


if __name__ == "__main__":
    unittest.main()
