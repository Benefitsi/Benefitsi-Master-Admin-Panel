#!/usr/bin/env python3
"""Exercise real collector output through the Agent Admin consumer."""

import json
import plistlib
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import collect_runtime


def main() -> None:
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        profiles = root / "profiles"
        launch_agents = root / "LaunchAgents"
        profile = profiles / "worker"
        short_memory = profile / "memories"
        profiles.mkdir()
        launch_agents.mkdir()
        short_memory.mkdir(parents=True)
        (profile / "config.yaml").write_text(
            "model:\n  provider: safe\n  default: model\n",
            encoding="utf-8",
        )
        (profile / "SOUL.md").write_bytes(b"x" * (collect_runtime.MAX_CONTEXT_BYTES + 1))
        (profile / "MEMORY.md").write_bytes(b"\xff\xfe")
        (short_memory / "MEMORY.md").write_text("safe", encoding="utf-8")
        status_dir = profile / "logs"
        status_dir.mkdir()
        (status_dir / "latest.json").write_text(
            json.dumps({
                "checked_at": "2026-09-21T19:55:00Z",
                "status": "ok",
                "health": {"technical_ok": True},
            }),
            encoding="utf-8",
        )
        schedule_id = "ai.benefitsi.synthetic"
        with (launch_agents / f"{schedule_id}.plist").open("wb") as handle:
            plistlib.dump({"Label": schedule_id, "StartInterval": 1800}, handle)
        registry = root / "profile-registry.json"
        registry.write_text(json.dumps({
            "schemaVersion": 1,
            "profiles": [{
                "id": "worker",
                "scope": "benefitsi",
                "purpose": "Synthetic collector-to-Admin regression.",
                "citySlug": None,
                "hermesJobIds": [],
                "launchdSchedules": [{
                    "id": schedule_id,
                    "status": {"kind": "city-report", "path": "logs/latest.json"},
                }],
            }],
        }), encoding="utf-8")
        snapshot = collect_runtime.collect_snapshot(
            profiles,
            registry,
            launch_agents,
            datetime(2026, 9, 21, 20, 0, tzinfo=timezone.utc),
        )
        consumer = Path(__file__).with_name("collector_admin_consumer_integration.mjs")
        subprocess.run(
            ["node", "--import", "tsx", str(consumer)],
            cwd=Path(__file__).resolve().parents[2],
            input=json.dumps(snapshot),
            text=True,
            check=True,
        )


if __name__ == "__main__":
    main()
