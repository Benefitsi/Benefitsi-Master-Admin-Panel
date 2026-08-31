# Live Partner Deals and Stamp Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every partner microsite display the partner's real active deals and stamp-card rewards, including all configured variants, while leaving the app and admin panel unchanged.

**Architecture:** Expand the public microsite DTO only with customer-facing fields that are already managed in the admin panel. Add small pure selectors/formatters for available deal banners, welcome deals, and stamp milestones, then use those helpers from the existing premium microsite renderer so builder preview and the public route share the same mapping.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase query DTOs, Node test runner with `tsx`.

**Spec:** User-confirmed requirements in the current conversation: microsites only; use the same partner deal/reward data as the app/admin; show all configured deals and all welcome, standard, and premium stamp rewards; responsive deal banners.

## Global Constraints

- Do not change app or admin-panel behavior, database schema, migrations, or RLS.
- Dynamic deal and reward copy must come from partner data when a configured record exists; config text is not allowed to replace actual record content.
- Only active, currently available public deals may render in the top-deal area.
- Welcome deals belong in the existing stamp-card reward section and must not be duplicated as top deals.
- Multiple records at the same stamp target or multiple top deals must remain visible.

---

### Task 1: Lock the public microsite data contract

**Files:**
- Modify: `lib/public-microsite.ts`
- Modify: `tests/public-microsite.test.mjs`

**Interfaces:**
- `getPublishedMicrositePage()` must return the customer-facing deal fields needed for eligibility and display.
- `getPublishedMicrositePage()` must return the customer-facing reward-milestone fields needed for title, value, audience/track, and description.

- [ ] **Step 1: Write the failing public DTO test**

Add fixture rows representing a fixed discount with a minimum spend, a welcome bonus-stamp deal, and base/premium rewards at the same stamp target. Assert the recorded `select()` strings contain `min_spend`, `benefit_count`, `reward_type`, `discount_value`, `audience`, and `reward_track_target`, and assert those values survive in the returned partner DTO.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --import tsx --test tests/public-microsite.test.mjs`

Expected: FAIL because the current public deal and milestone selections omit the required fields.

- [ ] **Step 3: Implement the narrow query expansion**

Use explicit Supabase string literals for the customer-facing columns. Keep staff instructions and other internal fields out of the query; continue nulling metadata and staff-only content in the public sanitizer.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --import tsx --test tests/public-microsite.test.mjs`

Expected: PASS, including the existing public-redaction assertions.

- [ ] **Step 5: Commit**

```bash
git add lib/public-microsite.ts tests/public-microsite.test.mjs
git commit -m "feat: expose microsite reward data"
```

### Task 2: Add deterministic microsite deal and reward mapping

**Files:**
- Create: `lib/microsite-content.ts`
- Modify: `lib/microsite-deals.ts`
- Create: `tests/microsite-content.test.mjs`

**Interfaces:**
- `getMicrositePublicDeals(deals, now?)` returns every currently available public deal for the top-deal banners, excluding welcome/lifecycle/automatic stamp rewards.
- `getMicrositeWelcomeDeals(deals, now?)` returns every currently available `type === "welcome"` deal.
- `getMicrositeStampRewards(milestones)` returns every active configured milestone, sorted by `required_stamps` without deduplicating equal targets.
- `micrositeDealTitle()`, `micrositeDealDescription()`, `micrositeDealDetails()`, `micrositeWelcomeTitle()`, and `micrositeStampRewardTitle()` derive customer-visible copy from the stored reward type/value/item/description/terms.

- [ ] **Step 1: Write failing mapping tests**

Cover these behaviors:

```js
assert.deepEqual(
  getMicrositePublicDeals([
    { type: "two_for_one", active: true, stock_remaining: null },
    { type: "discount", active: true, discount_type: "fixed", min_spend: 50 },
    { type: "welcome", active: true },
    { type: "bonus_stamp", active: true },
  ]).map((deal) => deal.type),
  ["two_for_one", "discount"],
)

assert.equal(
  micrositeDealTitle({
    type: "discount",
    discount_type: "fixed",
    discount_value: 10,
    min_spend: 50,
  }),
  "10 € Rabatt ab 50 € Einkaufswert",
)

assert.deepEqual(
  getMicrositeStampRewards([
    { required_stamps: 10, active: true, reward_track_target: "premium" },
    { required_stamps: 10, active: true, reward_track_target: "base" },
  ]).map((milestone) => milestone.reward_track_target),
  ["base", "premium"],
)
```

Also cover that inactive, expired, future, and sold-out deals are excluded, and that a welcome bonus with `benefit_count: 2` produces a title containing two stamps.

- [ ] **Step 2: Run the mapping tests to verify they fail**

Run: `node --import tsx --test tests/microsite-content.test.mjs`

Expected: FAIL because the mapping module and functions do not yet exist.

- [ ] **Step 3: Implement the minimal pure helpers**

Centralize availability checks around `active`, stock, and `valid_from`/`starts_at`/`valid_until`/`ends_at`. Preserve input order for equal-priority deals, sort milestones numerically, and format fixed/percent/item/2-for-1/bonus-stamp values from the stored fields.

- [ ] **Step 4: Run the mapping tests to verify they pass**

Run: `node --import tsx --test tests/microsite-content.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/microsite-content.ts lib/microsite-deals.ts tests/microsite-content.test.mjs
git commit -m "feat: map partner microsite rewards"
```

### Task 3: Render every real deal and stamp reward responsively

**Files:**
- Modify: `components/microsite/restaurant-premium-microsite.tsx`
- Modify: `tests/microsite-responsive.test.mjs`

**Interfaces:**
- `DealsSection` consumes the selectors from `lib/microsite-content.ts` and renders one actual deal banner per returned top deal.
- The stamp-card reward grid consumes every welcome presentation and every configured milestone presentation, including multiple rows at 5 or 10 stamps and separate base/premium rows.

- [ ] **Step 1: Add renderer contract assertions before changing JSX**

Assert that the component source imports the mapping helpers, renders a collection of deal banners, uses a desktop two-column layout when multiple banners exist, and keeps the mobile single-column layout. Assert that dynamic reward title/description output is not read from `textValue(config, ...)` when a real partner record is present.

- [ ] **Step 2: Run the renderer contract test to verify it fails**

Run: `node --import tsx --test tests/microsite-responsive.test.mjs`

Expected: FAIL because the current renderer finds only one 2-for-1 deal, hardcodes the welcome card, and uses one milestone per stamp number.

- [ ] **Step 3: Replace the single-deal and single-milestone derivation**

Keep the existing section styling, animation, CTA, and admin-editable visual settings. Replace only dynamic content sources: render all public deal cards in a responsive grid; render all welcome cards and all milestone rows; use stored titles/descriptions/reward values as the content source, with neutral omission when no record exists.

- [ ] **Step 4: Run the renderer contract test to verify it passes**

Run: `node --import tsx --test tests/microsite-responsive.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/microsite/restaurant-premium-microsite.tsx tests/microsite-responsive.test.mjs
git commit -m "feat: render all partner microsite deals"
```

### Task 4: Full verification and main update

**Files:**
- No additional source files.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint`

Expected: zero errors; report any pre-existing warnings separately.

Run: `npm run build`

Expected: successful TypeScript check and production build.

- [ ] **Step 3: Update local main and push**

```bash
git branch -f main HEAD
git push origin main:main
```

Expected: fast-forward push from the last remote `main` commit to the verified feature commit.
