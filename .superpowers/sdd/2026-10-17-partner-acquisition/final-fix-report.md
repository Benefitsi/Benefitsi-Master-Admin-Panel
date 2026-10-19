# Final review fix wave — 2026-10-17

Base reviewed: `a9f6faa`. Branch: `codex/partner-acquisition-20261017`. Authority: approved source spec and controller rulings in `progress.md`; findings in `final-review.md`. This wave addresses both confirmed P2 findings and the controller's additional narrowly scoped CI false-positive correction. No push, main-branch change, production write, dependency installation, build, server, browser, or subagent was used.

## Changes and final contract

1. **Linked source ownership (P2 resolved).** `AcquisitionDocument` gains optional `sourceOwnedFields?: ('name'|'city'|'industry')[]`, a transport-only hint derived from nonempty current partner values. The editor renders owned inputs read-only, describes their ownership using `aria-describedby`, and links the existing Partnerverwaltung next to the fields. Its update handler also ignores attempts to change those fields. Missing source values remain intentionally editable even after a nonempty acquisition completion has been saved and reopened. Prospect fields remain editable. The data service re-reads the current partner projection and independently compares submitted owned values before the Workspace writer; absent or forged client hints cannot authorize an edit. Load, create, save, and exact retry responses retain the correct hint. The codec format and four Action signatures are unchanged.

2. **Concurrent contact conflict (P2 resolved).** The current page's acquisition structure and immutable identity are validated before revision handling. A stale revision returns the current page as `conflict` before append-only comparison with the stale contact array. The exact revision-0/revision-1 create retry remains an exception only when the canonical payload matches; all other stale revisions conflict. Current-revision contact changes/deletions/reorders still fail. The real editor retains its local next step, displays the conflict/reload controls, refuses reload when confirmation is canceled, and replaces the draft with the latest contact history only after confirmation.

3. **Secret-scan false positive (CI-only correction).** Controller-provided run `39021206125`, job `117363210329`, reported one historical fingerprint for the synthetic browser fixture's localStorage namespace. Read-only inspection of the historical file confirmed line 29 is the constant synthetic storage label, not a credential. `.gitleaksignore` adds a documented exact fingerprint only: `c17a1ce21569360cdad9a3e949b9bd56f76bc5f1:tests/acquisition-browser-check.mjs:generic-api-key:29`. The existing unrelated fingerprint is preserved; no file/rule/history exclusion or scanner disabling was added. No history rewrite. Gitleaks is not installed locally; cloud rerun is the controller's verification gate.

The approved source spec and release note now state this precise ownership/conflict contract, the additive type allowance, current verification, and CI limits.

## Regression evidence (actual model/data/React; synthetic external storage only)

- Direct edits of each known name/city/industry, including forged or omitted ownership hints, fail before creating a page or advancing history. Subsequent reload returns acknowledged stock values.
- The real UI exposes known linked fields read-only, has an associated Partnerverwaltung link, and preserves those values and ownership across save/remount/reopen.
- A partner with no source name accepts deliberate acquisition name completion, retains it on reload/index, and permits another edit after reopening. The model verifies that an acquisition value does not manufacture source ownership and that the codec payload is identical with/without the transport hint.
- Unlinked prospects still edit and round-trip name/city/industry.
- Editor A appends a contact while B holds the previous revision; B's save yields the actual current conflict, no extra history, and unchanged caller input. The real UI verifies retained next step, conflict notice, canceled reload, and confirmed reload with A's contact.
- Existing tests continue covering identity tampering, current-revision contact edits/deletions/reorders, exact create retries including canonical UUIDs/property order, foreign-content preservation, authorization, acknowledged-save checks, and draft recovery.

## Commands and results

All commands ran in `/Users/patrick/Documents/New project/work/partner-acquisition-20261017/admin` using existing dependencies.

1. RED before production changes:
   - `node --import tsx --test tests/acquisition-data.test.mjs tests/acquisition-ui.test.mjs` — 51 tests, 43 passed, **8 failed as expected**: missing ownership hint, three accepted direct stock edits, stale-contact result without conflict, editable known UI fields, missing selective ownership in unknown-name UI, and missing conflict UI after concurrent append.
   - `node --import tsx --test tests/acquisition-model.test.mjs` — 14 tests, 13 passed, **1 failed as expected** because source ownership was absent.
2. Initial combined implementation run: 65 tests, 64 passed, 1 test failed because a new test incorrectly expected 16 encoded questions instead of the existing 15. Replaced that incidental count assertion with the meaningful unchanged-payload comparison with/without the hint. No production behavior was changed to satisfy a mistaken count. One old linked-document lookup fixture was also corrected to load actual stock values rather than submit the now-prohibited arbitrary linked name.
3. GREEN, including final code refinement:
   - `node --import tsx --test tests/acquisition-model.test.mjs tests/acquisition-data.test.mjs tests/acquisition-ui.test.mjs` — **65 passed, 0 failed**, exit 0.
   - `./node_modules/.bin/eslint lib/acquisition/model.ts lib/acquisition/data.ts components/acquisition/acquisition-editor.tsx tests/acquisition-model.test.mjs tests/acquisition-data.test.mjs tests/acquisition-ui.test.mjs` — exit 0, no diagnostics (repeated after final refinement).
   - `git diff --check` — exit 0.
4. Additive shared-type verification:
   - `./node_modules/.bin/tsc --noEmit --incremental false` — exit 2, exactly the three known baseline diagnostics: `memory-stamp-map.tsx:4` and `:66` cannot resolve `leaflet`; `partner-image-upscaler.worker.ts:1` cannot resolve `onnxruntime-web/webgpu`. No acquisition diagnostics. No build or new compiler cache.
5. Resource/CI inspection:
   - `df -h .` — 38 GiB free. Read-only process inspection was initially sandbox-denied, then completed through an approved read-only tool escalation. No foreign processes were stopped.
   - `git show c17a1ce21569360cdad9a3e949b9bd56f76bc5f1:tests/acquisition-browser-check.mjs | sed -n '27,31p'` — confirmed the exact historical non-secret storage label.
   - `command -v gitleaks` — unavailable; no installation or claimed scanner pass.

## Remaining gates and limitations

No open finding from this fix wave. The controller owns scoped re-review, push, and exact-lock CI. The pre-existing full-suite failures, reused dependency version differences, and browser/Next-router integration limits remain documented in the release note; this focused wave does not claim a fully green full suite, build, cloud secret scan, or new browser acceptance. Temporary command logs were removed after summarizing their results. No temporary test/compiler folders or new dependency copies were created.
