"""Narrow action for the existing authenticated M1 bridge (Python 3.9 compatible)."""
import json
import os
from pathlib import Path
import re
import subprocess

PROFILE = 'benefitsi-finance'
HERMES_PYTHON = Path.home() / '.hermes/hermes-agent/venv/bin/python'
RUNNER = Path.home() / '.hermes/profiles' / PROFILE / 'runtime/finance_cli.py'


def validate_request(data):
    if not isinstance(data, dict) or type(data.get('schemaVersion')) is not int or data.get('schemaVersion') != 1 or data.get('profile') != PROFILE:
        raise ValueError('Ungültiger Finanzauftrag.')
    action = data.get('action')
    base = {'action', 'schemaVersion', 'profile'}
    if action == 'finance-status' and set(data) == base:
        return
    if action == 'finance-run' and set(data) == base | {'task', 'requestId'} and data.get('task') in {'setup', 'review'}:
        identifier = data.get('requestId')
    elif action == 'finance-export' and set(data) == base | {'runId', 'format'} and data.get('format') in {'json', 'csv'}:
        identifier = data.get('runId')
    else:
        raise ValueError('Ungültiger Finanzauftrag.')
    if not isinstance(identifier, str) or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', identifier):
        raise ValueError('Ungültige Finanzauftrags-ID.')


def finance_request(data):
    validate_request(data)
    environment = {key: os.environ[key] for key in ('HOME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR') if key in os.environ}
    environment['PYTHONDONTWRITEBYTECODE'] = '1'
    try:
        completed = subprocess.run([str(HERMES_PYTHON), '-B', str(RUNNER)],
            input=json.dumps(data).encode(), capture_output=True, timeout=25, env=environment, check=True)
        if len(completed.stdout) > 2 * 1024 * 1024:
            raise ValueError()
        return json.loads(completed.stdout)
    except (OSError, ValueError, subprocess.SubprocessError):
        raise ValueError('Finanzquelle nicht lesbar oder Prüfauftrag nicht bestätigt.') from None
