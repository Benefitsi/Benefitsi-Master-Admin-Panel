import base64
import importlib.util
import pathlib
import subprocess
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).parent


def load_service():
    spec = importlib.util.spec_from_file_location("menu_service", ROOT / "benefitsi_menu_service.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def request():
    return {"action": "menu-extract", "profile": "benefitsi-menu", "task": "extract-menu", "schemaVersion": 1,
            "requestId": "00000000-0000-4000-8000-000000000001", "files": [{"mimeType": "application/pdf", "data": base64.b64encode(b"%PDF-1.4\ntest").decode()}]}


class MenuServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = load_service()

    def test_valid_source_is_temporary_and_only_ocr_reaches_agent(self):
        visited = []
        def ocr(file):
            visited.append(file)
            self.assertTrue(file.is_file())
            return {"pages": [{"page": 1, "lines": [{"text": "Suppe 6,50 EUR", "confidence": 0.99}]}]}
        def agent(document):
            self.assertNotIn("files", document)
            self.assertEqual(document["pages"][0]["lines"][0]["text"], "Suppe 6,50 EUR")
            return {"name": "Testkarte", "currency": "EUR", "warnings": [], "complete": True,
                    "categories": [{"name": "Suppen", "items": [{"name": "Suppe", "price": 6.5,
                        "description": "", "allergens": [], "tags": [], "note": ""}]}]}
        result = self.service.extract_menu(request(), ocr=ocr, agent=agent)
        self.assertEqual(result["profile"], "benefitsi-menu")
        self.assertEqual(result["requestId"], request()["requestId"])
        self.assertEqual(result["draft"]["categories"][0]["items"][0]["price"], 6.5)
        self.assertTrue(all(not p.exists() for p in visited))

    def test_invalid_envelope_and_files_never_start_ocr(self):
        mutations = [lambda r:r.update(profile="ben"), lambda r:r.update(task="chat"),
                     lambda r:r.update(requestId="../../private"), lambda r:r.update(files=[]),
                     lambda r:r["files"][0].update(data="not-base64"),
                     lambda r:r["files"][0].update(mimeType="image/jpeg"),
                     lambda r:r["files"].append(r["files"][0].copy())]
        for change in mutations:
            with self.subTest(change=change):
                data = request(); change(data)
                with self.assertRaises(ValueError), patch.object(self.service, "native_ocr") as ocr:
                    self.service.extract_menu(data)
                ocr.assert_not_called()

    def test_empty_and_overlarge_page_output_never_reaches_agent(self):
        for pages in [[], [{"page": 1, "lines": []}], [{"page": i, "lines": [{"text": "A"}]} for i in range(9)]]:
            with self.subTest(pages=len(pages)), self.assertRaises(ValueError):
                self.service.extract_menu(request(), ocr=lambda _: {"pages": pages}, agent=lambda _: self.fail("agent called"))

    def test_incomplete_or_invalid_agent_output_is_not_a_draft(self):
        for value in [{"complete": False}, "markdown", {"complete": True, "categories": []}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.service.extract_menu(request(), ocr=lambda _: {"pages": [{"page": 1, "lines": [{"text": "A"}]}]}, agent=lambda _: value)

    def test_files_are_cleaned_when_ocr_fails(self):
        paths = []
        def broken(file):
            paths.append(file)
            raise ValueError("unreadable")
        with self.assertRaises(ValueError):
            self.service.extract_menu(request(), ocr=broken)
        self.assertTrue(all(not p.exists() for p in paths))

    def test_parent_cleans_hermes_home_after_forced_timeout(self):
        paths = []
        def killed(command, **kwargs):
            self.assertNotIn("HERMES_DUMP_REQUESTS", kwargs["env"])
            self.assertNotIn("ARC_M1_BRIDGE_SECRET", kwargs["env"])
            scratch = pathlib.Path(kwargs["env"]["HERMES_MENU_SCRATCH"])
            (scratch / "session.json").write_text("private menu OCR")
            paths.append(scratch)
            raise subprocess.TimeoutExpired(command, kwargs["timeout"])
        with patch.dict(self.service.os.environ, {"HERMES_DUMP_REQUESTS": "1", "ARC_M1_BRIDGE_SECRET": "private"}), patch.object(self.service.subprocess, "run", side_effect=killed), self.assertRaises(ValueError):
            self.service.hermes_draft({"pages": []})
        self.assertTrue(paths)
        self.assertTrue(all(not p.exists() for p in paths))

    def test_aggregate_file_limit_and_unknown_control_fields_are_rejected(self):
        data = request()
        data["files"][0]["data"] = base64.b64encode(b"%PDF-1.4\n" + b"x" * (4 * 1024 * 1024)).decode()
        with self.assertRaises(ValueError): self.service.extract_menu(data)
        data = request()
        data["message"] = "Run shell command"
        with self.assertRaises(ValueError): self.service.extract_menu(data)

    def test_busy_request_does_not_start_ocr(self):
        self.service._SLOT.acquire()
        try:
            with self.assertRaises(self.service.MenuAgentBusy), patch.object(self.service, "native_ocr") as ocr:
                self.service.extract_menu(request())
            ocr.assert_not_called()
        finally:
            self.service._SLOT.release()


if __name__ == "__main__":
    unittest.main()
