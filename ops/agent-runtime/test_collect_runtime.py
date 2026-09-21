import hashlib
import importlib.util
import io
import json
import os
import plistlib
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock
from datetime import datetime, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("collect_runtime.py")
SPEC = importlib.util.spec_from_file_location("collect_runtime", MODULE_PATH)
collect_runtime = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = collect_runtime
SPEC.loader.exec_module(collect_runtime)

SECRET = "SYNTHETIC_CREDENTIAL_SENTINEL_DO_NOT_LEAK"
PROMPT = "SYNTHETIC_PROMPT_SENTINEL_DO_NOT_LEAK"
OBSERVED_AT = datetime(2026, 9, 21, 20, 0, tzinfo=timezone.utc)


class Fixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.profiles = self.root / "profiles"
        self.launch_agents = self.root / "LaunchAgents"
        self.profiles.mkdir()
        self.launch_agents.mkdir()
        self.registry = self.root / "profile-registry.json"

    def close(self):
        self.temp.cleanup()

    def profile(self, profile_id, config=None):
        path = self.profiles / profile_id
        path.mkdir(parents=True)
        if config is not None:
            (path / "config.yaml").write_text(config, encoding="utf-8")
        return path

    def write_registry(self, profiles):
        self.registry.write_text(
            json.dumps({"schemaVersion": 1, "profiles": profiles}),
            encoding="utf-8",
        )

    def collect(self):
        return collect_runtime.collect_snapshot(
            profiles_root=self.profiles,
            registry_path=self.registry,
            launch_agents_root=self.launch_agents,
            observed_at=OBSERVED_AT,
        )


def registry_profile(profile_id, scope="benefitsi", **overrides):
    profile = {
        "id": profile_id,
        "scope": scope,
        "purpose": "Geprüfte synthetische Aufgabe.",
        "citySlug": None,
        "hermesJobIds": [],
        "launchdSchedules": [],
    }
    profile.update(overrides)
    return profile


def write_plist(root, label, **overrides):
    payload = {"Label": label, "StartInterval": 3600, "RunAtLoad": True}
    for key, value in overrides.items():
        if value is None:
            payload.pop(key, None)
        else:
            payload[key] = value
    with (root / f"{label}.plist").open("wb") as handle:
        plistlib.dump(payload, handle)


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.fx = Fixture()

    def tearDown(self):
        self.fx.close()

    def test_snapshot_is_metadata_only_and_uses_exact_v1_contract(self):
        ben = self.fx.profile(
            "ben",
            "model:\n  provider: minimax\n  default: MiniMax-M3.0\n"
            f"agent:\n  system_prompt: {PROMPT}\n"
            f"mcp_servers:\n  benefitsi:\n    env:\n      TOKEN: {SECRET}\n",
        )
        (ben / "SOUL.md").write_text(f"identity {PROMPT}", encoding="utf-8")
        (ben / "memories").mkdir()
        short_memory = "Kurzgedächtnis mit Umlaut 👋"
        (ben / "memories/MEMORY.md").write_text(short_memory, encoding="utf-8")
        runs = ben / "logs/benefitsi-worker-runs"
        runs.mkdir(parents=True)
        (runs / "20260921T194908Z-45593-preflight.json").write_text(
            json.dumps({"status": "queue_empty", "llm_started": False, "detail": SECRET}),
            encoding="utf-8",
        )
        write_plist(self.fx.launch_agents, "ai.benefitsi.hermes-ben-worker")

        nova = self.fx.profile("nova", "model:\n  provider: personal-provider\n  default: private-model\n")
        (nova / "cron").mkdir()
        (nova / "cron/jobs.json").write_text(
            json.dumps({"jobs": [{"id": "personal", "prompt": PROMPT, "delivery": SECRET}]}),
            encoding="utf-8",
        )

        self.fx.write_registry([
            registry_profile(
                "ben",
                launchdSchedules=[{
                    "id": "ai.benefitsi.hermes-ben-worker",
                    "status": {"kind": "ben-preflight", "path": "logs/benefitsi-worker-runs/*-preflight.json"},
                }],
            ),
            registry_profile("nova", scope="general", purpose="Allgemeine persönliche Assistenz."),
        ])

        snapshot = self.fx.collect()
        serialized = json.dumps(snapshot, ensure_ascii=False)
        self.assertNotIn(SECRET, serialized)
        self.assertNotIn(PROMPT, serialized)
        self.assertEqual(
            set(snapshot),
            {"schemaVersion", "hostId", "observedAt", "collectorVersion", "profiles"},
        )
        self.assertEqual(snapshot["schemaVersion"], 1)
        self.assertEqual(snapshot["hostId"], "m1-benefitsi")
        self.assertEqual(snapshot["observedAt"], "2026-09-21T20:00:00Z")

        ben_snapshot = snapshot["profiles"][0]
        self.assertEqual(
            set(ben_snapshot),
            {"id", "scope", "purpose", "provider", "model", "citySlug", "automation", "contextFiles", "schedules"},
        )
        self.assertEqual(ben_snapshot["provider"], "minimax")
        self.assertEqual(ben_snapshot["model"], "MiniMax-M3.0")
        self.assertEqual(ben_snapshot["automation"], "scheduled")
        self.assertEqual(ben_snapshot["schedules"], [{
            "id": "ai.benefitsi.hermes-ben-worker",
            "source": "launchd",
            "enabled": True,
            "cadence": "every 3600 seconds; RunAtLoad",
            "lastRunAt": "2026-09-21T19:49:08Z",
            "lastStatus": "queue_empty",
        }])
        self.assertEqual(snapshot["profiles"][1]["automation"], "unknown")
        self.assertEqual(snapshot["profiles"][1]["schedules"], [])

        short = next(item for item in ben_snapshot["contextFiles"] if item["path"] == "memories/MEMORY.md")
        self.assertEqual(short["chars"], len(short_memory))
        self.assertEqual(short["limit"], 2200)
        self.assertEqual(short["loadedBy"], "system")
        self.assertEqual(short["sha256"], hashlib.sha256(short_memory.encode()).hexdigest())

    def test_context_allowlist_and_loading_semantics_are_fixed(self):
        profile = self.fx.profile("worker", "memory:\n  memory_char_limit: 9\n")
        for name in ("AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"):
            (profile / name).write_text(name, encoding="utf-8")
        (profile / "memories").mkdir()
        (profile / "memories/MEMORY.md").write_text("123456789", encoding="utf-8")
        (profile / "PROMPT.md").write_text(PROMPT, encoding="utf-8")
        self.fx.write_registry([registry_profile("worker")])

        context = self.fx.collect()["profiles"][0]["contextFiles"]
        self.assertEqual([item["path"] for item in context], [
            "AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "memories/MEMORY.md",
        ])
        loaded = {item["path"]: item["loadedBy"] for item in context}
        self.assertEqual(loaded, {
            "AGENTS.md": "unknown",
            "SOUL.md": "system",
            "USER.md": "unknown",
            "MEMORY.md": "reference",
            "memories/MEMORY.md": "system",
        })
        short = context[-1]
        self.assertEqual(short["limit"], 9)
        self.assertNotIn(PROMPT, json.dumps(context))

    def test_disabled_memory_has_no_limit_or_system_loading_claim(self):
        profile = self.fx.profile("worker", "memory:\n  memory_enabled: false\n  memory_char_limit: 9999\n")
        (profile / "memories").mkdir()
        (profile / "memories/MEMORY.md").write_text("remember", encoding="utf-8")
        self.fx.write_registry([registry_profile("worker")])

        context = self.fx.collect()["profiles"][0]["contextFiles"]
        short = next(item for item in context if item["path"] == "memories/MEMORY.md")
        self.assertIsNone(short["limit"])
        self.assertEqual(short["loadedBy"], "unknown")

    def test_symlink_and_outside_profile_status_are_never_followed(self):
        profile = self.fx.profile("worker", "model:\n  provider: safe\n  default: model\n")
        outside = self.fx.root / "outside.txt"
        outside.write_text(SECRET, encoding="utf-8")
        os.symlink(outside, profile / "SOUL.md")
        write_plist(self.fx.launch_agents, "ai.benefitsi.synthetic")
        self.fx.write_registry([registry_profile(
            "worker",
            launchdSchedules=[{
                "id": "ai.benefitsi.synthetic",
                "status": {"kind": "city-report", "path": "../outside.txt"},
            }],
        )])

        snapshot = self.fx.collect()
        self.assertNotIn(SECRET, json.dumps(snapshot))
        soul = next(item for item in snapshot["profiles"][0]["contextFiles"] if item["path"] == "SOUL.md")
        self.assertFalse(soul["exists"])
        self.assertIsNone(snapshot["profiles"][0]["schedules"][0]["lastStatus"])
        self.assertIsNone(snapshot["profiles"][0]["schedules"][0]["lastRunAt"])

    def test_oversized_and_invalid_utf8_context_files_are_bounded_unknown_metadata(self):
        profile = self.fx.profile("worker", "model:\n  provider: safe\n  default: model\n")
        (profile / "SOUL.md").write_bytes(b"x" * (257 * 1024))
        (profile / "MEMORY.md").write_bytes(b"\xff\xfe")
        self.fx.write_registry([registry_profile("worker")])

        files = {item["path"]: item for item in self.fx.collect()["profiles"][0]["contextFiles"]}
        self.assertTrue(files["SOUL.md"]["exists"])
        self.assertIsNone(files["SOUL.md"]["chars"])
        self.assertIsNone(files["SOUL.md"]["sha256"])
        self.assertTrue(files["MEMORY.md"]["exists"])
        self.assertIsNone(files["MEMORY.md"]["chars"])
        self.assertIsNone(files["MEMORY.md"]["sha256"])

    def test_missing_or_malformed_config_makes_model_fields_unknown(self):
        self.fx.profile("missing")
        self.fx.profile("malformed", "model: [unterminated\n")
        self.fx.write_registry([registry_profile("missing"), registry_profile("malformed")])

        profiles = self.fx.collect()["profiles"]
        self.assertEqual([(item["provider"], item["model"]) for item in profiles], [(None, None), (None, None)])
        self.assertEqual([item["automation"] for item in profiles], ["unknown", "unknown"])

    def test_safe_yaml_accepts_inline_comments_and_ignores_nested_prompt_data(self):
        self.fx.profile(
            "worker",
            "model:\n  provider: minimax # reviewed route\n  default: \"MiniMax-M3.0\" # reviewed model\n"
            f"agent:\n  nested:\n    system_prompt: {PROMPT}\n",
        )
        self.fx.write_registry([registry_profile("worker")])
        profile = self.fx.collect()["profiles"][0]
        self.assertEqual(profile["provider"], "minimax")
        self.assertEqual(profile["model"], "MiniMax-M3.0")
        self.assertNotIn(PROMPT, json.dumps(profile))

    def test_empty_or_malformed_expected_cron_source_is_unknown_not_manual(self):
        empty = self.fx.profile("empty")
        (empty / "cron").mkdir()
        (empty / "cron/jobs.json").write_text('{"jobs": []}', encoding="utf-8")
        malformed = self.fx.profile("malformed")
        (malformed / "cron").mkdir()
        (malformed / "cron/jobs.json").write_text('{"jobs":', encoding="utf-8")
        self.fx.write_registry([
            registry_profile("empty", hermesJobIds=["expected-job"]),
            registry_profile("malformed", hermesJobIds=["expected-job"]),
        ])

        profiles = self.fx.collect()["profiles"]
        for profile in profiles:
            self.assertEqual(profile["automation"], "unknown")
            self.assertEqual(profile["schedules"], [{
                "id": "expected-job", "source": "hermes", "enabled": None,
                "cadence": None, "lastRunAt": None, "lastStatus": None,
            }])

    def test_disabled_hermes_schedule_remains_scheduled_and_uses_only_allowlisted_fields(self):
        profile = self.fx.profile("seo", "model:\n  provider: openai-codex\n  default: gpt-5.5\n")
        (profile / "cron").mkdir()
        (profile / "cron/jobs.json").write_text(json.dumps({"jobs": [{
            "id": "allowed-job",
            "name": "must not be copied",
            "enabled": False,
            "schedule": {"expr": "15 7 * * *", "display": "15 7 * * * Europe/Berlin"},
            "last_run_at": "2026-09-19T23:00:25.214937+02:00",
            "last_status": "error",
            "prompt": PROMPT,
            "delivery": SECRET,
        }, {
            "id": "not-allowed",
            "enabled": True,
            "last_status": SECRET,
        }]}), encoding="utf-8")
        self.fx.write_registry([registry_profile("seo", hermesJobIds=["allowed-job"])])

        result = self.fx.collect()["profiles"][0]
        self.assertEqual(result["automation"], "scheduled")
        self.assertEqual(result["schedules"], [{
            "id": "allowed-job",
            "source": "hermes",
            "enabled": False,
            "cadence": "15 7 * * * Europe/Berlin",
            "lastRunAt": "2026-09-19T23:00:25.214937+02:00",
            "lastStatus": "error",
        }])
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertNotIn(PROMPT, json.dumps(result))

    def test_timestamp_offsets_above_fourteen_hours_are_unknown(self):
        profile = self.fx.profile("seo")
        (profile / "cron").mkdir()
        (profile / "cron/jobs.json").write_text(json.dumps({"jobs": [{
            "id": "allowed-job",
            "enabled": True,
            "schedule": {"display": "15 7 * * * Europe/Berlin"},
            "last_run_at": "2026-09-19T23:00:25+14:30",
            "last_status": "ok",
        }]}), encoding="utf-8")
        self.fx.write_registry([registry_profile("seo", hermesJobIds=["allowed-job"])])

        schedule = self.fx.collect()["profiles"][0]["schedules"][0]
        self.assertIsNone(schedule["lastRunAt"])
        self.assertEqual(
            collect_runtime._valid_timestamp("2026-09-19T23:00:25+14:00"),
            "2026-09-19T23:00:25+14:00",
        )
        self.assertEqual(
            collect_runtime._valid_timestamp("2026-09-19T23:00:25-14:00"),
            "2026-09-19T23:00:25-14:00",
        )
        self.assertIsNone(collect_runtime._valid_timestamp("2026-09-19T23:00:25+01:60"))
        self.assertIsNone(collect_runtime._valid_timestamp("2026-09-19T23:00:25-01:60"))
        self.assertIsNone(collect_runtime._valid_timestamp("2026-09-19T23:00:25-15:00"))

    def test_ben_run_scan_is_bounded_and_selects_latest_only_when_complete(self):
        profile = self.fx.profile("ben")
        cap = 3
        cases = [
            ("under", ["20260921T190000Z", "20260921T191000Z"], "2026-09-21T19:10:00Z"),
            ("at", ["20260921T193000Z", "20260921T191000Z", "20260921T192000Z"], "2026-09-21T19:30:00Z"),
            ("over", ["20260921T194000Z", "20260921T191000Z", "20260921T193000Z", "20260921T192000Z"], None),
        ]
        with mock.patch.object(collect_runtime, "MAX_BEN_RUN_DIRECTORY_ENTRIES", cap):
            for directory_name, timestamps, expected_run_at in cases:
                with self.subTest(directory_name=directory_name):
                    runs = profile / "logs" / directory_name
                    runs.mkdir(parents=True)
                    for index, timestamp in enumerate(timestamps):
                        (runs / f"{timestamp}-{index}-preflight.json").write_text(
                            json.dumps({"status": "ok"}),
                            encoding="utf-8",
                        )
                    run_at, status = collect_runtime._ben_status(
                        profile,
                        f"logs/{directory_name}/*-preflight.json",
                    )
                    self.assertEqual(run_at, expected_run_at)
                    self.assertEqual(status, "ok" if expected_run_at else None)

    def test_city_partial_report_is_not_mapped_to_failed(self):
        profile = self.fx.profile("city")
        report_dir = profile / "logs/event-publication"
        report_dir.mkdir(parents=True)
        (report_dir / "latest.json").write_text(json.dumps({
            "checked_at": "2026-09-21T04:35:08.602002Z",
            "status": "partial",
            "ok": False,
            "health": {"technical_ok": True, "editorial_status": "pending"},
            "problems": [SECRET],
        }), encoding="utf-8")
        write_plist(
            self.fx.launch_agents,
            "ai.benefitsi.city-discovery",
            StartInterval=None,
            StartCalendarInterval={"Hour": 6, "Minute": 35},
            RunAtLoad=False,
        )
        self.fx.write_registry([registry_profile(
            "city",
            citySlug="annweiler",
            launchdSchedules=[{
                "id": "ai.benefitsi.city-discovery",
                "status": {"kind": "city-report", "path": "logs/event-publication/latest.json"},
            }],
        )])

        schedule = self.fx.collect()["profiles"][0]["schedules"][0]
        self.assertEqual(schedule["lastStatus"], "partial")
        self.assertEqual(schedule["lastRunAt"], "2026-09-21T04:35:08.602002Z")
        self.assertEqual(schedule["cadence"], "daily 06:35 host time")
        self.assertNotIn(SECRET, json.dumps(schedule))

    def test_missing_expected_launchagent_is_unknown_with_disabled_placeholder(self):
        self.fx.profile("worker")
        self.fx.write_registry([registry_profile(
            "worker",
            launchdSchedules=[{"id": "ai.benefitsi.missing", "status": None}],
        )])

        profile = self.fx.collect()["profiles"][0]
        self.assertEqual(profile["automation"], "unknown")
        self.assertEqual(profile["schedules"][0]["enabled"], None)
        self.assertEqual(profile["schedules"][0]["cadence"], None)

    def test_limits_profiles_schedules_and_snapshot_utf8_bytes(self):
        profiles = []
        for index in range(65):
            profile_id = f"p{index:02d}"
            self.fx.profile(profile_id)
            profiles.append(registry_profile(profile_id))
        self.fx.write_registry(profiles)
        with self.assertRaises(collect_runtime.CollectorError):
            self.fx.collect()

        self.fx.write_registry([registry_profile(
            "p00",
            launchdSchedules=[{"id": f"ai.benefitsi.s{index}", "status": None} for index in range(17)],
        )])
        with self.assertRaises(collect_runtime.CollectorError):
            self.fx.collect()

    def test_naive_observation_time_is_rejected(self):
        self.fx.profile("worker")
        self.fx.write_registry([registry_profile("worker")])
        with self.assertRaises(collect_runtime.CollectorError):
            collect_runtime.collect_snapshot(
                self.fx.profiles,
                self.fx.registry,
                self.fx.launch_agents,
                datetime(2026, 9, 21, 20, 0),
            )


class FakeResponse:
    def __init__(self, url):
        self.url = url

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def geturl(self):
        return self.url

    def getcode(self):
        return 204


class RecordingOpener:
    def __init__(self, redirected_url=None, error=None):
        self.redirected_url = redirected_url
        self.error = error
        self.calls = []

    def open(self, request, timeout):
        self.calls.append((request, timeout))
        if self.error:
            raise self.error
        return FakeResponse(self.redirected_url or request.full_url)


class PublisherTests(unittest.TestCase):
    def snapshot(self):
        return {
            "schemaVersion": 1,
            "hostId": "m1-benefitsi",
            "observedAt": "2026-09-21T20:00:00Z",
            "collectorVersion": "1.0.0",
            "profiles": [],
        }

    def test_publish_uses_pinned_host_rpc_and_keeps_credential_out_of_body(self):
        opener = RecordingOpener()
        result = collect_runtime.publish_snapshot(
            self.snapshot(),
            lambda: ("https://slscoqdhbxftcournvut.supabase.co", SECRET),
            opener=opener,
        )
        self.assertEqual(result, 204)
        self.assertEqual(len(opener.calls), 1)
        request, timeout = opener.calls[0]
        self.assertEqual(request.full_url, "https://slscoqdhbxftcournvut.supabase.co/rest/v1/rpc/record_benefitsi_agent_runtime_snapshot")
        self.assertEqual(timeout, 10)
        body = request.data.decode("utf-8")
        self.assertNotIn(SECRET, body)
        self.assertEqual(json.loads(body)["p_snapshot"], self.snapshot())

    def test_publish_rejects_other_hosts_and_redirects(self):
        with self.assertRaises(collect_runtime.PublishError):
            collect_runtime.publish_snapshot(
                self.snapshot(),
                lambda: ("https://example.com", SECRET),
                opener=RecordingOpener(),
            )
        with self.assertRaises(collect_runtime.PublishError):
            collect_runtime.publish_snapshot(
                self.snapshot(),
                lambda: ("https://slscoqdhbxftcournvut.supabase.co", SECRET),
                opener=RecordingOpener(redirected_url="https://example.com/capture"),
            )

    def test_publish_has_one_attempt_and_reports_no_response_payload(self):
        error = urllib.error.HTTPError(
            "https://slscoqdhbxftcournvut.supabase.co/rest/v1/rpc/record_benefitsi_agent_runtime_snapshot",
            503,
            f"server said {SECRET}",
            hdrs=None,
            fp=None,
        )
        opener = RecordingOpener(error=error)
        with self.assertRaisesRegex(collect_runtime.PublishError, "HTTP 503") as raised:
            collect_runtime.publish_snapshot(
                self.snapshot(),
                lambda: ("https://slscoqdhbxftcournvut.supabase.co", SECRET),
                opener=opener,
            )
        self.assertEqual(len(opener.calls), 1)
        self.assertNotIn(SECRET, str(raised.exception))


class CliTests(unittest.TestCase):
    def setUp(self):
        self.fx = Fixture()
        self.fx.profile("worker", "model:\n  provider: safe\n  default: model\n")
        self.fx.write_registry([registry_profile("worker")])

    def tearDown(self):
        self.fx.close()

    def test_default_mode_outputs_only_sanitized_json_without_loading_credentials(self):
        stdout = io.StringIO()
        stderr = io.StringIO()

        def forbidden_loader():
            raise AssertionError("dry-run must not initialize credentials")

        exit_code = collect_runtime.run(
            [
                "--profiles-root", str(self.fx.profiles),
                "--launch-agents-root", str(self.fx.launch_agents),
                "--registry", str(self.fx.registry),
            ],
            stdout=stdout,
            stderr=stderr,
            observed_at=OBSERVED_AT,
            admin_loader=forbidden_loader,
        )
        self.assertEqual(exit_code, 0)
        self.assertEqual(stderr.getvalue(), "")
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["hostId"], "m1-benefitsi")
        self.assertNotIn(SECRET, stdout.getvalue())

    def test_admin_loader_imports_only_the_existing_configuration_function(self):
        module = self.fx.root / "server.py"
        city_config = self.fx.root / "city-config.yaml"
        city_config.write_text(
            "mcp_servers:\n"
            "  benefitsi:\n"
            "    env:\n"
            "      BENEFITSI_MCP_CREDENTIAL_FILE: /tmp/synthetic-private-credentials\n"
            f"      CITY_DRAFT_SECRET: {SECRET}\n",
            encoding="utf-8",
        )
        module.write_text(
            "import os\n"
            "def _admin_configuration():\n"
            "    assert os.environ['BENEFITSI_MCP_CREDENTIAL_FILE'] == '/tmp/synthetic-private-credentials'\n"
            "    assert 'CITY_DRAFT_SECRET' not in os.environ\n"
            "    return ('https://slscoqdhbxftcournvut.supabase.co', 'service-secret')\n",
            encoding="utf-8",
        )
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                collect_runtime.load_admin_configuration(module, city_config),
                ("https://slscoqdhbxftcournvut.supabase.co", "service-secret"),
            )

    def test_publish_mode_rejects_fixture_path_overrides_before_loading_credentials(self):
        stdout = io.StringIO()
        stderr = io.StringIO()

        def forbidden_loader():
            raise AssertionError("untrusted publish path must fail before credentials")

        exit_code = collect_runtime.run(
            [
                "--publish",
                "--profiles-root", str(self.fx.profiles),
                "--launch-agents-root", str(self.fx.launch_agents),
                "--registry", str(self.fx.registry),
            ],
            stdout=stdout,
            stderr=stderr,
            observed_at=OBSERVED_AT,
            admin_loader=forbidden_loader,
        )
        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("pinned collector paths", stderr.getvalue())


class OperationsArtifactTests(unittest.TestCase):
    def test_launchagent_template_is_disabled_and_runs_only_the_metadata_publisher(self):
        path = Path(__file__).with_name("ai.benefitsi.agent-runtime-observer.plist")
        with path.open("rb") as handle:
            payload = plistlib.load(handle)
        self.assertEqual(payload["Label"], "ai.benefitsi.agent-runtime-observer")
        self.assertIs(payload["Disabled"], True)
        self.assertIs(payload["RunAtLoad"], True)
        self.assertEqual(payload["StartInterval"], 1800)
        self.assertEqual(payload["ProgramArguments"], [
            "/Users/patrick/.hermes/hermes-agent/venv/bin/python",
            "/Users/patrick/.hermes/projects/benefitsi/agent-runtime/collect_runtime.py",
            "--publish",
        ])
        self.assertNotEqual(payload["StandardOutPath"], payload["StandardErrorPath"])
        serialized = json.dumps(payload)
        for forbidden in ("prompt", "worker", "tick", "dispatch", "model"):
            self.assertNotIn(forbidden, serialized.lower())


if __name__ == "__main__":
    unittest.main()
