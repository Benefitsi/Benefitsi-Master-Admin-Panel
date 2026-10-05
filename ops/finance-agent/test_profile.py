import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('finance_profile_installer', Path(__file__).with_name('install_profile.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class ProfileTests(unittest.TestCase):
    def test_model_auth_reuses_only_existing_model_key_and_preserves_global_source(self):
        with tempfile.TemporaryDirectory() as scratch:
            home = Path(scratch)
            h = home / '.hermes'
            profile = h / 'profiles/benefitsi-finance'
            profile.mkdir(parents=True)
            source = h / '.env'
            source.write_text("MINIMAX_API_KEY='fixture-not-real'\nBENEFITSI_MCP_KEY='fixture-private-db'\nARC_M1_BRIDGE_SECRET='fixture-private-bridge'\n")
            original = source.read_bytes()
            target = profile / '.env'
            target.write_text('# empty native profile\n')
            os.chmod(target, 0o600)
            (profile / 'config.yaml').write_text('model:\n  provider: minimax\n  default: MiniMax-M3.0\n')
            (profile / 'installation-receipt.json').write_text('{}')
            with patch.object(installer.Path, 'home', return_value=home):
                result = installer.reuse_existing_model_auth()
            self.assertTrue(result['existingModelCredentialReused'])
            self.assertFalse(result['productCredentialsCopied'])
            self.assertEqual(source.read_bytes(), original)
            self.assertIn("MINIMAX_API_KEY='fixture-not-real'", target.read_text())
            self.assertNotIn('BENEFITSI_MCP_KEY', target.read_text())
            self.assertNotIn('ARC_M1_BRIDGE_SECRET', target.read_text())
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            before = target.read_bytes()
            with patch.object(installer.Path, 'home', return_value=home):
                with self.assertRaises(ValueError): installer.reuse_existing_model_auth()
            self.assertEqual(before, target.read_bytes())
            receipt = json.loads((profile / 'installation-receipt.json').read_text())
            self.assertEqual(receipt['credentialScope'], 'existing_minimax_model_only')

    def test_config_excludes_inline_keys_and_ben_mcp_permissions(self):
        result = installer.config({'default': 'M3', 'provider': 'minimax', 'base_url': 'https://api.minimax.io/anthropic',
                                   'api_key': 'fixture-private'}, Path('/fixture/profile'), Path('/fixture/python'))
        self.assertNotIn('api_key', result['model'])
        self.assertEqual(list(result['mcp_servers']), ['benefitsi-finance'])
        self.assertEqual(result['toolsets'], ['skills'])


if __name__ == '__main__': unittest.main()
