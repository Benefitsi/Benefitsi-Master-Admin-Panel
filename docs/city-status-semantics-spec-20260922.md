# Respect the City publisher's technical/editorial contract

The real private Production row read at 2026-09-22 00:24 UTC has `last_run_ok=false`, `summary.status="partial"`, `summary.health.technical_ok=true`, `summary.health.editorial_status="pending_review"`, `summary.health.city_current=false`, and `research_checked_at="2026-09-21T04:35:08.602002+00:00"`. This is consistent with the already documented City producer contract (Founder-OS `execution-m1.md`): pending editorial work yields a partial overall run while its technical work can pass.

The new Admin agent loader incorrectly forces `technicalOk=false` whenever `last_run_ok=false`; it also looks only for `health.editorial_review_pending`, which is absent in the actual producer row. The live-data component harness therefore renders a technical failure for this partial editorial result. A city configuration of `auto_publish_enabled=true` additionally hides the pending editorial state in the one combined UI field.

Correct this source-backed mapping with minimal changes. The technical result comes from the explicit nullable `summary.health.technical_ok` field, independent of overall `last_run_ok`; retain overall state as its separate field. Missing/malformed technical data stays unknown even when the overall run is successful. False technical evidence stays false. Recognize the observed `health.editorial_status="pending_review"` as pending; retain supported boolean metadata compatibly and keep other unrecognized/absent states unknown unless there is explicit evidence. Pending evidence must not be hidden by an auto-publication configuration.

Show publication configuration and editorial review as distinct data points in the existing city card. Auto-publish true/false/null must keep their own meanings, and an absent control is unknown. Preserve freshness checks, authentication before privileged reads, output whitelists, no private content, noindex and UG/payment gates. No change to actual city controls, collectors, schedules, models, databases or permissions. No broad redesign.

Use the real producer payload shape as a regression: partial overall + technically true + pending review. Also verify real technical false, absent/malformed technical evidence, legacy boolean review metadata, and pending editorial state despite auto-publish enabled. Cover loader plus rendered card, not a source-string mirror. Root owns readback→loader→UI evidence and actual deployment after review.

Work only in this isolated branch from main4906e88. No remote actions or agents by implementer; no secret access; do not push or deploy. Controller-owned plan/spec stay separate from the implementation commit.

## Validation result

Implemented at c99195c. 24 focused loader/UI tests pass; types and scoped ESLint pass. Task and whole-branch reviews found no issues. A fresh read-only Production projection at 2026-09-22 00:33Z was passed through the actual loader and UI: overall partial is retained, technical success and pending editorial review both appear independently. Local browser confirms all three independent card labels. Authentication is synthetic in this fixture; full signed-in Production acceptance and the production build remain separate gates. No external operational setting or source row was changed.
