"""Native M1 Hermes profile installation without cloning Ben secrets or tools."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import yaml

PROFILE = 'benefitsi-finance'


def reuse_existing_model_auth():
    """Reuse only the already authorized global model key, never Ben/DB/bridge access."""
    from dotenv import dotenv_values, set_key
    hermes = Path.home() / '.hermes'
    root = hermes / 'profiles' / PROFILE
    source, target = hermes / '.env', root / '.env'
    model = yaml.safe_load((root / 'config.yaml').read_text()).get('model', {})
    if model.get('provider') != 'minimax' or source.is_symlink() or target.is_symlink():
        raise ValueError('Inspected existing model route required.')
    if not target.is_file() or target.stat().st_mode & 0o077:
        raise ValueError('Owner-only native profile environment required.')
    existing = dotenv_values(target)
    if any(existing.values()):
        raise ValueError('Existing profile credentials require inspection.')
    original = source.read_bytes()
    key = dotenv_values(source).get('MINIMAX_API_KEY')
    if not key:
        raise ValueError('Existing model credential unavailable.')
    set_key(str(target), 'MINIMAX_API_KEY', key, quote_mode='always')
    os.chmod(target, 0o600)
    if source.read_bytes() != original:
        raise ValueError('Global environment changed during configuration.')
    actual = dotenv_values(target)
    if set(k for k, v in actual.items() if v) != {'MINIMAX_API_KEY'} or actual['MINIMAX_API_KEY'] != key:
        raise ValueError('Model-only credential configuration failed.')
    receipt_path = root / 'installation-receipt.json'
    receipt = json.loads(receipt_path.read_text())
    receipt.update(credentialsCopied=True, credentialScope='existing_minimax_model_only', productCredentialsCopied=False)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    os.chmod(receipt_path, 0o600)
    return {'profile': PROFILE, 'existingModelCredentialReused': True, 'productCredentialsCopied': False}


def config(model, root, python):
    # Select only non-secret model routing, not Ben config/.env/MCP credentials.
    selected = {key: model[key] for key in ('default', 'provider', 'base_url') if isinstance(model.get(key), str)}
    if not selected.get('default') or not selected.get('provider'):
        raise ValueError('Vorhandene Modellroute ist nicht belegt.')
    return {'model': selected, 'toolsets': ['skills'],
            'agent': {'max_turns': 6, 'run_budget_seconds': 45},
            'memory': {'memory_enabled': False, 'user_profile_enabled': False},
            'mcp_servers': {'benefitsi-finance': {'command': str(python),
                'args': ['-B', str(root / 'runtime/finance_mcp.py')],
                'env': {'PYTHONDONTWRITEBYTECODE': '1'}}}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-host', default='Macmini.vodafone.ultrahub')
    parser.add_argument('--reuse-existing-model-auth', action='store_true')
    args = parser.parse_args()
    host = subprocess.check_output(['hostname'], text=True).strip()
    if host != args.expected_host:
        raise SystemExit('Installation requires the inspected M1 host.')
    hermes = Path.home() / '.hermes'
    root = hermes / 'profiles' / PROFILE
    if root.exists() or root.is_symlink():
        raise SystemExit('Profile already exists; inspect before changing it.')
    python = hermes / 'hermes-agent/venv/bin/python'
    cli = python.with_name('hermes')
    baseline = yaml.safe_load((hermes / 'profiles/ben/config.yaml').read_text())
    profile_config = config(baseline.get('model', {}), root, python)
    source = Path(__file__).parent
    for name in ['finance_core.py', 'finance_cli.py', 'finance_mcp.py']:
        compile((source / name).read_text(), name, 'exec')
    created = subprocess.run([str(cli), 'profile', 'create', PROFILE, '--no-alias', '--no-skills',
        '--description', 'Buchhaltung & Steuern für Benefitsi: private Belegvorbereitung, Einrichtungscheck und offene Fachprüfung.'],
        capture_output=True, text=True, timeout=30)
    if created.returncode or not root.is_dir():
        raise SystemExit('Native Hermes profile creation failed; no secret details emitted.')
    os.chmod(root, 0o700)
    for directory in ['runtime', 'private', 'private/inbox', 'private/runs', 'skills/finance-review']:
        target = root / directory
        target.mkdir(parents=True, mode=0o700, exist_ok=True)
        os.chmod(target, 0o700)
    previous = root / 'config.yaml'
    if previous.exists():
        backup = hermes / 'backups' / ('finance-created-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
        backup.mkdir(mode=0o700)
        shutil.copy2(previous, backup / 'config.yaml')
        os.chmod(backup / 'config.yaml', 0o600)
    installed = []
    for relative, target in [
        ('profile/SOUL.md', root / 'SOUL.md'),
        ('profile/skills/finance-review/SKILL.md', root / 'skills/finance-review/SKILL.md'),
        ('profile/manifest.example.json', root / 'private/manifest.json'),
        *[(name, root / 'runtime' / name) for name in ['finance_core.py', 'finance_cli.py', 'finance_mcp.py']],
    ]:
        shutil.copy2(source / relative, target)
        os.chmod(target, 0o600)
        installed.append({'file': str(target.relative_to(root)), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    previous.write_text(yaml.safe_dump(profile_config, allow_unicode=True, sort_keys=False))
    os.chmod(previous, 0o600)
    installed.append({'file': 'config.yaml', 'sha256': hashlib.sha256(previous.read_bytes()).hexdigest()})
    receipt = {'profile': PROFILE, 'host': host, 'installedAt': datetime.now(timezone.utc).isoformat(),
               'path': str(root), 'files': installed, 'credentialsCopied': False, 'schedulerAdded': False}
    path = root / 'installation-receipt.json'
    path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    os.chmod(path, 0o600)
    print(json.dumps({'profile': PROFILE, 'path': str(root), 'files': len(installed),
                      'credentialsCopied': False, 'schedulerAdded': False}))
    if args.reuse_existing_model_auth:
        print(json.dumps(reuse_existing_model_auth()))


if __name__ == '__main__': main()
