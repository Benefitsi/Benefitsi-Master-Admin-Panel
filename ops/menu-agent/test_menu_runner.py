import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock

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

    def test_invalid_json_is_regenerated_once_with_the_original_source(self):
        # Real failure: the model used an unescaped closing quote in an OCR note.
        invalid = '{"note":"OCR: „PIDE 8,50"."}'
        draft = {"complete": True, "name": "Karte"}
        agent = Mock()
        agent.run_conversation.side_effect = [
            {"completed": True, "final_response": invalid},
            {"completed": True, "final_response": json.dumps(draft)},
        ]
        document = {"pages": [{"page": 1, "lines": [{"text": "PIDE 8,50 EUR"}]}]}
        self.assertEqual(runner.extract_draft(agent, document), draft)
        calls = agent.run_conversation.call_args_list
        self.assertEqual(len(calls), 2)
        for call in calls:
            self.assertIn(json.dumps(document, ensure_ascii=False), call.kwargs["user_message"])
        self.assertIn("JSON", calls[1].kwargs["user_message"])
        self.assertIn("Anführungszeichen", calls[1].kwargs["user_message"])

    def test_valid_json_is_returned_without_an_extra_model_call(self):
        agent = Mock()
        agent.run_conversation.return_value = {"completed": True, "final_response": '{"complete":true}'}
        self.assertEqual(runner.extract_draft(agent, {"pages": []}), {"complete": True})
        self.assertEqual(agent.run_conversation.call_count, 1)

    def test_repeated_invalid_json_stops_after_one_correction(self):
        agent = Mock()
        agent.run_conversation.return_value = {"completed": True, "final_response": '{"complete":'}
        with self.assertRaises(json.JSONDecodeError):
            runner.extract_draft(agent, {"pages": []})
        self.assertEqual(agent.run_conversation.call_count, 2)

    def test_partial_failed_and_incomplete_results_are_never_repaired_into_acceptance(self):
        for result in [
            {"completed": False, "final_response": '{"complete":'},
            {"completed": True, "partial": True, "final_response": '{"complete":'},
            {"completed": True, "error": "provider failure", "final_response": '{"complete":'},
        ]:
            with self.subTest(result=result):
                agent = Mock()
                agent.run_conversation.return_value = result
                with self.assertRaises(ValueError):
                    runner.extract_draft(agent, {"pages": []})
                self.assertEqual(agent.run_conversation.call_count, 1)
        agent = Mock()
        agent.run_conversation.return_value = {"completed": True, "final_response": '{"complete":false}'}
        self.assertEqual(runner.extract_draft(agent, {"pages": []}), {"complete": False})
        self.assertEqual(agent.run_conversation.call_count, 1)


if __name__ == "__main__":
    unittest.main()
