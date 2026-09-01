# Benefitsi Content Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a least-privilege `benefitsi-content` Hermes profile on the M1 and route Admin Panel editorial draft actions through it while keeping Ben as the orchestrator/reviewer.

**Architecture:** The Admin Panel will keep its existing server actions and human-review workflow, but send bounded structured prompts to the M1 bridge with `profile: "benefitsi-content"` and `action: "content-draft"`. The new profile will be a draft-only MiniMax profile with the Benefitsi MCP read boundary and no publish/automation mutation tools; the bridge will enforce the profile/action boundary and return a normalized JSON draft.

**Tech Stack:** Next.js server actions, TypeScript, Node test runner with `tsx`, Python Hermes/M1 bridge, Hermes profile YAML/Markdown, Vercel Production.

**Spec:** `docs/superpowers/plans/2026-09-01-benefitsi-content-agent.md`

## Global Constraints

- Do not expose or commit API keys, bridge secrets, MCP credentials, customer contact data, KYC data, payment data, or private staff data.
- Content Agent output is always a draft; it cannot publish, approve, delete, change deal economics, change access roles, or send messages.
- Partner, deal, menu, and public microsite facts must come from bounded input fields; the agent must not invent prices, rewards, opening hours, allergens, qualifications, or legal claims.
- Existing Ben, city-agent, SEO, and human-gate flows remain compatible.
- Do not change Supabase schema, migrations, RLS, or production database structure.
- Preserve all pre-existing uncommitted work outside this isolated worktree.

---

### Task 1: Define and test the Content Agent contract

**Files:**
- Create: `lib/content-agent.ts`
- Test: `tests/content-agent.test.mjs`

**Interfaces:**
- `ContentDraftTask`: `partner_description | deal_copy | staff_instructions | menu_description | menu_item_description | team_bio`.
- `ContentDraftInput`: task plus bounded public facts and current text.
- `buildContentDraftPrompt(input): string` produces an instruction/data-separated prompt.
- `parseContentDraftResponse(raw, task): string` accepts the exact JSON field or bounded plain text and rejects empty/oversized output.

- [ ] **Step 1: Write failing tests** for task validation, prompt data boundaries, JSON parsing, maximum length, and rejection of empty/malformed output.
- [ ] **Step 2: Run `node --import tsx --test tests/content-agent.test.mjs` and confirm the tests fail because the module is missing.**
- [ ] **Step 3: Implement the smallest pure prompt/parser module with no network or Supabase dependency.**
- [ ] **Step 4: Re-run the focused test and then the complete Admin Panel test suite.**
- [ ] **Step 5: Commit as `feat: add Benefitsi content agent contract`.**

### Task 2: Add a guarded M1 `content-draft` bridge action

**Files:**
- Modify: `/Users/patrick/Documents/New project/arc-reliability-running-workspace/bridge/m1_bridge.py`
- Modify on M1: `/Users/patrick/.arc-m1-bridge/m1_bridge.py`
- Create: `tools/hermes-city-profiles/benefitsi-content/profile.yaml`
- Create: `tools/hermes-city-profiles/benefitsi-content/SOUL.md`
- Create: `tools/hermes-city-profiles/benefitsi-content/identity.md`

**Interfaces:**
- Bridge POST `/hermes` accepts `{ action: "content-draft", task, payload }` only for the `benefitsi-content` profile.
- The bridge calls `hermes_chat("benefitsi-content", ...)` with the restricted toolset and returns `{ action, profile, task, response, sessionId }`.
- The profile uses MiniMax M3.0, the existing M1 credential mechanism, no scheduled worker, and no publish/automation mutation capability.

- [ ] **Step 1: Add bridge regression tests/fixture assertions for allowed profile/action, rejected Ben/city profiles, bounded payload size, and draft-only toolset.**
- [ ] **Step 2: Run the bridge regression tests and confirm the new assertions fail.**
- [ ] **Step 3: Implement the guarded bridge action and profile files; keep existing Ben/city actions unchanged.**
- [ ] **Step 4: Run Python syntax checks and the existing MCP/bridge tests.**
- [ ] **Step 5: Sync only the non-secret profile and bridge source to the M1, create a timestamped backup, and verify file permissions; do not copy credentials.**
- [ ] **Step 6: Run an authenticated read-only bridge status check and a bounded content-agent smoke test only if the MiniMax credential is available; do not write live content.**
- [ ] **Step 7: Commit tracked source/profile changes as `feat: add guarded Benefitsi content Hermes profile`.**

### Task 3: Route Admin Panel partner and deal copy actions to the Content Agent

**Files:**
- Modify: `app/partner-actions.ts`
- Modify: `lib/partner-description.ts`
- Modify: `lib/deal-copy.ts`
- Test: `tests/content-agent-actions.test.mjs`
- Modify: `app/admin-language.tsx`

**Interfaces:**
- Existing `generatePartnerDescription` and `generateDealCopy` continue to return `PartnerActionState` and preserve human review, but send `profile: "benefitsi-content"`, `action: "content-draft"`, and an explicit task.
- If the Content Agent is unavailable, return a user-safe error; do not silently publish or mutate a database row.
- Keep Ben as the fallback only for existing compatibility if the bridge explicitly reports the profile unavailable; never broaden the Content Agent's permissions.

- [ ] **Step 1: Write failing action tests that assert the request body uses `benefitsi-content` and the expected task for partner/deal/staff copy, and that bridge errors remain draft-only.**
- [ ] **Step 2: Run the focused tests and confirm they fail against the current `profile: "ben"` request body.**
- [ ] **Step 3: Refactor the server actions to use a shared bounded bridge helper and the pure content contract.**
- [ ] **Step 4: Update user-facing labels/messages from “Ben” to “Content-Agent” where the action is now delegated, while preserving Ben labels for true Ben review actions.**
- [ ] **Step 5: Run focused action tests, then all tests and lint.**
- [ ] **Step 6: Commit as `feat: route admin copy drafts through content agent`.**

### Task 4: Add visible Content-Agent suggestions for partner staff copy without changing schema

**Files:**
- Modify: `app/partner-admin.tsx`
- Modify: `app/partner-actions.ts` if an additional server action is required
- Test: `tests/content-agent-ui.test.mjs`

**Interfaces:**
- Existing deal customer description, staff instructions, and terms controls use the Content Agent; the UI inserts drafts into local form state and never saves automatically.
- Staff access records remain access records; no employee bio column or Supabase migration is introduced.

- [ ] **Step 1: Add a failing UI/source regression test for Content-Agent labels and draft-only insertion behavior.**
- [ ] **Step 2: Run the focused test and confirm the current Ben labels fail the intended assertions.**
- [ ] **Step 3: Update the suggestion button/status copy and wire any missing staff-copy field to the existing action.**
- [ ] **Step 4: Run the focused test and full test/lint suite.**
- [ ] **Step 5: Commit as `feat: expose content agent copy suggestions in partner admin`.**

### Task 5: Verify, deploy, and document the integration

**Files:**
- Modify: `README.md` or `docs/` with the profile/permission map and M1 sync procedure.

- [ ] **Step 1: Run `npm test`, `npm run lint`, and `npm run build` from the isolated worktree.**
- [ ] **Step 2: Verify M1 profile existence, MiniMax provider, MCP credential mode `0600`, no scheduler, and bridge status without printing secrets.**
- [ ] **Step 3: Create a Vercel preview deployment and verify the generated request contract against the M1 bridge using a non-publishing test.**
- [ ] **Step 4: Review the diff for secrets, broad permissions, unintended schema changes, and pre-existing-worktree contamination.**
- [ ] **Step 5: Push the feature branch and report the exact preview/live status; promote to Production only with explicit production-release approval.**

