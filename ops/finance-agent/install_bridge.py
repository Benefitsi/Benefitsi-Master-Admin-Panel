"""Patch only the inspected authenticated bridge; never change its credentials."""
import argparse
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import shutil
import tempfile


def patched_bridge(source):
    import_anchor = 'from benefitsi_menu_service import MAX_BODY_BYTES, MenuAgentBusy, extract_menu\n'
    dispatch_anchor = '            data = self.body()\n'
    if 'from benefitsi_finance_service import' in source:
        raise ValueError('Finance integration exists; inspect before updating.')
    if source.count(import_anchor) != 1 or source.count(dispatch_anchor) != 1:
        raise ValueError('Bridge changed; installation refused.')
    source = source.replace(import_anchor, import_anchor + 'from benefitsi_finance_service import finance_request\n', 1)
    source = source.replace(dispatch_anchor, dispatch_anchor +
        '            if self.path == "/hermes/finance":\n                return self.send_json(finance_request(data))\n', 1)
    compile(source, 'm1_bridge.py', 'exec')
    return source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args()
    bridge = Path.home() / '.arc-m1-bridge/m1_bridge.py'
    service = bridge.with_name('benefitsi_finance_service.py')
    if bridge.is_symlink() or service.exists():
        raise SystemExit('Unexpected existing bridge/service; no change.')
    raw = bridge.read_bytes()
    if hashlib.sha256(raw).hexdigest() != args.expected_sha256:
        raise SystemExit('Bridge changed since inspection; no change.')
    patched = patched_bridge(raw.decode())
    runtime = Path.home() / '.hermes/profiles/benefitsi-finance/runtime/finance_cli.py'
    if not runtime.is_file():
        raise SystemExit('Tested finance runtime must be installed first.')
    source = Path(__file__).with_name(service.name)
    compile(source.read_text(), source.name, 'exec')
    backup = bridge.with_name('m1_bridge.before-finance-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.py')
    if backup.exists():
        raise SystemExit('Backup exists; no change.')
    shutil.copy2(bridge, backup)
    os.chmod(backup, 0o600)
    staged_path = None
    try:
        shutil.copy2(source, service)
        os.chmod(service, 0o600)
        with tempfile.NamedTemporaryFile(dir=bridge.parent, delete=False) as staged:
            staged_path = Path(staged.name)
            staged.write(patched.encode())
        os.chmod(staged_path, bridge.stat().st_mode & 0o777)
        if bridge.read_bytes() != raw:
            raise ValueError('Bridge changed during installation.')
        os.replace(staged_path, bridge)
    except Exception:
        service.unlink(missing_ok=True)
        raise
    finally:
        if staged_path:
            staged_path.unlink(missing_ok=True)
    print('Installed finance route; rollback: ' + str(backup))


if __name__ == '__main__':
    main()
