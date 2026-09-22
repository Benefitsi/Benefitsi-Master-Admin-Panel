"""Install the narrow menu route with an exact-source check and rollback copy.

Run on M1 after staging and testing the profile's runtime. This only patches
the existing authenticated bridge; it neither changes its secret nor binds a
new listener. Service restarts are explicit operations outside this script.
"""
import argparse
import datetime
import hashlib
from pathlib import Path
import os
import shutil
import tempfile


def patched_bridge(source):
    replacements = [
        ("from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer\nfrom pathlib import Path\n",
         "from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer\nfrom pathlib import Path\nfrom benefitsi_menu_service import MAX_BODY_BYTES, MenuAgentBusy, extract_menu\n"),
        ('        if size > 500000:\n',
         '        limit = MAX_BODY_BYTES if self.path == "/hermes/menu-extract" else 500000\n        if size < 0 or size > limit:\n'),
        ('            data = self.body()\n',
         '            data = self.body()\n            if self.path == "/hermes/menu-extract":\n                return self.send_json(extract_menu(data))\n'),
    ]
    if "from benefitsi_menu_service import" in source:
        raise ValueError("Bridge already has a menu integration; inspect before updating.")
    for before, after in replacements:
        if source.count(before) != 1:
            raise ValueError("Bridge structure changed; inspect before installing.")
        source = source.replace(before, after, 1)
    start = source.index("    def do_POST(self):")
    before = "        except ValueError as error:\n"
    if source[start:].count(before) != 1:
        raise ValueError("POST error handling changed; inspect before installing.")
    source = source[:start] + source[start:].replace(before,
        '        except MenuAgentBusy:\n            return self.send_json({"error": "Der Menü-Agent ist ausgelastet."}, 429)\n' + before, 1)
    compile(source, "m1_bridge.py", "exec")
    return source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-sha256", required=True)
    args = parser.parse_args()
    bridge = Path.home() / ".arc-m1-bridge/m1_bridge.py"
    if bridge.is_symlink():
        raise SystemExit("Refusing symlinked bridge")
    raw = bridge.read_bytes()
    if hashlib.sha256(raw).hexdigest() != args.expected_sha256:
        raise SystemExit("Bridge changed since review; no changes made")
    patched = patched_bridge(raw.decode())
    service = Path(__file__).with_name("benefitsi_menu_service.py")
    compile(service.read_text(), service.name, "exec")
    runtime = Path.home() / ".hermes/profiles/benefitsi-menu/runtime"
    if not (runtime / "menu-ocr").is_file() or not (runtime / "hermes_menu_runner.py").is_file():
        raise SystemExit("Tested menu runtime must be installed first")
    backup = bridge.with_name("m1_bridge.before-menu-" + datetime.datetime.now().strftime("%Y%m%dT%H%M%S") + ".py")
    if backup.exists():
        raise SystemExit("Backup already exists")
    shutil.copy2(bridge, backup)
    target = bridge.with_name(service.name)
    if target.exists():
        raise SystemExit("Service already exists; inspect before updating")
    shutil.copy2(service, target)
    os.chmod(target, 0o600)
    with tempfile.NamedTemporaryFile(dir=bridge.parent, delete=False) as staged:
        staged.write(patched.encode())
    try:
        os.chmod(staged.name, bridge.stat().st_mode & 0o777)
        # Recheck immediately before replacement to protect concurrent edits.
        if bridge.read_bytes() != raw:
            raise SystemExit("Bridge changed during installation")
        os.replace(staged.name, bridge)
    finally:
        Path(staged.name).unlink(missing_ok=True)
    print("Installed menu route. Rollback copy: " + str(backup))


if __name__ == "__main__":
    main()
