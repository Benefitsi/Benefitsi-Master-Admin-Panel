# Onboarding Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the isolated catalog task and independent reviews; execute integration in this session. Do not dispatch nested agents. The existing user authorization covers implementation and the established publication path.

**Goal:** Turn the existing onboarding into a concise editable review with functional filters, guided interest questions and spelling assistance.

**Architecture:** Keep the existing revisioned workspace JSON contract. Separate questionnaire upgrades, prepared partner facts, explicitly saved partner data and conversational answers. Use existing admin authorization and business rules.

**Tech Stack:** Next.js, React, TypeScript, Supabase, node:test/JSDOM.

**Spec:** ../specs/2026-10-07-onboarding.md

## Global Constraints

- Preserve previous answers and custom wording; no silent truncation.
- No automatic partner offer activation, promotion, payment, subscription or marketing message.
- Use existing dependencies; no large local build, no production test-data writes.
- Shared worktree: each agent edits only its assigned files and stages only those files.

### Task 1: Compact questionnaire and compatible upgrades

**Files:** lib/workspace/onboarding.json, onboarding-v2.json (snapshot), onboarding-upgrade.ts, templates.ts, tests/workspace-onboarding-upgrade.test.mjs.

**Interfaces:** onboardingContent() still returns Content, upgradeOnboarding(Content) still returns Content; templateVersion becomes 2026-10-07.3. No change to model.ts or JSON field schema. Existing current v2 and original v1 must both upgrade idempotently.

- [ ] Snapshot current v2. Write a failing migration test using answered A01/A02/A03/A04, C01/C02/C04 and D01/D02/D03, custom text and answered deleted A05. Verify combined answers retain every original unique value, deleted answered content survives in blocks, no removed question remains, second upgrade is identical. Add a long-answer/near-limit preservation case.
- [ ] Update catalog: retain A01 merged; remove A02/A03/A04/A05. Retain C01 merged; remove C02/C04/C05/C06/C07. Retain D01 merged; remove D02/D03/D04/D06/D07/D08. Remove E05 and F04, move E05 maintenance into G04. Keep all other requested points. Add B08 for existing guest tracking; C09 for level/badge fit and C10 for desired badges/criteria; D09 for Deal Drop interest and first drops; D10 for agreed-cost promotion and additional first-visit benefit; H05 for paid feature interest. C03 asks transparent per-item production costs (range optional). D05 asks per-guest annual/interval/custom validity. E01 only microsite consent/corrections. H05 refers to the established benefit manifest and distinguishes planned delivery from available features.
- [ ] Implement safe v1→v2→v3 upgrade preserving custom defaults, hidden status and answers. Consolidated answers may use old-ID headings. For text beyond 10,000 characters or answers from deleted questions, preserve complete content in ordinary blocks (20,000-character chunks). Respect 200-question, 500-block and total-size limits; if a safe upgrade cannot fit, keep the old content intact instead of truncating. Do not modify genuinely custom question IDs. New empty templates have only the compact catalog.
- [ ] Adjust featureGuides where the old wording conflicts with the merged flow. Run the new behavioral test and existing model test; report intentional old-count assertions for the integrator, do not edit unrelated tests.
- [ ] Commit only task-owned files; write work/onboarding-20261007/catalog-report.md with tests and preservation decisions.

### Task 2: Prepared facts and inline partner editing

**Files:** partner-brief.ts/data.ts; new workspace partner-detail types/reader/writer/actions and React inline editor; services.ts and fixture adapters.

- [ ] Test selected-partner scopes, exact edit whitelist, stale-save rejection, zero updated rows, social/hours row scoping and no unrelated field loss at real PostgREST transport boundary.
- [ ] Map A01 once (name/type/categories/description/address/contact/hours/socials), C01 reward milestones without repeated prose, D01 concise offers, E01 exact microsite URL, C09 stored levels/badges where available.
- [ ] Implement bounded admin-only edits with explicit per-section save and verified returned data; use stored revisions/timestamps and safe URLs. Never pass partial input into a whole-partner overwrite action. Preserve drafts on error and partner switch, prevent stale loads/saves from affecting another partner.

### Task 3: Filter and guided questions

**Files:** question-editor.tsx, new filtering/choice helpers and widgets, model/export integration, UI tests.

- [ ] Reproduce current filter limitation with UI tests selecting combinations and moving away from a topic with no matches. Implement whole-questionnaire intersection and matching topic navigation; next-open respects selection.
- [ ] D01 shows existing offers and interest checklist with short explanations and conditional notes. D05 offers annual/interval/individual choices. D09/D10 cover drop and additional promotion details. H05 lists benefits from the current manifest with useful explanations and interest notes. Persist choices through existing answer JSON string without overwriting old free text; render human-readable exports.
- [ ] Test edits/remount, toggling choices off/on, preserved detail notes, legacy answers, filter counts and hidden-only mode.

### Task 4: Review and release

**Files:** workspace text input component/helper, workspace editor fields, spelling tests, release docs.

- [x] User explicitly deferred spelling correction. Do not implement it.
- [ ] Run targeted workspace/authorization tests and ESLint; independent whole-change review; browser verification with synthetic fixtures at desktop and narrow width. Use Cloud CI for full dependencies/typecheck/build.
- [ ] Commit/push, attach PR, wait for checks, merge and confirm exact production deployment. Read-only live verification on the existing conversation; preserve real answers. Save evidence and clean only own server/worktree/symlink.
