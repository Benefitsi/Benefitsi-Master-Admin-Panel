# Inline A01 partner editor — implementation and verification

Date: 2026-10-07. Synthetic fixtures only; no production actions.

Implemented `PartnerDetailsEditor` with injected `DetailServices`, `onDirtyChange({dirty,busy})`, and `onSaved()`. The backend and controller remain primary-owned.

## Behavior

- German profile/contact fields appear once: name, existing partner type options, comma-separated categories, description, address, public business phone/email, website.
- Existing social URLs and opening-time fields save individually. Editing one time sends only that column, preserving the other time and closure flag.
- Every changed field has an explicit save button. No business data autosaves. Confirmation appears only after the server returns the expected partner/row identity and value.
- Profile responses update the stored revision while other pending drafts remain. Edits made to the same field during an outstanding save also remain drafts.
- Same-row save actions are serialized with synchronous locks; unrelated input fields remain editable. Loading and writing contribute to the controller's busy status.
- Keyed partner sessions and request epochs suppress late loads/writes and callbacks from old selections. Invalid returned partner identities never become editable.
- Social/hour additions retain their UUID and first submitted payload across failed/lost-response retries. Invalid URL or incomplete open-hour drafts remain correctable before submission. Weekdays use the backend convention Monday=1 through Sunday=7.
- Explicit discard requires confirmation. Discarding a previously submitted addition reloads current data because its write may already have succeeded.
- Explicit reload keeps field drafts so conflicts can be compared and retried against the refreshed revision.

## Verification

The initial red test failed because the component was absent. Later regression tests were observed failing on canonical URL confirmation, invalid additions sent prematurely, Sunday labeling/value, and missing conflict reload, then passed with the corresponding changes. The initial module-availability assertion was removed once the real behavior tests could import the component directly.

`node --import tsx --test tests/workspace-partner-edit-ui.test.mjs`: **15 passed, 0 failed**, final run exit 0.

The suite mounts real React under StrictMode in JSDOM and injects only the transport boundary. It exercises explicit save payload/revision, retained errors/drafts, stale loads and saves, wrong partner identity, newer drafts during saves, retry UUID/payload stability, independent hour fields, weekday mapping, correction before additions, canonical URLs, discard confirmation, and conflict reload.

`node node_modules/eslint/bin/eslint.js components/workspace/partner-details-editor.tsx tests/workspace-partner-edit-ui.test.mjs`: **exit 0, no warnings/errors**.

## Integration scope and limits

No installs, builds, browser/server processes, production writes, pushes, account/PIN/permission editing, deletions, or spelling changes were performed. No temporary test/compiler directories were created. Parent integration still needs to wire services and navigation guards and include the component in its project-wide type check and applicable UI checks.

A submitted addition intentionally remains frozen until retry confirmation or explicit discard/reload: a failed response may follow an already committed write. Its stable UUID/payload prevents an accidental second row on retry. Runtime success identity/value checks complement the backend's authoritative validation; JSDOM verification does not claim browser layout coverage.
