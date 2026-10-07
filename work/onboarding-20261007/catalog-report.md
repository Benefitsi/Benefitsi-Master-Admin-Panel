# Task 1 — compact onboarding catalog and safe migrations

## Delivered scope

- `lib/workspace/onboarding-v2.json` snapshots the 53-question version at the task base.
- `lib/workspace/onboarding.json` now contains 42 questions, including 23 core questions, across the same nine sections.
- A01 consolidates A01–A04, C01 consolidates C01/C02/C04, D01 consolidates D01/D02/D03. The requested 17 obsolete IDs are removed.
- New points: B08 guest tracking; C09 current level/badge fit; C10 desired badges/criteria; D09 Deal Drop interest and first content; D10 separate Premium customer promotion with individually agreed production-cost reimbursement and additional first-visit benefit; H05 interest in paid functionality from the established benefit manifest.
- C03 distinguishes per-item production costs and optional cost ranges. D05 covers annual, interval and custom per-guest rules. E01 asks only for microsite approval/corrections. G04 includes social links, menus and prices maintenance.
- H05 deliberately contains only suitable prompt/help; the controller renders manifest-derived benefit details and actual availability. No tariff, price or delivery capability is invented.
- Feature guides now connect stamps, levels, badges, item costs, maintenance responsibilities and manifest-based paid-feature interest to the merged flow.
- No model/schema, controller, prepared-facts, filtering, direct-edit or external data code was changed.

## Preservation decisions

`templateVersion` is `2026-10-07.3`. Known v1 documents first receive the existing v2 default changes and additions, then the compact v3 update. Known v2 documents upgrade directly. Other versions remain unchanged. The operation is idempotent.

Only field values matching their known prior defaults are updated. Retained custom prompt/help/suggestion, options, answer types, sections and core flags remain. Retained status and hidden flags remain. Unknown custom IDs remain untouched and in their original order.

Merged answers use original-ID headings and retain all original unique nonempty values from answer/change/agreement/reason. If the combined answer fits 10,000 characters, it occupies the retained question's answer field. If it cannot fit, the original retained answer fields remain unchanged and complete source records go into ordinary paragraph blocks.

Every removed question with nonempty legacy fields receives a complete record in ordinary blocks, even when its status was still open or it also contributed to a merged answer. Removed custom wording or meaningful hidden/status flags also receives a record. These records include the question, help, suggestion, options, answer type, core flag, status, hidden flag and every nonempty legacy answer field. Even nonempty whitespace fields are preserved. Unchanged empty open visible defaults produce no history blocks.

Archive records use consecutive chunks of at most 20,000 characters. Joining their texts preserves the exact full record, including values crossing chunk boundaries. Generated block IDs avoid existing IDs. The whole upgrade is atomic: exceeding 200 questions, 500 blocks, field lengths, available block IDs or the 512 KiB UTF-8 serialized-content limit returns the original content object without mutation or truncation. This means an unusually full legacy document may intentionally retain its old version/catalog until the user splits or reduces it.

## Verification

TDD was used. The first behavioral run failed on the missing v3 migration and long-answer archival behavior. A later focused regression first failed on removed open answers and nonempty whitespace records, then passed after the preservation fix.

- `node --import tsx --test tests/workspace-onboarding-upgrade.test.mjs`: 8/8 pass.
- Cases cover answered A01/A02/A03/A04, C01/C02/C04, D01/D02/D03; bespoke A02 wording; retained custom A01 status/hidden/text; deleted answered A05; custom IDs; v1→v2→v3; empty default templates; no removed question IDs; idempotence; real `validateContent`; 10,000-character source fields; 20,000-character archival chunks; 200-question, 500-block and near-512-KiB limits; omitted merge target; open answered points and nonempty whitespace.
- `node --import tsx --test tests/workspace-model.test.mjs`: 7/9 pass. The two failures are intentional obsolete count assertions only: questions 42 rather than 53; open questions 39 rather than 50. The core assertion in the first count test must also change from 28 to 23. Per ownership instructions this existing test file was left for the integrator.
- Lightweight targeted TypeScript check passes: `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2023 --resolveJsonModule --allowSyntheticDefaultImports lib/workspace/onboarding-upgrade.ts lib/workspace/templates.ts`.
- `git diff --check`: passes.

No installs, production calls/writes, pushes, development servers, browser sessions or large builds were performed. Existing dependencies were reused. No temporary compiler cache or separate test workspace was created.

## Integration notes

The catalog is ready for controller-owned special rendering for A01/C01/D01/E01/C09/H05. Migration history uses the existing ordinary block schema and its existing editor/export behavior. Questions whose combined history exceeds the answer field retain a complete narrative in blocks rather than pretending a truncated answer is complete.

## Review fix — source-version customization provenance

The review found a real preservation defect in v1→v2→v3: a customized v1 field could happen to equal its v2 default and then be overwritten as if untouched. A removed empty/open/visible v1 question with such a field could also disappear without history.

The migration now determines customized fields once against the input version's catalog and carries that per-ID/per-field provenance through both upgrade stages. Protected fields cannot become eligible for replacement merely because an intermediate default matches their text. Removed custom questions are archived using the same source-version provenance. Existing questions absent from the source version's catalog are treated as custom; newly inserted defaults remain eligible for upgrades. This metadata is local to the operation and adds no persisted model fields.

Two focused regressions were added first and both failed with the reviewed implementation: retained A01 customized to the v2 prompt, and removed empty A02 customized to the v2 prompt. Both now pass. The retained-field test also verifies that untouched help still advances to v3, that input content is not mutated, and that repeated upgrades and real content validation remain stable.

Verification after this fix:

- Focused upgrade suite: **10/10 pass** (`node --import tsx --test tests/workspace-onboarding-upgrade.test.mjs`).
- Targeted TypeScript noEmit check for `lib/workspace/onboarding-upgrade.ts`: passes with the existing dependencies.
- Only the migration implementation, its focused tests and this appended report were edited. All controller/model/inline editor changes from other work remain untouched. No builds, installs, production operations or pushes.
