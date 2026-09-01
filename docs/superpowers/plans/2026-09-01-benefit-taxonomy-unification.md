# Benefitsi Benefit-Taxonomie Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vereinheitlichen von Benefit-Namen und -Dimensionen über App, Admin/Microsites, Partner-/Städte-Seiten, Backend-Public-Resolver und Notion ohne Verlust bestehender Einlösungsdaten.

**Architecture:** Ein zentraler, deterministischer Resolver trennt Belohnungsformat, Auslöser, Kampagne, Aktivierung und Zielgruppe. Die bestehenden Legacy-Enums bleiben lesbar; alle öffentlichen Oberflächen verwenden ausschließlich den Resolver und konkrete öffentliche Titel. Notion wird auf denselben Glossarstand aktualisiert.

**Tech Stack:** Flutter/Dart, Next.js 16/React/TypeScript, Supabase SQL, Notion MCP.

**Spec:** `docs/superpowers/specs/2026-09-01-benefit-taxonomy-unification.md`

## Global Constraints

- Keine unkontrollierte Umbenennung bestehender Datenbank-Enums.
- Keine Änderung von Einlösungs-, Stempel- oder Berechtigungslogik außer der Darstellung.
- Kein statischer Standardartikel; ohne `reward_item` nur `2 für 1`.
- `Top Deal`, `Top-Vorteil`, `Hauptdeal` und `Daily Deal` nicht öffentlich rendern.
- Vor jeder Fertig-/Push-Aussage frische Tests und Builds ausführen.
- Unzusammenhängende lokale Änderungen in den schmutzigen Web-/Datenbank-Worktrees nicht committen.

### Task 1: Gemeinsamen Resolver-Vertrag und Sperrtests anlegen

**Files:**
- Create: `lib/benefit-taxonomy.ts`
- Create: `tests/benefit-taxonomy.test.mjs`

**Interfaces:**
- Produces `benefitTaxonomyLabel(input, language)` and
  `formatBenefitTitle(input, language)` for later Admin/Microsite consumers.
- Input includes `type`, optional `discount_type`, `reward_item`, `metadata`,
  and optional separated dimensions.

- [ ] **Step 1: Write failing tests** for concrete titles, welcome/comeback
  splits, no default `Döner`, and banned public labels.
- [ ] **Step 2: Run** `npm test -- tests/benefit-taxonomy.test.mjs` and verify
  the missing resolver failure.
- [ ] **Step 3: Implement** the minimal pure resolver in
  `lib/benefit-taxonomy.ts`.
- [ ] **Step 4: Run** the focused test and the existing Admin test suite.
- [ ] **Step 5: Commit** only the new resolver, tests, spec, and plan.

### Task 2: App public labels and partner-form labels

**Files:**
- Modify: `Benefitsi-App-publish/lib/features/deals/partner_detail_deal.dart`
- Modify: `Benefitsi-App-publish/lib/pages/app/discover/widgets/discover_partner_card.dart`
- Modify: `Benefitsi-App-publish/lib/components/partner_deal_badges/partner_deal_badges_widget.dart`
- Modify: `Benefitsi-App-publish/lib/pages/partner/partner_deal_form/partner_deal_form_widget.dart`
- Test: existing Dart deal-format and widget tests; add focused tests beside existing taxonomy tests.

**Interfaces:**
- Preserve backend enum parsing and checkout behavior.
- Render concrete titles through the existing public formatter.

- [ ] **Step 1:** Add failing Dart assertions for canonical German labels and
  removal of `Top Deal`, `Hauptdeal`, `Daily Deal`, and `Döner` fallback.
- [ ] **Step 2:** Run the focused Dart tests and confirm failure.
- [ ] **Step 3:** Replace visible label branches and legacy copy while keeping
  English translations for English mode.
- [ ] **Step 4:** Run focused tests, `dart format`, and `flutter analyze`.
- [ ] **Step 5:** Commit App changes on the current App release branch.

### Task 3: Admin and Microsite German taxonomy

**Files:**
- Modify: `lib/reward-config.ts`
- Modify: `app/partner-admin.tsx`
- Modify: `lib/microsite-content.ts`
- Modify: `app/microsite-panel.tsx`
- Test: `tests/*.test.mjs`

**Interfaces:**
- Admin fields expose `Belohnungsformat`, `Auslöser`, `Kampagne`,
  `Aktivierung`, `Zielgruppe`, `Öffentlicher Titel`.
- Existing `DealType` values remain accepted on read/write.

- [ ] **Step 1:** Add failing tests for German option labels, public title
  mapping, and absence of visible Top-Deal fields.
- [ ] **Step 2:** Run focused tests and verify failure.
- [ ] **Step 3:** Implement the labels/resolver wiring and rename only visible
  builder labels; preserve serialized legacy config keys during migration.
- [ ] **Step 4:** Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] **Step 5:** Commit the Admin/Microsite changes.

### Task 4: Partner- and Städte-Seite resolver parity

**Files:**
- Create or modify: `benefitsi-web/src/lib/benefits/benefit-taxonomy.ts`
- Modify: `benefitsi-web/src/lib/partners/supabase-partners.ts`
- Modify: `benefitsi-web/src/lib/partners/public-partner-directory.ts`
- Modify: `benefitsi-web/src/lib/cities/city-home.ts`
- Modify: `benefitsi-web/src/app/stadt/[citySlug]/vorteile/page.tsx`
- Modify: relevant partner card/static copy files containing old public terms.
- Test: `benefitsi-web/tests/benefit-taxonomy.test.mjs` and existing city tests.

**Interfaces:**
- Public partner/city resolvers return the same public title and canonical
  label for the same deal row.
- No change to Supabase RLS, checkout, or city publication gates.

- [ ] **Step 1:** Add failing parity tests across partner directory and city
  benefit rendering.
- [ ] **Step 2:** Run focused tests and verify failure.
- [ ] **Step 3:** Wire the canonical resolver, replace divergent labels, and
  remove stale static Top-/Döner defaults.
- [ ] **Step 4:** Run the full relevant city test suite, `npm run lint`, and
  `npm run build`.
- [ ] **Step 5:** Commit only taxonomy files and related tests on the current
  web branch; leave unrelated worktree changes untouched.

### Task 5: Backend data contract and safe backfill

**Files:**
- Create: `Benefitsi-Database/supabase/migrations/20260901120000_benefit_taxonomy_dimensions.sql`
- Test: `Benefitsi-Database/tests/benefit_taxonomy_migration_test.py`
- Modify: only the database documentation needed to describe the migration.

**Interfaces:**
- Add nullable dimension/display fields only if the live schema already has
  the public display-field lineage; do not rewrite legacy `type` values.
- Backfill is deterministic and idempotent; no production data deletion.

- [ ] **Step 1:** Add failing SQL/source tests for idempotence, legacy reads,
  and the no-default-item rule.
- [ ] **Step 2:** Run the database test and verify failure.
- [ ] **Step 3:** Implement a schema-only additive migration and deterministic
  backfill using existing metadata/display fields.
- [ ] **Step 4:** Run database tests and a local dry-run; do not apply to
  production until the migration inventory gate is green.
- [ ] **Step 5:** Commit only the migration, test, and documentation.

### Task 6: Notion glossary synchronization

**Files:**
- Update: `04 Deals & Naming`
- Update: `09 Veröffentlichung & Gesamtbereich Audit`
- Update: `Benefitsi Feature Catalog` entries whose visible names conflict.

- [ ] **Step 1:** Fetch each page/database immediately before editing.
- [ ] **Step 2:** Replace deprecated visible terms, document the separated
  dimensions, and mark `Top Deal` as internal/legacy per the approved spec.
- [ ] **Step 3:** Preserve source links and add a migration changelog dated
  2026-09-01.
- [ ] **Step 4:** Fetch again and verify exact text and no banned visible terms.

### Task 7: Release, push, deploy, and live verification

**Files:**
- No additional source files; use each repository's release configuration.

- [ ] **Step 1:** Run fresh verification for App, Admin, Web, and Database.
- [ ] **Step 2:** Review staged diffs and confirm unrelated local changes are
  not included.
- [ ] **Step 3:** Push the focused commits to their tracked branches.
- [ ] **Step 4:** Trigger/verify Vercel production deployments for Admin and
  Web; verify live pages and headers.
- [ ] **Step 5:** Trigger the configured App Store/TestFlight workflow from
  the App `main` branch; verify build artifact/processing status.
- [ ] **Step 6:** Verify live Supabase read-only parity and record any release
  gate that prevents a production migration or store publication.
