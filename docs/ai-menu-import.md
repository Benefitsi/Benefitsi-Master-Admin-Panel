# Reviewed menu import from photos and PDF

Admins can select **Karte aus Foto / PDF** in their existing menu editor.
Partner owners receive the same feature only after an admin enables
**Menüimport im Partner-Dashboard** in that partner's **Menu Management** tab.
The same import component is available before creating the first menu.
Recognition produces a temporary, editable preview; it does not save menu rows.
The final action checks ownership again and requires explicit confirmation.
It appends reviewed categories/items and preserves existing menu metadata and
content. A partner without a menu receives a new published menu at confirmation.

Review starts with the original beside a compact category/item/price list.
Images can be enlarged and multiple source photos paged through; PDFs render
inline with a link fallback. Clicking an item opens its fields, while the details
toggle opens the complete editable list. Recognition notes start collapsed and
missing-price markers jump to the relevant editor. Edits invalidate the review
checkbox. Confirmation validates the complete draft even when editors are closed,
so missing prices cannot turn into zero through string-to-number conversion.

## Configuration

- `M1_BRIDGE_URL` and `M1_BRIDGE_SECRET`: existing server-only bridge configuration.
- Dedicated Hermes profile `benefitsi-menu`, using the existing MiniMax-M3.0
  credential on the M1. No Gemini credential is used for menu recognition.
- Apply `20260928072650_add_partner_menu_import_access.sql` before deploying the
  application. No new storage bucket is required.
- The authenticated Next server action sends originals to the exact bridge route
  `/hermes/menu-extract`. Apple Vision/PDFKit reads them locally on the M1.
  Only the resulting text, page numbers, confidence and coordinates reach MiniMax.
  Each request uses temporary files and a disposable Hermes home that are deleted
  on completion or failure. The file-selection screen discloses this processing.

## Partner access

`partner_feature_flags` stores the `menu_ai_import` entitlement per partner.
No flags are seeded: missing rows mean disabled. Only authenticated admins can
insert/update flags; owners can read their own flag and staff cannot manage it.
The flag is separate from the owner-editable partner profile. Preview and final
confirmation both verify the current owner and current flag; lookup errors fail
closed. Admins can import regardless of the partner's flag.

The deployed menu tables previously permitted only admin writes. The migration
adds RLS policies allowing explicitly enabled owners to read and manage their
own menus, categories and items, including correcting imported content and
rolling back a failed import. Staff and other partners receive no additional
rights. Item/category associations must stay within the same menu. Disabling
the feature removes these new owner rights; existing admin/public policies and
previously saved menu content remain in place. An already-running recognition
may finish after revocation, but its draft cannot be confirmed by that owner.

The menu routes declare `maxDuration = 180` to accommodate the bridge request's
145-second budget. Roll out the additive migration first, then application code;
the empty flag table keeps all partner access off during rollout. To roll back
the application, first turn off any enabled flags to revoke the added owner
database rights. Keep the additive table so the previous application can run
without deleting any partner/menu data.

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

A completed model reply with malformed JSON or a schema-invalid draft marked
complete gets at most one regeneration from the original OCR, with an explicit
format correction. The runner reuses the bridge's exact schema validator, so
extra fields (such as an observed `price_note`) are never silently discarded and
missing fields/values are never filled locally. Both calls share the existing
110-second subprocess limit. Failed/partial runs and drafts marked incomplete
fail immediately. The regenerated draft must pass all completion, schema, type
and size checks; there is no third attempt.
The UI distinguishes known OCR errors from invalid agent output and transient
service failures. Unknown upstream details are never shown to the user.

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
The access migration and transactional SQL suite were verified on the existing
staging project on 2026-09-28. The suite uses disposable admin, owner and staff
identities and rolls back all fixtures. It exercises actual RLS for flag
escalation, foreign menus/categories, import persistence, correction, revocation
and cleanup. No production menu was modified. The rendered shared workspace is
also tested for both existing and first-menu imports, with partner flags on/off
and admin bypass; switch tests cover pending, success, error and unavailable state.

## M1 runtime

Source files live in `ops/menu-agent/`; the profile lives in
`tools/hermes-city-profiles/benefitsi-menu/`. Install the profile into
`~/.hermes/profiles/benefitsi-menu/`, with `hermes_menu_runner.py` and the compiled
`menu-ocr` binary in its `runtime/` directory. Compile using
`xcrun swiftc -O menu_ocr.swift -o menu-ocr` on macOS with the developer tools.
The runner uses the existing Hermes virtual environment and only the central
`MINIMAX_API_KEY`; no credentials are copied into this repository.
It loads `validate_draft` from the existing `~/.arc-m1-bridge/benefitsi_menu_service.py`
module. Install the bridge service before running the complete extraction test.

For a first installation, stage the profile/runtime and verify the native OCR
and Python unit tests first. Then `install_bridge.py --expected-sha256 <hash>`
patches the inspected `~/.arc-m1-bridge/m1_bridge.py` and installs the service
alongside it. It refuses an unexpected or already-patched bridge and creates a
dated rollback copy. Run full extraction tests after the service is installed.
For an existing installation, test runner changes in a disposable profile copy
against the installed service, then replace only the reviewed runner with a
rollback copy; do not rerun the first-install script.
The current `com.arc.m1-bridge` launch agent supervises
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
respectively; this is a smoke test, not a latency guarantee. The dashboard
release is tracked in PR #30.

The existing persistence helper is not transactional: failed cleanup and
simultaneous first-menu creation retain the pre-existing system limitations.
The dialog blocks repeat submission after an uncertain save and asks the user
to reload and inspect the menu before retrying.
