#!/usr/bin/env python3
"""Collect a deterministic, metadata-only Hermes runtime snapshot."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import importlib.util
import json
import os
import plistlib
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, TextIO

import yaml


COLLECTOR_VERSION = "1.0.0"
HOST_ID = "m1-benefitsi"
PRODUCTION_HOST = "slscoqdhbxftcournvut.supabase.co"
RPC_NAME = "record_benefitsi_agent_runtime_snapshot"
DEFAULT_PROFILES_ROOT = Path("/Users/patrick/.hermes/profiles")
DEFAULT_LAUNCH_AGENTS_ROOT = Path("/Users/patrick/Library/LaunchAgents")
DEFAULT_MCP_SERVER = Path("/Users/patrick/.hermes/projects/benefitsi/mcp/server.py")
DEFAULT_PROFILE_CONFIG = Path("/Users/patrick/.hermes/profiles/city-annweiler/config.yaml")
DEFAULT_REGISTRY = Path(__file__).with_name("profile-registry.json")

MAX_PROFILES = 64
MAX_CONTEXT_FILES = 16
MAX_SCHEDULES = 16
MAX_SNAPSHOT_BYTES = 128 * 1024
MAX_METADATA_BYTES = 256 * 1024
MAX_CONTEXT_BYTES = 256 * 1024
DEFAULT_MEMORY_CHAR_LIMIT = 2200
NETWORK_TIMEOUT_SECONDS = 10

CONTEXT_FILES = (
    ("AGENTS.md", "unknown"),
    ("SOUL.md", "system"),
    ("USER.md", "unknown"),
    ("MEMORY.md", "reference"),
    ("memories/MEMORY.md", "system"),
)
SCOPES = {"benefitsi", "general", "other", "unknown"}
SAFE_STATUSES = {
    "ok": "ok",
    "succeeded": "succeeded",
    "success": "succeeded",
    "queue_empty": "queue_empty",
    "partial": "partial",
    "error": "error",
    "failed": "failed",
}
IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
TIMESTAMP_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$"
)
BEN_RUN_RE = re.compile(r"^(\d{8}T\d{6}Z)-[A-Za-z0-9._-]+-preflight\.json$")
CRON_DISPLAY_RE = re.compile(
    r"^[0-9*/?,\-]+(?: [0-9*/?,\-]+){4,6}(?: [A-Za-z][A-Za-z0-9_+\-]*/[A-Za-z0-9_+\-]+)?$"
)
SUSPICIOUS_PUBLIC_VALUE_RE = re.compile(
    r"(?:secret|token|credential|password|authorization|bearer|prompt|private[_-]?key)",
    re.IGNORECASE,
)


class CollectorError(RuntimeError):
    """Raised when a safe snapshot cannot be constructed."""


class PublishError(RuntimeError):
    """Raised for sanitized publication failures."""


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, _req, _fp, code, _msg, _headers, _newurl):
        raise urllib.error.HTTPError("redirect-refused", code, "redirect refused", None, None)


def _is_identifier(value: Any, maximum: int) -> bool:
    return isinstance(value, str) and 0 < len(value) <= maximum and bool(IDENTIFIER_RE.fullmatch(value))


def _safe_public_value(value: Any, maximum: int) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or len(value) > maximum or any(ord(char) < 32 for char in value):
        return None
    if SUSPICIOUS_PUBLIC_VALUE_RE.search(value):
        return None
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+:/() -]*", value):
        return None
    return value


def _valid_timestamp(value: Any) -> str | None:
    if not isinstance(value, str) or not TIMESTAMP_RE.fullmatch(value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return value


def _utc_timestamp(value: datetime, *, microseconds: bool = False) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise CollectorError("observation time must include a timezone")
    timespec = "microseconds" if microseconds else "seconds"
    return value.astimezone(timezone.utc).isoformat(timespec=timespec).replace("+00:00", "Z")


def _read_bounded(path: Path, maximum: int) -> bytes:
    try:
        file_stat = path.lstat()
    except OSError as exc:
        raise CollectorError("metadata source unavailable") from exc
    if stat.S_ISLNK(file_stat.st_mode) or not stat.S_ISREG(file_stat.st_mode):
        raise CollectorError("metadata source is not a regular file")
    if file_stat.st_size > maximum:
        raise CollectorError("metadata source exceeds size limit")
    try:
        return path.read_bytes()
    except OSError as exc:
        raise CollectorError("metadata source unreadable") from exc


def _safe_relative_path(profile_root: Path, relative: str) -> Path | None:
    relative_path = Path(relative)
    if relative_path.is_absolute() or not relative_path.parts or ".." in relative_path.parts:
        return None
    try:
        root_stat = profile_root.lstat()
    except OSError:
        return None
    if stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode):
        return None
    current = profile_root
    for part in relative_path.parts[:-1]:
        current = current / part
        try:
            current_stat = current.lstat()
        except OSError:
            return None
        if stat.S_ISLNK(current_stat.st_mode) or not stat.S_ISDIR(current_stat.st_mode):
            return None
    return profile_root / relative_path


def _safe_file(profile_root: Path, relative: str) -> tuple[Path | None, os.stat_result | None]:
    path = _safe_relative_path(profile_root, relative)
    if path is None:
        return None, None
    try:
        file_stat = path.lstat()
    except FileNotFoundError:
        return None, None
    except OSError:
        return path, None
    if stat.S_ISLNK(file_stat.st_mode) or not stat.S_ISREG(file_stat.st_mode):
        return None, None
    return path, file_stat


def _decode_metadata(path: Path, maximum: int) -> str:
    return _read_bounded(path, maximum).decode("utf-8")


def _parse_profile_config(profile_root: Path) -> tuple[dict[str, Any], bool]:
    path, file_stat = _safe_file(profile_root, "config.yaml")
    if path is None or file_stat is None or file_stat.st_size > MAX_METADATA_BYTES:
        return {}, False
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError):
        return {}, False
    if not isinstance(payload, dict):
        return {}, False
    result: dict[str, Any] = {}
    model = payload.get("model")
    if isinstance(model, dict):
        result["model.provider"] = model.get("provider")
        result["model.default"] = model.get("default")
    memory = payload.get("memory")
    if isinstance(memory, dict):
        if "memory_enabled" in memory:
            result["memory.memory_enabled"] = memory["memory_enabled"]
        if "memory_char_limit" in memory:
            result["memory.memory_char_limit"] = memory["memory_char_limit"]
    return result, True


def _memory_settings(config: dict[str, Any], config_ok: bool) -> tuple[bool | None, int | None]:
    if not config_ok:
        return None, None
    enabled = config.get("memory.memory_enabled", True)
    if not isinstance(enabled, bool):
        return None, None
    if not enabled:
        return False, None
    limit = config.get("memory.memory_char_limit", DEFAULT_MEMORY_CHAR_LIMIT)
    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1 or limit > 1_000_000:
        return True, None
    return True, limit


def _context_metadata(
    profile_root: Path,
    relative: str,
    loaded_by: str,
    short_memory_enabled: bool | None,
    short_memory_limit: int | None,
) -> dict[str, Any]:
    if relative == "memories/MEMORY.md":
        if short_memory_enabled is False or short_memory_enabled is None:
            loaded_by = "unknown"
        limit = short_memory_limit
    else:
        limit = None

    path, file_stat = _safe_file(profile_root, relative)
    if path is None:
        return {
            "path": relative,
            "exists": False,
            "chars": None,
            "limit": limit,
            "sha256": None,
            "modifiedAt": None,
            "loadedBy": loaded_by,
        }
    if file_stat is None:
        return {
            "path": relative,
            "exists": True,
            "chars": None,
            "limit": limit,
            "sha256": None,
            "modifiedAt": None,
            "loadedBy": loaded_by,
        }

    modified_at = _utc_timestamp(datetime.fromtimestamp(file_stat.st_mtime, timezone.utc), microseconds=True)
    if file_stat.st_size > MAX_CONTEXT_BYTES:
        return {
            "path": relative,
            "exists": True,
            "chars": None,
            "limit": limit,
            "sha256": None,
            "modifiedAt": modified_at,
            "loadedBy": loaded_by,
        }
    try:
        payload = path.read_bytes()
        text = payload.decode("utf-8")
    except (OSError, UnicodeError):
        return {
            "path": relative,
            "exists": True,
            "chars": None,
            "limit": limit,
            "sha256": None,
            "modifiedAt": modified_at,
            "loadedBy": loaded_by,
        }
    return {
        "path": relative,
        "exists": True,
        "chars": len(text),
        "limit": limit,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "modifiedAt": modified_at,
        "loadedBy": loaded_by,
    }


def _placeholder_schedule(schedule_id: str, source: str) -> dict[str, Any]:
    return {
        "id": schedule_id,
        "source": source,
        "enabled": None,
        "cadence": None,
        "lastRunAt": None,
        "lastStatus": None,
    }


def _safe_status(value: Any) -> str | None:
    return SAFE_STATUSES.get(value.strip().lower()) if isinstance(value, str) else None


def _cron_cadence(job: dict[str, Any]) -> str | None:
    candidates = [job.get("schedule_display")]
    schedule = job.get("schedule")
    if isinstance(schedule, dict):
        candidates.extend([schedule.get("display"), schedule.get("expr")])
    for candidate in candidates:
        if isinstance(candidate, str) and len(candidate) <= 200 and CRON_DISPLAY_RE.fullmatch(candidate):
            return candidate
    return None


def _collect_hermes_schedules(profile_root: Path, expected_ids: list[str]) -> tuple[list[dict[str, Any]], bool]:
    if not expected_ids:
        return [], True
    placeholders = [_placeholder_schedule(schedule_id, "hermes") for schedule_id in expected_ids]
    path, file_stat = _safe_file(profile_root, "cron/jobs.json")
    if path is None or file_stat is None or file_stat.st_size > MAX_METADATA_BYTES:
        return placeholders, False
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return placeholders, False
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list) or len(payload["jobs"]) > 256:
        return placeholders, False

    jobs: dict[str, dict[str, Any]] = {}
    duplicate_ids: set[str] = set()
    for job in payload["jobs"]:
        if not isinstance(job, dict):
            continue
        job_id = job.get("id")
        if job_id not in expected_ids:
            continue
        if job_id in jobs:
            duplicate_ids.add(job_id)
        jobs[job_id] = job

    schedules: list[dict[str, Any]] = []
    complete = True
    for schedule_id in expected_ids:
        job = jobs.get(schedule_id)
        if job is None or schedule_id in duplicate_ids:
            schedules.append(_placeholder_schedule(schedule_id, "hermes"))
            complete = False
            continue
        enabled = job.get("enabled") if isinstance(job.get("enabled"), bool) else None
        cadence = _cron_cadence(job)
        last_run_at = None if job.get("last_run_at") is None else _valid_timestamp(job.get("last_run_at"))
        last_status = None if job.get("last_status") is None else _safe_status(job.get("last_status"))
        if enabled is None or cadence is None:
            complete = False
        schedules.append({
            "id": schedule_id,
            "source": "hermes",
            "enabled": enabled,
            "cadence": cadence,
            "lastRunAt": last_run_at,
            "lastStatus": last_status,
        })
    return schedules, complete


def _launchd_cadence(plist: dict[str, Any]) -> str | None:
    interval = plist.get("StartInterval")
    if isinstance(interval, int) and not isinstance(interval, bool) and 1 <= interval <= 31 * 24 * 60 * 60:
        cadence = f"every {interval} seconds"
        if plist.get("RunAtLoad") is True:
            cadence += "; RunAtLoad"
        return cadence
    calendar = plist.get("StartCalendarInterval")
    if isinstance(calendar, dict):
        hour = calendar.get("Hour")
        minute = calendar.get("Minute")
        if (
            isinstance(hour, int) and not isinstance(hour, bool) and 0 <= hour <= 23
            and isinstance(minute, int) and not isinstance(minute, bool) and 0 <= minute <= 59
            and set(calendar).issubset({"Hour", "Minute"})
        ):
            cadence = f"daily {hour:02d}:{minute:02d} host time"
            if plist.get("RunAtLoad") is True:
                cadence += "; RunAtLoad"
            return cadence
    return None


def _load_json_status(profile_root: Path, relative: str) -> dict[str, Any] | None:
    path, file_stat = _safe_file(profile_root, relative)
    if path is None or file_stat is None or file_stat.st_size > MAX_METADATA_BYTES:
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _ben_status(profile_root: Path, pattern: str) -> tuple[str | None, str | None]:
    pattern_path = Path(pattern)
    if pattern_path.is_absolute() or ".." in pattern_path.parts or len(pattern_path.parts) < 2:
        return None, None
    if "*" not in pattern_path.name or any("*" in part for part in pattern_path.parts[:-1]):
        return None, None
    parent_relative = str(Path(*pattern_path.parts[:-1]))
    parent = _safe_relative_path(profile_root, parent_relative + "/placeholder")
    if parent is None:
        return None, None
    parent = parent.parent
    try:
        entries = list(parent.iterdir())
    except OSError:
        return None, None
    candidates: list[tuple[str, Path]] = []
    for path in entries:
        match = BEN_RUN_RE.fullmatch(path.name)
        if not match or not fnmatch.fnmatchcase(path.name, pattern_path.name):
            continue
        safe_path, file_stat = _safe_file(profile_root, str(Path(parent_relative) / path.name))
        if safe_path is None or file_stat is None or file_stat.st_size > MAX_METADATA_BYTES:
            continue
        candidates.append((match.group(1), safe_path))
    if not candidates:
        return None, None
    encoded_time, selected = max(candidates, key=lambda item: item[0])
    try:
        run_at = datetime.strptime(encoded_time, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        payload = json.loads(selected.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
        return None, None
    if not isinstance(payload, dict):
        return None, None
    status_value = _safe_status(payload.get("status"))
    if status_value == "queue_empty" and payload.get("llm_started") is not False:
        status_value = None
    return _utc_timestamp(run_at), status_value


def _city_status(profile_root: Path, relative: str) -> tuple[str | None, str | None]:
    payload = _load_json_status(profile_root, relative)
    if payload is None:
        return None, None
    run_at = _valid_timestamp(payload.get("checked_at"))
    raw_status = _safe_status(payload.get("status"))
    health = payload.get("health")
    technical_ok = health.get("technical_ok") if isinstance(health, dict) else None
    if raw_status == "partial" and technical_ok is True:
        status_value = "partial"
    elif raw_status in {"error", "failed"} or technical_ok is False:
        status_value = "failed"
    elif raw_status in {"ok", "succeeded"} and technical_ok is True:
        status_value = "ok"
    else:
        status_value = None
    return run_at, status_value


def _status_metadata(profile_root: Path, status_config: Any) -> tuple[str | None, str | None]:
    if status_config is None:
        return None, None
    if not isinstance(status_config, dict):
        return None, None
    kind = status_config.get("kind")
    relative = status_config.get("path")
    if not isinstance(relative, str):
        return None, None
    if kind == "ben-preflight":
        return _ben_status(profile_root, relative)
    if kind == "city-report":
        return _city_status(profile_root, relative)
    return None, None


def _collect_launchd_schedules(
    profile_root: Path,
    launch_agents_root: Path,
    definitions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool]:
    schedules: list[dict[str, Any]] = []
    complete = True
    for definition in definitions:
        schedule_id = definition["id"]
        placeholder = _placeholder_schedule(schedule_id, "launchd")
        plist_path = launch_agents_root / f"{schedule_id}.plist"
        try:
            root_stat = launch_agents_root.lstat()
            path_stat = plist_path.lstat()
        except OSError:
            schedules.append(placeholder)
            complete = False
            continue
        if (
            stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode)
            or stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISREG(path_stat.st_mode)
            or path_stat.st_size > MAX_METADATA_BYTES
        ):
            schedules.append(placeholder)
            complete = False
            continue
        try:
            plist = plistlib.loads(plist_path.read_bytes())
        except (OSError, plistlib.InvalidFileException):
            schedules.append(placeholder)
            complete = False
            continue
        if not isinstance(plist, dict) or plist.get("Label") != schedule_id:
            schedules.append(placeholder)
            complete = False
            continue
        disabled = plist.get("Disabled", False)
        enabled = not disabled if isinstance(disabled, bool) else None
        cadence = _launchd_cadence(plist)
        if enabled is None or cadence is None:
            complete = False
        last_run_at, last_status = _status_metadata(profile_root, definition.get("status"))
        schedules.append({
            "id": schedule_id,
            "source": "launchd",
            "enabled": enabled,
            "cadence": cadence,
            "lastRunAt": last_run_at,
            "lastStatus": last_status,
        })
    return schedules, complete


def _load_registry(path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(_decode_metadata(path, MAX_METADATA_BYTES))
    except (CollectorError, UnicodeError, json.JSONDecodeError) as exc:
        raise CollectorError("profile registry is unreadable") from exc
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or not isinstance(payload.get("profiles"), list):
        raise CollectorError("profile registry has an invalid schema")
    if len(payload["profiles"]) > MAX_PROFILES:
        raise CollectorError("profile registry exceeds profile limit")

    profiles: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in payload["profiles"]:
        if not isinstance(raw, dict):
            raise CollectorError("profile registry entry is invalid")
        profile_id = raw.get("id")
        purpose = raw.get("purpose")
        scope = raw.get("scope")
        city_slug = raw.get("citySlug")
        hermes_ids = raw.get("hermesJobIds")
        launchd = raw.get("launchdSchedules")
        if (
            not _is_identifier(profile_id, 80) or profile_id in seen
            or scope not in SCOPES
            or not isinstance(purpose, str) or not purpose.strip() or len(purpose) > 500
            or (city_slug is not None and not _is_identifier(city_slug, 100))
            or not isinstance(hermes_ids, list) or not isinstance(launchd, list)
        ):
            raise CollectorError("profile registry entry is invalid")
        if len(hermes_ids) + len(launchd) > MAX_SCHEDULES:
            raise CollectorError("profile registry exceeds schedule limit")
        if len(set(hermes_ids)) != len(hermes_ids) or any(not _is_identifier(item, 120) for item in hermes_ids):
            raise CollectorError("Hermes job allowlist is invalid")
        launch_ids: set[str] = set()
        clean_launchd: list[dict[str, Any]] = []
        for schedule in launchd:
            if not isinstance(schedule, dict) or not _is_identifier(schedule.get("id"), 120):
                raise CollectorError("LaunchAgent allowlist is invalid")
            schedule_id = schedule["id"]
            if schedule_id in launch_ids:
                raise CollectorError("LaunchAgent allowlist contains duplicates")
            status_config = schedule.get("status")
            if status_config is not None:
                if (
                    not isinstance(status_config, dict)
                    or status_config.get("kind") not in {"ben-preflight", "city-report"}
                    or not isinstance(status_config.get("path"), str)
                    or len(status_config["path"]) > 300
                ):
                    raise CollectorError("LaunchAgent status source is invalid")
            launch_ids.add(schedule_id)
            clean_launchd.append({"id": schedule_id, "status": status_config})
        seen.add(profile_id)
        profiles.append({
            "id": profile_id,
            "scope": scope,
            "purpose": purpose.strip(),
            "citySlug": city_slug,
            "hermesJobIds": list(hermes_ids),
            "launchdSchedules": clean_launchd,
        })
    return profiles


def _discover_profile_ids(profiles_root: Path) -> list[str]:
    try:
        root_stat = profiles_root.lstat()
        entries = list(profiles_root.iterdir())
    except OSError as exc:
        raise CollectorError("profiles root unavailable") from exc
    if stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode):
        raise CollectorError("profiles root is not a safe directory")
    result: list[str] = []
    for entry in entries:
        if not _is_identifier(entry.name, 80):
            continue
        try:
            entry_stat = entry.lstat()
        except OSError:
            continue
        if stat.S_ISDIR(entry_stat.st_mode) and not stat.S_ISLNK(entry_stat.st_mode):
            result.append(entry.name)
    if len(result) > MAX_PROFILES:
        raise CollectorError("profiles root exceeds profile limit")
    return sorted(result)


def _unknown_registry_profile(profile_id: str) -> dict[str, Any]:
    return {
        "id": profile_id,
        "scope": "unknown",
        "purpose": "Aufgabe und Benefitsi-Zuordnung sind derzeit nicht belegt.",
        "citySlug": None,
        "hermesJobIds": [],
        "launchdSchedules": [],
    }


def _collect_profile(profile_root: Path, registry: dict[str, Any], launch_agents_root: Path) -> dict[str, Any]:
    config, config_ok = _parse_profile_config(profile_root)
    provider = _safe_public_value(config.get("model.provider"), 120) if config_ok else None
    model = _safe_public_value(config.get("model.default"), 120) if config_ok else None
    memory_enabled, memory_limit = _memory_settings(config, config_ok)
    context_files = [
        _context_metadata(profile_root, path, loaded_by, memory_enabled, memory_limit)
        for path, loaded_by in CONTEXT_FILES
    ]
    if len(context_files) > MAX_CONTEXT_FILES:
        raise CollectorError("context file limit exceeded")

    schedules: list[dict[str, Any]] = []
    automation = "unknown"
    if registry["scope"] == "benefitsi":
        hermes, hermes_complete = _collect_hermes_schedules(profile_root, registry["hermesJobIds"])
        launchd, launchd_complete = _collect_launchd_schedules(
            profile_root, launch_agents_root, registry["launchdSchedules"]
        )
        schedules = hermes + launchd
        configured = bool(registry["hermesJobIds"] or registry["launchdSchedules"])
        if configured and hermes_complete and launchd_complete:
            automation = "scheduled"
        elif configured:
            automation = "unknown"
        else:
            automation = "manual" if config_ok else "unknown"
    if len(schedules) > MAX_SCHEDULES:
        raise CollectorError("schedule limit exceeded")

    return {
        "id": registry["id"],
        "scope": registry["scope"],
        "purpose": registry["purpose"],
        "provider": provider,
        "model": model,
        "citySlug": registry["citySlug"],
        "automation": automation,
        "contextFiles": context_files,
        "schedules": schedules,
    }


def snapshot_bytes(snapshot: dict[str, Any]) -> bytes:
    return json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def collect_snapshot(
    profiles_root: Path,
    registry_path: Path,
    launch_agents_root: Path,
    observed_at: datetime | None = None,
) -> dict[str, Any]:
    observed_at = observed_at or datetime.now(timezone.utc)
    observed = _utc_timestamp(observed_at)
    registry_profiles = _load_registry(Path(registry_path))
    discovered = _discover_profile_ids(Path(profiles_root))
    discovered_set = set(discovered)
    ordered_registry = [profile for profile in registry_profiles if profile["id"] in discovered_set]
    registered_ids = {profile["id"] for profile in ordered_registry}
    ordered_registry.extend(_unknown_registry_profile(profile_id) for profile_id in discovered if profile_id not in registered_ids)
    if len(ordered_registry) > MAX_PROFILES:
        raise CollectorError("profile limit exceeded")

    snapshot = {
        "schemaVersion": 1,
        "hostId": HOST_ID,
        "observedAt": observed,
        "collectorVersion": COLLECTOR_VERSION,
        "profiles": [
            _collect_profile(Path(profiles_root) / profile["id"], profile, Path(launch_agents_root))
            for profile in ordered_registry
        ],
    }
    if len(snapshot_bytes(snapshot)) > MAX_SNAPSHOT_BYTES:
        raise CollectorError("snapshot exceeds size limit")
    return snapshot


def _initialize_private_credential_path(profile_config_path: Path) -> None:
    try:
        config = yaml.safe_load(_decode_metadata(profile_config_path, MAX_METADATA_BYTES))
        credential_path = config["mcp_servers"]["benefitsi"]["env"]["BENEFITSI_MCP_CREDENTIAL_FILE"]
    except (CollectorError, UnicodeError, yaml.YAMLError, KeyError, TypeError) as exc:
        raise CollectorError("private credential path initializer unavailable") from exc
    if (
        not isinstance(credential_path, str)
        or not credential_path.strip()
        or len(credential_path) > 1024
        or any(ord(char) < 32 for char in credential_path)
        or not Path(credential_path).expanduser().is_absolute()
    ):
        raise CollectorError("private credential path initializer is invalid")
    os.environ["BENEFITSI_MCP_CREDENTIAL_FILE"] = credential_path.strip()


def load_admin_configuration(
    module_path: Path = DEFAULT_MCP_SERVER,
    profile_config_path: Path = DEFAULT_PROFILE_CONFIG,
) -> tuple[str, str]:
    _initialize_private_credential_path(profile_config_path)
    spec = importlib.util.spec_from_file_location("benefitsi_runtime", module_path)
    if spec is None or spec.loader is None:
        raise CollectorError("credential initializer unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    initializer = getattr(module, "_admin_configuration", None)
    if not callable(initializer):
        raise CollectorError("credential initializer unavailable")
    result = initializer()
    if not isinstance(result, tuple) or len(result) != 2 or not all(isinstance(item, str) for item in result):
        raise CollectorError("credential initializer returned invalid configuration")
    return result


def _validated_base_url(base_url: str) -> str:
    parsed = urllib.parse.urlsplit(base_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != PRODUCTION_HOST
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in {None, 443}
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise PublishError("configured Supabase host is not the pinned production project")
    return f"https://{PRODUCTION_HOST}"


def publish_snapshot(
    snapshot: dict[str, Any],
    admin_loader: Callable[[], tuple[str, str]],
    *,
    opener: Any | None = None,
) -> int:
    base_url, service_key = admin_loader()
    if not service_key:
        raise PublishError("service credential unavailable")
    endpoint = f"{_validated_base_url(base_url)}/rest/v1/rpc/{RPC_NAME}"
    body = json.dumps({
        "p_host_id": snapshot["hostId"],
        "p_observed_at": snapshot["observedAt"],
        "p_snapshot": snapshot,
    }, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    client = opener or urllib.request.build_opener(NoRedirectHandler())
    try:
        with client.open(request, timeout=NETWORK_TIMEOUT_SECONDS) as response:
            final_url = response.geturl()
            status_code = response.getcode()
    except urllib.error.HTTPError as exc:
        raise PublishError(f"publication failed: HTTP {exc.code}") from None
    except urllib.error.URLError as exc:
        reason_name = type(exc.reason).__name__
        raise PublishError(f"publication failed: network {reason_name}") from None
    except OSError:
        raise PublishError("publication failed: network error") from None
    if final_url != endpoint:
        raise PublishError("publication failed: redirect refused")
    if not isinstance(status_code, int) or status_code < 200 or status_code >= 300:
        raise PublishError("publication failed: unexpected HTTP status")
    return status_code


def _argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect sanitized Benefitsi agent runtime metadata.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Print sanitized JSON (default).")
    mode.add_argument("--publish", action="store_true", help="Publish through the existing private credential initializer.")
    parser.add_argument("--profiles-root", type=Path, default=DEFAULT_PROFILES_ROOT)
    parser.add_argument("--launch-agents-root", type=Path, default=DEFAULT_LAUNCH_AGENTS_ROOT)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    return parser


def run(
    argv: Iterable[str] | None = None,
    *,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
    observed_at: datetime | None = None,
    admin_loader: Callable[[], tuple[str, str]] | None = None,
) -> int:
    args = _argument_parser().parse_args(list(argv) if argv is not None else None)
    try:
        if args.publish and (
            args.profiles_root != DEFAULT_PROFILES_ROOT
            or args.launch_agents_root != DEFAULT_LAUNCH_AGENTS_ROOT
            or args.registry != DEFAULT_REGISTRY
        ):
            raise CollectorError("publish mode requires pinned collector paths")
        snapshot = collect_snapshot(
            args.profiles_root,
            args.registry,
            args.launch_agents_root,
            observed_at,
        )
        if args.publish:
            status_code = publish_snapshot(snapshot, admin_loader or load_admin_configuration)
            json.dump(
                {"hostId": HOST_ID, "observedAt": snapshot["observedAt"], "published": True, "status": status_code},
                stdout,
                separators=(",", ":"),
                sort_keys=True,
            )
            stdout.write("\n")
        else:
            json.dump(snapshot, stdout, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            stdout.write("\n")
        return 0
    except PublishError as exc:
        stderr.write(f"collector publish error: {exc}\n")
        return 2
    except CollectorError as exc:
        stderr.write(f"collector error: {exc}\n")
        return 1
    except Exception as exc:
        stderr.write(f"collector error: {type(exc).__name__}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
