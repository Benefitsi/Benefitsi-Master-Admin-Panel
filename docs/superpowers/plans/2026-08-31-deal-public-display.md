# Deal Public Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give administrators explicit public deal titles/subtitles, remove the Top-Vorteil presentation, and keep app deal details customer-facing.

**Architecture:** Store nullable `display_title`/`display_subtitle` on `public.deals`, parse them through the existing Admin deal form, and reuse the same explicit/null/empty semantics in the Admin microsite preview and Flutter formatter. Keep established fallback wording for legacy deal types (with a normalized two-for-one item title) and keep existing eligibility/redemption logic intact while removing internal fields from the Flutter detail presentation.

**Tech Stack:** Next.js/React + TypeScript Admin Panel, Supabase SQL migrations, Flutter/Dart app, Node test runner, Flutter tests.

**Spec:** `docs/superpowers/specs/2026-08-31-deal-public-display-design.md`

## Global Constraints

- Deals remain equal; no Top-Vorteil selector or badge is added.
- `display_title` null/empty falls back to the established generated title; legacy two-for-one deals include their reward item in that fallback.
- `display_subtitle` null uses the generated subtitle; an explicitly empty string hides it.
- `staff_instructions`, audience, technical type/category/application, and internal notices are never rendered in the user-facing deal details.
- Existing eligibility, redemption, validation, and legacy-deal behavior must remain compatible.

---

### Task 1: Admin deal data and payload contract

**Files:**
- Modify: `lib/admin-data.ts`, `lib/deal-form.ts`, `app/partner-actions.ts`
- Test: `tests/deal-public-display.test.mjs`

**Interfaces:**
- `Deal` exposes `display_title: string | null` and `display_subtitle: string | null`.
- `readDealFormDraft(formData, prefix?)` returns `displayTitle`, `displaySubtitle`, and `displaySubtitleAuto`.
- `parseDealPayload` writes the same fields while preserving an explicit empty subtitle.

- [x] **Step 1: Write the failing tests** for payload parsing and draft preservation, including null/empty/custom subtitle cases.
- [x] **Step 2: Run the focused Node test and confirm it fails because the fields are not yet parsed.
- [x] **Step 3: Add the fields to the TypeScript type, draft reader, parser, validation, and error-draft path.
- [x] **Step 4: Run the focused test and the existing partner-management regression tests; confirm green.
- [x] **Step 5: Commit the Admin contract changes.

### Task 2: Admin editor and public preview

**Files:**
- Modify: `app/partner-admin.tsx`
- Test: `tests/deal-public-display.test.mjs`

**Interfaces:**
- `DealFields` renders `display_title`, `display_subtitle`, and `display_subtitle_auto` in an “Öffentliche Darstellung” section.
- Create, edit, and rejected-save drafts restore all three values.
- No Top-Vorteil selector or badge is rendered.

- [x] **Step 1: Add source-level regression assertions for the fields, auto-subtitle control, preview, and absence of Top-Vorteil UI.
- [x] **Step 2: Run the focused test and confirm the assertions fail against the current editor.
- [x] **Step 3: Implement the controlled fields, draft hydration, preview, and neutral deal-card presentation.
- [x] **Step 4: Run focused and full Admin tests plus TypeScript/build checks.
- [x] **Step 5: Commit the editor changes.

### Task 3: Microsite public title/subtitle and badge removal

**Files:**
- Modify: `lib/public-microsite.ts`, `lib/microsite-content.ts`, `components/microsite/restaurant-premium-microsite.tsx`
- Test: `tests/deal-public-display.test.mjs`

**Interfaces:**
- Public deal selection includes `display_title` and `display_subtitle`.
- `micrositeDealTitle` and `micrositeDealDescription` honor the explicit values and preserve legacy fallbacks. The common legacy two-for-one fallback is `2 für 1 <Artikel>` when an item is available.
- The phone preview and deal cards contain no Top-Vorteil badge text.

- [x] **Step 1: Add failing helper/query/source tests for title/subtitle precedence, empty subtitle suppression, and badge absence.
- [x] **Step 2: Run them and confirm the expected failures.
- [x] **Step 3: Extend the public columns/types, implement fallback helpers, and remove badge rendering.
- [x] **Step 4: Run all Admin tests and build/lint checks.
- [x] **Step 5: Commit the Microsite changes.

### Task 4: Flutter public deal model and formatter

**Files:**
- Modify: `lib/features/deals/partner_detail_deal.dart`
- Test: `test/partner_detail_deal_formatter_test.dart`

**Interfaces:**
- `PartnerDetailDeal.fromJson` preserves nullable versus empty `display_subtitle`.
- `formatPartnerDetailDeal` and `formatRedeemedDealTitle` use the explicit public title/subtitle rules.

- [x] **Step 1: Add failing formatter tests for explicit, empty, and null title/subtitle values.
- [x] **Step 2: Run the focused Flutter tests and confirm failure.
- [x] **Step 3: Add model fields and implement the formatter fallback rules.
- [x] **Step 4: Run the focused formatter suite and the full Flutter test suite.
- [x] **Step 5: Commit the Flutter formatter changes.

### Task 5: Flutter detail view and neutral deal cards

**Files:**
- Modify: `lib/pages/app/partner_details/partner_details_widget.dart`, `lib/features/deals/partner_detail_deal.dart`
- Test: `test/partner_detail_deal_formatter_test.dart`, `test/partner_detail_public_details_test.dart`

**Interfaces:**
- A pure public-info helper returns only title, customer description, terms, and readable date/limit information.
- The “Details ansehen” sheet uses that helper and never renders internal metadata.
- Deal cards render without the Top-Vorteil badge or top-card-only label.

- [x] **Step 1: Add failing tests for public info filtering and source/runtime badge absence.
- [x] **Step 2: Run the focused tests and confirm failure.
- [x] **Step 3: Implement the public-info helper, wire it into the sheet, and remove the badge branch.
- [x] **Step 4: Run focused and full Flutter tests plus `flutter analyze`.
- [x] **Step 5: Commit the Flutter UI changes.

### Task 6: Supabase schema migration

**Files:**
- Create: `../Benefitsi-Database/supabase/migrations/20260831160000_deal_public_display.sql`

**Interfaces:**
- `public.deals` gains nullable `display_title` and `display_subtitle`.
- `public.deals_app_view` keeps its existing column order and appends the two public fields, avoiding destructive view changes.

- [x] **Step 1: Add a migration shape test that checks both columns and the view projection.
- [x] **Step 2: Run it and confirm failure because the migration is absent.
- [x] **Step 3: Add the idempotent `ALTER TABLE` and compatible `CREATE OR REPLACE VIEW` definition.
- [x] **Step 4: Run the migration/static database checks and inspect the diff for unrelated files.
- [x] **Step 5: Commit only the new migration.

### Task 7: Cross-repository verification

**Files:**
- No new production files.

- [x] **Step 1: Run `npm test`, Admin build, focused/full Flutter tests, and `flutter analyze`.
- [x] **Step 2: Run `git diff --check` in every touched repository.
- [x] **Step 3: Review status to ensure unrelated dirty database files remain untouched.
- [x] **Step 4: Report exact commits and verification results; do not claim live deployment until the user explicitly requests push/deploy.
