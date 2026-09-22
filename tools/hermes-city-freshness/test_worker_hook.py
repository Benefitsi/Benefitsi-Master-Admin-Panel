import importlib.util
import hashlib
from pathlib import Path
import unittest

PATH=Path(__file__).with_name('prepare_worker_hook.py')
if PATH.exists():
    spec=importlib.util.spec_from_file_location('prepare_worker_hook',PATH)
    hook=importlib.util.module_from_spec(spec);spec.loader.exec_module(hook)
else:hook=None

class HookTests(unittest.TestCase):
    def test_hook_preserves_worker_bytes_and_refuses_other_runtime_changes(self):
        self.assertIsNotNone(hook)
        original=b'#!/bin/bash\nset -eu\ncd "$PROJECT_DIR"\n\n# Read-only preflight never claims work; the existing MCP claim remains authoritative.\nexit 0\n'
        expected=hashlib.sha256(original).hexdigest()
        candidate=hook.prepare(original,expected)
        self.assertIn(b'--config "$PROJECT_DIR/automation/city-freshness-config.json" --record',candidate)
        self.assertEqual(candidate.replace(hook.HOOK,b'',1),original)
        self.assertEqual(hook.prepare(candidate,expected),candidate)
        with self.assertRaises(ValueError):hook.prepare(original+b'# concurrent edit\n',expected)

if __name__=='__main__':unittest.main()
