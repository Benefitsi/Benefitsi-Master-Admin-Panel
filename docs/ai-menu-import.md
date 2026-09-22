# Reviewed menu import from photos and PDF

Admins and partner owners can select **Karte aus Foto / PDF** in their existing
menu editor. The same component is available before creating the first menu.
Recognition produces a temporary, editable preview; it does not save menu rows.
The final action checks ownership again and requires explicit confirmation.
It appends reviewed categories/items and preserves existing menu metadata and
content. A partner without a menu receives a new published menu at confirmation.

## Configuration

- `M1_BRIDGE_URL` and `M1_BRIDGE_SECRET`: existing server-only bridge configuration.
- Dedicated Hermes profile `benefitsi-menu`, using the existing MiniMax-M3.0
  credential on the M1. No Gemini credential is used for menu recognition.
- No database migration or new storage bucket is required.
- The authenticated Next server action sends originals to the exact bridge route
  `/hermes/menu-extract`. Apple Vision/PDFKit reads them locally on the M1.
  Only the resulting text, page numbers, confidence and coordinates reach MiniMax.
  Each request uses temporary files and a disposable Hermes home that are deleted
  on completion or failure. The file-selection screen discloses this processing.

Supports one PDF with up to eight pages or up to eight JPEG/PNG/WebP images,
totaling at most **4 MiB**.
The cap leaves multipart overhead beneath Vercel's 4.5 MB function request limit;
raising Next's `serverActions.bodySizeLimit` does not raise that hosting limit.
See [Vercel function limits](https://vercel.com/docs/functions/limitations).
Larger menus must be divided into smaller imports; direct storage uploads would
be a separate extension. HEIC, URL extraction, overwrite mode and automatic
currency conversion are outside this first version.

Recognition accepts up to 40 categories and 200 items per request. It rejects
incomplete/truncated responses rather than silently dropping content. Missing
prices stay empty, and explicit source currencies stay visible. Final saving
requires valid prices in EUR, matching the existing menu persistence contract.
Allergens are transcribed only from the source, never inferred from ingredients.
Source warnings/uncertainty notes stay visible during review but are not published;
relevant variants and extra charges must be added to the editable item description.

## Verification

Run `npm test`, `npm run build -- --webpack`, and
`python3 -m unittest discover -s ops/menu-agent -p 'test_*.py'`.
Dedicated suites cover provider
requests/output validation, entire-file validation, ownership boundaries,
review-before-write, append preservation, rollback, and the real React dialog.
Dialog tests simulate server responses; they do not call Hermes or a database.

During development, the complete test suite and production build passed. The
browser flow was checked using synthetic menu data, including missing-price
correction and confirmation at narrow widths. No production menu was modified.
Production database persistence still needs a configured environment smoke test.

## M1 runtime

Source files live in `ops/menu-agent/`; the profile lives in
`tools/hermes-city-profiles/benefitsi-menu/`. Install the profile into
`~/.hermes/profiles/benefitsi-menu/`, with `hermes_menu_runner.py` and the compiled
`menu-ocr` binary in its `runtime/` directory. Compile using
`xcrun swiftc -O menu_ocr.swift -o menu-ocr` on macOS with the developer tools.
The runner uses the existing Hermes virtual environment and only the central
`MINIMAX_API_KEY`; no credentials are copied into this repository.

After testing the staged runtime, `install_bridge.py --expected-sha256 <hash>`
patches the inspected `~/.arc-m1-bridge/m1_bridge.py` and installs the service
alongside it. It refuses an unexpected or already-patched bridge and creates a
dated rollback copy. The current `com.arc.m1-bridge` launch agent supervises
`ArcM1Runtime.app`; restarting the supervisor alone does not reload Python.
After ensuring the port-9130 listener has no active child calls, terminate only
that confirmed bridge process and its confirmed `ArcM1Runtime` parent. The
existing supervisor reopens the app with its existing macOS permissions. Verify
authenticated `/health` and the menu route with a synthetic source afterward.
Do not broaden permissions, replace the supervisor or kill other Hermes agents.

The menu route has a 6 MiB JSON body limit to accommodate base64. Other routes
retain their existing 500,000-byte limit and general chat profile allowlist.
Only the fixed menu extraction protocol is accepted: callers cannot supply
commands, file paths, URLs, system prompts, model choices or other agent profiles.
One recognition request runs at a time; concurrent requests return HTTP 429.
OCR has a shared 25-second budget and Hermes a 110-second subprocess timeout.
The Next action allows 145 seconds; deployment/proxy duration limits must also
accommodate that duration. Source files are never published or written to storage.

Hermes is initialized with zero tools, workspace context-file loading disabled, memory and
background review disabled, and no reused conversation. Its temporary home keeps
runtime logs/session state isolated from other profiles. Only this menu profile's
own SOUL is copied into that temporary home and loaded as its identity. The parent
service owns the directory and cleans it after forcibly timed-out child processes.
The child environment excludes bridge credentials and request-dumping flags.
The runner fails closed
if the installed Hermes version adds any tool despite the empty toolset. A single
authenticated M1 extraction produces a draft only; database writes continue to
require the existing ownership checks and the explicit review confirmation.

The M1 profile and authenticated menu route were installed on 2026-09-22.
The native OCR binary was compiled on the M1 and tested with synthetic PNG,
JPEG, WebP and PDF files; a nine-page PDF was rejected. Complete authenticated
PNG and PDF requests through the active HTTP bridge and Hermes preserved both
articles, the visible EUR price and a missing price as null, and cleaned their
request directories. These synthetic round trips took 8.6 and 3.0 seconds
respectively; this is a smoke test, not a latency guarantee. The source change
for the dashboard remains on the local feature branch until it is published.

The existing persistence helper is not transactional: failed cleanup and
simultaneous first-menu creation retain the pre-existing system limitations.
The dialog blocks repeat submission after an uncertain save and asks the user
to reload and inspect the menu before retrying.
