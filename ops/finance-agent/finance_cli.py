"""Fixed bridge/MCP entry point. Private paths are supplied only by the owner CLI."""
import argparse
import json
from pathlib import Path
import sys
from finance_core import FinanceWorkspace, PROFILE


def workspace(root=None):
    project = Path.home() / 'Documents/Second-Brain/Patrick/02 - Projekte/Benefitsi'
    return FinanceWorkspace(root or Path.home() / '.hermes/profiles' / PROFILE, sources=[
        {'id': 'starter', 'label': 'Vorhandener Finanzstarter', 'role': 'template',
         'path': str(project / 'Finanzen/Benefitsi-Finanzstarter.xlsx')},
        {'id': 'sop', 'label': 'Vorhandene Finanz-SOP', 'role': 'workflow',
         'path': str(project / 'Founder OS/20260920-operations/sop-finance-agent.md')},
        {'id': 'formation_plan', 'label': 'Historischer Gründungsplan (kein aktueller Nachweis)', 'role': 'historical_context',
         'path': str(project / 'Founder OS/20260919T213156Z/finance-and-formation.md')},
    ])


def dispatch(data, root=None):
    if not isinstance(data, dict) or data.get('profile') != PROFILE or type(data.get('schemaVersion')) is not int or data.get('schemaVersion') != 1:
        raise ValueError('Ungültiger Finanzauftrag.')
    action = data.get('action')
    worker = workspace(root)
    if action == 'finance-status' and set(data) == {'action', 'profile', 'schemaVersion'}:
        return worker.status()
    if action == 'finance-run' and set(data) == {'action', 'profile', 'schemaVersion', 'task', 'requestId'}:
        return worker.run(data['task'], data['requestId'])
    if action == 'finance-export' and set(data) == {'action', 'profile', 'schemaVersion', 'runId', 'format'}:
        return worker.export(data['runId'], data['format'])
    raise ValueError('Unbekannte Finanzaktion.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path)
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(8193)
        if len(raw) > 8192:
            raise ValueError('Zu großer Finanzauftrag.')
        result = dispatch(json.loads(raw), args.root)
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        # Neither manifest content, filenames nor exception details enter bridge logs.
        print(json.dumps({'error': 'Finanzquelle nicht lesbar oder Auftrag ungültig.', 'code': 'FINANCE_UNAVAILABLE'}))
        sys.exit(1)
