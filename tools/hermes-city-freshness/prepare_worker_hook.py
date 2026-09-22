#!/usr/bin/env python3
"""Prepare a reviewed worker candidate. Never install or overwrite the input."""
import argparse
import hashlib
import json
from pathlib import Path

ANCHOR = b'# Read-only preflight never claims work; the existing MCP claim remains authoritative.\n'
HOOK = b'''# BEGIN BENEFITSI CITY FRESHNESS V1
if [ -f "$PROJECT_DIR/automation/city_freshness_runner.py" ] && [ -f "$PROJECT_DIR/automation/city-freshness-config.json" ]; then
  "/Users/patrick/.hermes/hermes-agent/venv/bin/python" "$PROJECT_DIR/automation/city_freshness_runner.py" \\
    --config "$PROJECT_DIR/automation/city-freshness-config.json" --record > "$USAGE_DIR/$RUN_ID-city-freshness.json" \\
    || echo "Benefitsi source review stage failed; see $RUN_ID-city-freshness.json" >&2
fi
# END BENEFITSI CITY FRESHNESS V1

'''


def prepare(worker, expected_sha256):
    count = worker.count(b'# BEGIN BENEFITSI CITY FRESHNESS V1')
    if count and (count != 1 or worker.count(HOOK) != 1):
        raise ValueError('existing_freshness_hook_changed')
    baseline = worker.replace(HOOK, b'', 1) if count else worker
    if hashlib.sha256(baseline).hexdigest() != expected_sha256:
        raise ValueError('installed_worker_drift_requires_review')
    if baseline.count(ANCHOR) != 1:
        raise ValueError('worker_anchor_missing_or_ambiguous')
    return baseline.replace(ANCHOR, HOOK + ANCHOR, 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args()
    if args.worker.resolve() == args.output.resolve() or (args.output.exists() and args.worker.samefile(args.output)):
        raise ValueError('candidate_must_not_overwrite_input')
    candidate = prepare(args.worker.read_bytes(), args.expected_sha256)
    args.output.write_bytes(candidate)
    print(json.dumps({'output': str(args.output), 'sha256': hashlib.sha256(candidate).hexdigest(), 'installed': False}))


if __name__ == '__main__':
    main()
