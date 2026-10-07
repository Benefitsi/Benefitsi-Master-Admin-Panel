# Inline A01 partner editor — implementation and verification

Date: 2026-10-07. Synthetic fixtures only; no production actions.

Implemented `PartnerDetailsEditor` with injected `DetailServices`, `onDirtyChange({dirty,busy})`, and `onSaved()`. The backend and controller remain primary-owned.

## Behavior

- German profile/contact fields appear once: name, existing partner type options, comma-separated categories, description, address, public business phone/email, website.
- Existing social URLs and opening-time fields save individually. Editing one time sends only that column, preserving the other time and closure flag.
- Independent fields have explicit save buttons; Betriebsart and Kategorien share one atomic classification save. No business data autosaves. Confirmation appears only after the server returns the expected partner/row identity and value.
- Profile responses update the stored revision while other pending drafts remain. Edits made to the same field during an outstanding save also remain drafts.
- Same-row save actions are serialized with synchronous locks; unrelated input fields remain editable. Loading and writing contribute to the controller's busy status.
- Keyed partner sessions and request epochs suppress late loads/writes and callbacks from old selections. Invalid returned partner identities never become editable.
- Social/hour additions retain their UUID and first submitted payload across failed/lost-response retries. Invalid URL or incomplete open-hour drafts remain correctable before submission. Weekdays use the backend convention Monday=1 through Sunday=7.
- Explicit discard requires confirmation. Discarding a previously submitted addition reloads current data because its write may already have succeeded.
- Explicit reload keeps field drafts so conflicts can be compared and retried against the refreshed revision.

## Verification

The initial red test failed because the component was absent. Later regression tests were observed failing on canonical URL confirmation, invalid additions sent prematurely, Sunday labeling/value, and missing conflict reload, then passed with the corresponding changes. The initial module-availability assertion was removed once the real behavior tests could import the component directly.

`node --import tsx --test --test-concurrency=1 tests/workspace-partner-edit-ui.test.mjs`: **22 passed, 0 failed**, final run after classification corrections exit 0.

The suite mounts real React under StrictMode in JSDOM and injects only the transport boundary. It exercises explicit save payload/revision, retained errors/drafts, stale loads and saves, wrong partner identity, newer drafts during saves, retry UUID/payload stability, independent hour fields, weekday mapping, correction before additions, canonical URLs, discard confirmation, and conflict reload.

`node node_modules/eslint/bin/eslint.js components/workspace/partner-details-editor.tsx tests/workspace-partner-edit-ui.test.mjs`: **exit 0, no warnings/errors**.

## Integration scope and limits

No installs, builds, browser/server processes, production writes, pushes, account/PIN/permission editing, deletions, or spelling changes were performed. No temporary test/compiler directories were created. Parent integration still needs to wire services and navigation guards and include the component in its project-wide type check and applicable UI checks.

A submitted addition intentionally remains frozen until retry confirmation or explicit discard/reload: a failed response may follow an already committed write. Its stable UUID/payload prevents an accidental second row on retry. Runtime success identity/value checks complement the backend's authoritative validation; JSDOM verification does not claim browser layout coverage.

## Review corrections

The independent review identified a draft-preservation hole when a pending field is changed back to its pre-save value. The old row comparison deleted that newer input from the draft map, so the acknowledgement could overwrite it and incorrectly clear dirty status. A focused real React regression failed with `dirty:false` while the write was still pending. Per-field pending tracking now retains that raw edit even when it equals the old row, preserving the original value and `dirty:true` after acknowledgement. The regression also explicitly saves that retained value using the acknowledgement's current row and revision, then verifies clean state.

The review also found that a failed explicit reload retained drafts but hid their discard action. A second regression failed on the missing control. The error view now exposes the existing confirmed discard action; rejecting confirmation preserves dirty state, accepting it clears drafts, and a subsequent successful retry loads the stored value.

Both regressions were observed red before their respective changes. The full owned React suite now passes **17/17**; targeted ESLint again exits 0 with no diagnostics. Only the same component, test, and implementation report were changed. Concurrent controller/services changes and the reviewer's separate report were preserved.

## Atomic classification correction

Betriebsart and Kategorien are now displayed together with one explicit `Betriebsart & Kategorien speichern` action whenever either changes. The transport sends `column:'classification'` and `{type,category}` containing both current drafts, falling back to the stored fields. Independent name/contact/hour/social saves keep their existing contract. Category hints and datalist options reflect the current draft type.

Validation requires an exact existing partner-type option and at least one category. Existing `normalizePartnerCategories` and `normalizePartnerCategoriesForType` helpers normalize aliases/deduplicate and reject any remaining category that does not belong to the selected type; no category is silently dropped. The raw payload reaches the server, while success confirmation compares its canonical type/categories, so `Café` acknowledged as `Cafe` clears the submitted draft correctly.

Related field snapshots and pending tracking now clear only acknowledged drafts, retain later type/category edits including a return to pre-save values, and preserve independent profile drafts. A subsequent explicit save uses the confirmed row/revision. Structured classification failures retain both inputs and show the shared error.

Five new real React regressions were observed red before implementation: single atomic payload, canonical category confirmation with type fallback, later reverted classification edits, retained error plus current-type suggestions, and rejection/correction of missing or mismatched categories. The full owned suite passes **22/22**, targeted ESLint is clean, and owned-file whitespace checks pass. No backend/controller files were changed. One initial failing test compared a live React DOM element directly, causing excessive assertion inspection and a terminated test process; it now asserts boolean absence and completes in roughly one second with bounded diagnostics.
