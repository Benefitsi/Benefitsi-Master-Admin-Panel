# Partner Management Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Benefitsi partner-management workspace clearer, German-first, safer to edit, and easier to review without changing its database schema, production data, or delete behavior.

**Architecture:** Keep `app/partner-admin.tsx` as the existing client workspace and keep `app/partner-actions.ts` plus `lib/admin-data.ts` as the only write/read boundaries. Improve presentation, labels, local state, and existing action wiring in place; add only small pure helpers when they make the UI testable. Do not add a parallel partner model, new API, or new dependency.

**Tech Stack:** Next.js App Router, React client components, TypeScript/TSX, Tailwind utility classes, existing Supabase server actions, Node test runner with `tsx`.

**Spec:** Partner-management simplification audit supplied by the coordinator in the task prompt.

## Global Constraints

- Do not change Supabase schema, migrations, RLS, or production data.
- Do not execute `deletePartner`, delete a partner in the browser, or add fake data.
- Reuse the existing `PartnerWithDeals`, `OwnerOption`, `Visit`, `PartnerStaff`, `PartnerOpeningHour`, `PartnerHoliday`, and `PartnerMediaSpec` models.
- Keep existing server actions and public revalidation behavior; only wire existing actions where the current UI already supports them.
- Keep the existing unsaved form safety behavior and add only client-side warning state; do not silently submit or discard edits.
- Keep the earlier local `server-only` test-runner fix and do not stage unrelated worktree files.

## File Map

- Modify `app/partner-admin.tsx`: partner overview, list, detail navigation, profile form grouping, German copy, staff/activity/danger presentation, dirty-state guard, and existing action affordances.
- Modify `tests/partner-management-regressions.test.mjs`: static regression coverage for German labels, simplified metrics, safe danger-zone copy, complete staff/activity states, and preserved existing actions.
- Modify `lib/partner-config.ts` only if an existing platform label/helper is needed; no schema or API changes.
- Create no new runtime dependency and no database file.
- Create `docs/superpowers/plans/2026-09-04-partner-management-simplification.md`: this plan.

### Task 1: Lock the new visible contract with failing tests

**Files:**
- Modify: `tests/partner-management-regressions.test.mjs`
- Read: `app/partner-admin.tsx`

**Interfaces:**
- The tests inspect the existing `PartnerWorkspace`, `PartnerDetail`, `PartnerStaffPanel`, `RedemptionHistoryPanel`, and `DeletePartnerForm` source without adding a runtime renderer dependency.

- [ ] **Step 1: Add assertions for the required contract**

```js
test("partner management uses concise German overview copy and keeps approvals inline", async () => {
  const code = await readFile(adminUrl, "utf8")
  assert.match(code, /Partnerverwaltung/)
  assert.match(code, /Aktive Partner/)
  assert.match(code, /Menüfreigaben erforderlich/)
  assert.doesNotMatch(code, /Supabase routing fields/)
  assert.doesNotMatch(code, /Deal recommended/)
})

test("partner editing exposes a single German save flow with unsaved protection", async () => {
  const code = await readFile(adminUrl, "utf8")
  assert.match(code, /Ungespeicherte Änderungen/)
  assert.match(code, /beforeunload/)
  assert.match(code, /Änderungen speichern/)
})

test("staff and activity panels describe loaded data without inventing records", async () => {
  const code = await readFile(adminUrl, "utf8")
  assert.match(code, /Mitarbeiterzugriff/)
  assert.match(code, /Keine Mitarbeiterzugriffe vorhanden/)
  assert.match(code, /Kundenaktivität/)
  assert.match(code, /Keine Besuche für diesen Partner geladen/)
  assert.match(code, /Erneut versuchen/)
})

test("danger zone explains permanent deletion and retains password confirmation", async () => {
  const [actions, admin] = await Promise.all([
    readFile(actionsUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ])
  assert.match(admin, /Gefahrenbereich/)
  assert.match(admin, /Partnernamen bestätigen/)
  assert.match(admin, /delete_password/)
  assert.match(actions, /verifyAdminPassword/)
})
```

- [ ] **Step 2: Run the focused test and verify it fails for missing copy/behavior**

Run:

```bash
node --import tsx --test tests/partner-management-regressions.test.mjs
```

Expected: FAIL because the current source still contains English overview labels, recommendation badges, and no unsaved/danger-zone contract.

### Task 2: Simplify the overview and partner list

**Files:**
- Modify: `app/partner-admin.tsx:450-930`

**Interfaces:**
- Consumes: existing `partners`, `pendingMenuReviews`, `PartnerWithDeals`, and `LiveMetric`.
- Produces: German overview copy, two primary KPIs, one inline menu-approval attention link, and partner rows without repeated recommendation badges.

- [ ] **Step 1: Replace overview copy and primary metrics**

```tsx
<div className="grid overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-3">
  <LiveMetric label="Partner" value={partnerCount} />
  <LiveMetric label="Aktive Partner" value={activePartners} />
  <LiveMetric
    href="/menu-approvals"
    label="Menüfreigaben erforderlich"
    value={pendingMenuReviews.length}
  />
</div>
```

Use a short German workspace title and description. Keep featured/deal totals as small secondary text in the list header instead of primary dashboard tiles.

- [ ] **Step 2: Remove repeated deal-recommendation badges**

Remove the per-row `Deal recommended` element. Keep the existing deal count and pending menu review count so the list remains informative without repeated attention noise.

- [ ] **Step 3: Run the focused regression**

Run:

```bash
node --import tsx --test tests/partner-management-regressions.test.mjs
```

Expected: Task 1 overview assertions pass; remaining assertions stay red.

### Task 3: Make partner detail editing explicit and safe

**Files:**
- Modify: `app/partner-admin.tsx:900-2140`

**Interfaces:**
- Consumes: current `PartnerForm`, `PartnerDetail`, `savePartner` action, and existing tab state.
- Produces: German tabs and section names, concise header, visible save/dirty state, and a browser navigation warning only while an edit form is dirty.

- [ ] **Step 1: Add a small dirty-state hook inside `PartnerForm`**

Track `isDirty` after user input and clear it after a successful save. Register `beforeunload` only while dirty, and render a compact status plus one primary save submit button.

```tsx
const [isDirty, setIsDirty] = useState(false)

useEffect(() => {
  if (!isDirty) return
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault()
    event.returnValue = ""
  }
  window.addEventListener("beforeunload", handleBeforeUnload)
  return () => window.removeEventListener("beforeunload", handleBeforeUnload)
}, [isDirty])

useEffect(() => {
  if (state.ok) setIsDirty(false)
}, [state.ok])
```

- [ ] **Step 2: Localize the partner detail surface without changing data contracts**

Rename visible tabs and headings to `Profil`, `Stempel & Deals`, `Menü`, `Mitarbeiterzugriff`, `Kundenaktivität`, and `Gefahrenbereich`. Remove the visible Supabase routing description; keep technical routing fields only where the existing form needs them.

- [ ] **Step 3: Keep profile, hours, contact, and media as clear sections**

Use the existing `FormSection` and `OpeningHoursPanel`. Place one `Änderungen speichern` submit button near the form end and show `Ungespeicherte Änderungen` while dirty. Do not add a second save action or change the existing server action payload.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --import tsx --test tests/partner-management-regressions.test.mjs
```

Expected: overview and save-flow assertions pass; staff/activity/danger assertions remain red until Task 4.

### Task 4: Clarify stamps/deals, staff, activity, and danger zone

**Files:**
- Modify: `app/partner-admin.tsx:3318-3465`, `5996-6225`, `8580-9250`

**Interfaces:**
- Consumes: existing `MilestonesPanel`, `DealsPanel`, `PartnerStaffPanel`, `RedemptionHistoryPanel`, `StampProgressPanel`, `DeletePartnerForm`, `savePartnerStaff`, `deletePartnerStaff`, and `verifyAdminPassword`-backed `deletePartner`.
- Produces: clear German copy and complete empty/loading/error displays using only loaded values.

- [ ] **Step 1: Separate stamp rewards from deals visually**

Keep the existing two panels as sibling `EditorShell`s with German titles and short descriptions. Put advanced deal rules in their existing collapsible sections; do not alter the action payloads.

- [ ] **Step 2: Present staff as a useful list**

Render each existing staff row with name, role, active/inactive status, and last-use only if the existing data has a timestamp. Retain existing add/remove action forms. Use `Admin`, `Scanner`, `Aktiv`, `Deaktiviert`, and German empty/error labels.

- [ ] **Step 3: Make activity truthful**

Use the existing progress and visit arrays for compact counts. Show an explicit German empty state when arrays are empty. Keep existing filters and retry-safe behavior; do not invent an export or remote retry API.

- [ ] **Step 4: Move deletion into an explicit danger section**

Keep the existing danger tab, rename it `Gefahrenbereich`, explain permanent impact and lack of automatic recovery, require partner-name confirmation in the existing client dialog, and retain the admin-password field/server verification. Do not execute the action.

- [ ] **Step 5: Run focused tests and type-check through the build**

Run:

```bash
node --import tsx --test tests/partner-management-regressions.test.mjs
npm run lint
npm run build
```

Expected: focused tests pass, lint has no errors, build exits 0.

### Task 5: Regression review and handoff

**Files:**
- Verify: `app/partner-admin.tsx`, `app/partner-actions.ts`, `lib/admin-data.ts`, `tests/partner-management-regressions.test.mjs`

- [ ] **Step 1: Run the entire Admin test suite**

```bash
npm test
```

Expected: all tests pass with no failures.

- [ ] **Step 2: Check the diff boundary**

```bash
git diff --check
git status --short
```

Stage only the plan, `app/partner-admin.tsx`, and `tests/partner-management-regressions.test.mjs`; leave unrelated worktree files untracked/uncommitted.

- [ ] **Step 3: Report limitations honestly**

Report which capabilities remain unavailable because no existing API supports them (for example invitations, role mutation, or a real activity retry endpoint). State explicitly that no production data, schema, or delete action was changed.
