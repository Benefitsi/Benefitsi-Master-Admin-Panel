import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("runner", Path(__file__).with_name("hermes_menu_runner.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def test_json_shaped_partial_response_is_never_accepted(self):
        partial = {"complete": True, "categories": [{"name": "Only first page"}]}
        for flags in [{}, {"completed": False}, {"completed": True, "partial": True},
                      {"completed": True, "failed": True}, {"completed": True, "error": "truncated"},
                      {"completed": True, "interrupted": True}]:
            with self.subTest(flags=flags), self.assertRaises(ValueError):
                runner.parse_result({"final_response": json.dumps(partial), **flags})

    def test_completed_json_is_returned_for_service_schema_validation(self):
        draft = {"complete": True}
        self.assertEqual(runner.parse_result({"final_response": json.dumps(draft), "completed": True}), draft)

    def test_markdown_or_truncated_json_is_rejected(self):
        for value in ['```json\n{"complete":true}\n```', '{"complete":', '', None]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                runner.parse_result({"final_response": value, "completed": True})


if __name__ == "__main__":
    unittest.main()
