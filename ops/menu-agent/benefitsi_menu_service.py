"""Bounded, authenticated bridge action: local OCR -> isolated Hermes -> draft.

Installed beside m1_bridge.py. Authentication is enforced by that bridge before
this function runs. No caller-controlled commands, paths, prompts or models.
"""
import base64
import binascii
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
import uuid

PROFILE = Path.home() / ".hermes/profiles/benefitsi-menu"
HERMES_PYTHON = Path.home() / ".hermes/hermes-agent/venv/bin/python"
MAX_FILES_BYTES = 4 * 1024 * 1024
MAX_BODY_BYTES = 6 * 1024 * 1024
MAX_OCR_CHARS = 120_000
_SLOT = threading.BoundedSemaphore(1)


class MenuAgentBusy(Exception):
    pass


def _mime(raw):
    if re.match(rb"^%PDF-[12]\.\d", raw):
        return "application/pdf", ".pdf"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP" and raw[12:16] in (b"VP8 ", b"VP8L", b"VP8X"):
        return "image/webp", ".webp"
    raise ValueError("Dateiformat nicht unterstützt.")


def _files(data):
    keys = {"action", "profile", "task", "schemaVersion", "requestId", "files"}
    if (not isinstance(data, dict) or set(data) != keys or data["action"] != "menu-extract"
            or data["profile"] != "benefitsi-menu" or data["task"] != "extract-menu"
            or type(data["schemaVersion"]) is not int or data["schemaVersion"] != 1):
        raise ValueError("Ungültiger Menü-Auftrag.")
    try:
        if str(uuid.UUID(data["requestId"])) != data["requestId"]:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Ungültige Auftrags-ID.") from None
    files = data["files"]
    if not isinstance(files, list) or not 1 <= len(files) <= 8:
        raise ValueError("Bitte eine PDF-Datei oder bis zu acht Fotos hochladen.")
    result, total = [], 0
    for file in files:
        if (not isinstance(file, dict) or set(file) != {"mimeType", "data"}
                or not isinstance(file["data"], str) or len(file["data"]) > MAX_BODY_BYTES):
            raise ValueError("Ungültige Datei.")
        try:
            raw = base64.b64decode(file["data"], validate=True)
        except (ValueError, binascii.Error):
            raise ValueError("Ungültige Dateiübertragung.") from None
        total += len(raw)
        if not raw or total > MAX_FILES_BYTES:
            raise ValueError("Dateien müssen zusammen zwischen 1 Byte und 4 MiB groß sein.")
        mime, suffix = _mime(raw)
        if mime != file["mimeType"] or (mime == "application/pdf" and len(files) != 1):
            raise ValueError("Bitte eine einzelne PDF-Datei oder mehrere Fotos hochladen.")
        result.append((suffix, raw))
    return result


def native_ocr(path, timeout=25):
    try:
        completed = subprocess.run([str(PROFILE / "runtime/menu-ocr"), str(path)],
                                   capture_output=True, timeout=timeout, check=True)
        if len(completed.stdout) > 2 * 1024 * 1024:
            raise ValueError("Die Speisekarte ist zu umfangreich.")
        return json.loads(completed.stdout)
    except (subprocess.SubprocessError, json.JSONDecodeError):
        raise ValueError("Die Datei ist unlesbar, zu umfangreich oder hat mehr als acht Seiten.") from None


def hermes_draft(document):
    try:
        # The parent owns this directory so subprocess timeout/kill cannot
        # strand source text or Hermes session files in the child's scratch.
        with tempfile.TemporaryDirectory(prefix="benefitsi-menu-hermes-") as scratch:
            environment = {key: os.environ[key] for key in
                           ("HOME", "PATH", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR")
                           if key in os.environ}
            environment.update(PYTHONDONTWRITEBYTECODE="1", HERMES_MENU_SCRATCH=scratch)
            completed = subprocess.run([str(HERMES_PYTHON), str(PROFILE / "runtime/hermes_menu_runner.py")],
                                       input=json.dumps(document, ensure_ascii=False).encode(),
                                       capture_output=True, timeout=110, check=True,
                                       env=environment)
        if len(completed.stdout) > 2 * 1024 * 1024:
            raise ValueError("Der Menüentwurf ist zu umfangreich.")
        return json.loads(completed.stdout)
    except (subprocess.SubprocessError, json.JSONDecodeError):
        # Never echo provider logs or credential errors through the bridge.
        raise ValueError("Hermes konnte keinen vollständigen Menüentwurf erstellen.") from None


def _text(value, limit, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ValueError("Der Menüentwurf enthält ungültigen Text.")


def _texts(value, count, length):
    if not isinstance(value, list) or len(value) > count:
        raise ValueError("Der Menüentwurf enthält ungültige Hinweise.")
    for text in value:
        _text(text, length, True)


def validate_draft(draft):
    if (not isinstance(draft, dict) or set(draft) != {"name", "currency", "complete", "warnings", "categories"}
            or draft["complete"] is not True):
        raise ValueError("Die Speisekarte wurde nicht vollständig erkannt.")
    _text(draft["name"], 120)
    _text(draft["currency"], 3)
    if draft["currency"] and not re.fullmatch("[A-Z]{3}", draft["currency"]):
        raise ValueError("Die Währung ist ungültig.")
    _texts(draft["warnings"], 40, 1000)
    cats = draft["categories"]
    if not isinstance(cats, list) or not 1 <= len(cats) <= 40:
        raise ValueError("Bitte kleinere Kartenteile mit höchstens 40 Kategorien verwenden.")
    count = 0
    for cat in cats:
        if not isinstance(cat, dict) or set(cat) != {"name", "items"}:
            raise ValueError("Ungültige Kategorie.")
        _text(cat["name"], 120, True)
        if not isinstance(cat["items"], list) or not cat["items"]:
            raise ValueError("Leere Kategorie.")
        count += len(cat["items"])
        if count > 200:
            raise ValueError("Bitte kleinere Kartenteile mit höchstens 200 Artikeln verwenden.")
        for item in cat["items"]:
            if not isinstance(item, dict) or set(item) != {"name", "description", "price", "allergens", "tags", "note"}:
                raise ValueError("Ungültiger Artikel.")
            _text(item["name"], 120, True)
            _text(item["description"], 2000)
            _text(item["note"], 1000)
            price = item["price"]
            if price is not None and (type(price) not in (int, float) or not math.isfinite(price) or price < 0):
                raise ValueError("Ungültiger Artikelpreis.")
            _texts(item["allergens"], 20, 100)
            _texts(item["tags"], 20, 100)
    return draft


def extract_menu(data, *, ocr=None, agent=None):
    files = _files(data)
    if not _SLOT.acquire(blocking=False):
        raise MenuAgentBusy("Der Menü-Agent ist ausgelastet.")
    try:
        pages, chars = [], 0
        ocr_deadline = time.monotonic() + 25
        with tempfile.TemporaryDirectory(prefix="benefitsi-menu-") as directory:
            for index, (suffix, raw) in enumerate(files):
                path = Path(directory) / f"source-{index}{suffix}"
                path.write_bytes(raw)
                os.chmod(path, 0o600)
                remaining = ocr_deadline - time.monotonic()
                if remaining <= 0:
                    raise ValueError("Die Texterkennung hat zu lange gedauert. Bitte kleinere Kartenteile verwenden.")
                result = ocr(path) if ocr else native_ocr(path, timeout=remaining)
                if not isinstance(result, dict) or not isinstance(result.get("pages"), list) or not result["pages"]:
                    raise ValueError("Es wurde kein lesbarer Text gefunden.")
                for page in result["pages"]:
                    if not isinstance(page, dict) or not isinstance(page.get("lines"), list) or not page["lines"]:
                        raise ValueError("Mindestens eine Seite ist unlesbar. Bitte erneut fotografieren.")
                    if len(page["lines"]) > 1200 or len(pages) >= 8:
                        raise ValueError("Bitte Kartenteile mit höchstens acht Seiten verwenden.")
                    lines = []
                    for line in page["lines"]:
                        if not isinstance(line, dict):
                            raise ValueError("Ungültige Texterkennung.")
                        _text(line.get("text"), 4000, True)
                        chars += len(line["text"])
                        if chars > MAX_OCR_CHARS:
                            raise ValueError("Die Speisekarte enthält zu viel Text. Bitte aufteilen.")
                        clean = {"text": line["text"]}
                        for key in ("confidence", "x", "y", "width", "height"):
                            if key in line:
                                number = line[key]
                                if type(number) not in (int, float) or not math.isfinite(number) or not 0 <= number <= 1:
                                    raise ValueError("Ungültige Textkoordinaten.")
                                clean[key] = number
                        lines.append(clean)
                    pages.append({"page": len(pages) + 1, "lines": lines})
            draft = validate_draft((agent or hermes_draft)({"pages": pages}))
        return {"profile": "benefitsi-menu", "task": "extract-menu", "schemaVersion": 1,
                "requestId": data["requestId"], "draft": draft}
    finally:
        _SLOT.release()
