# Deal Save and Ben Copy Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 2-for-1 deal saves retain the entered item name and preserve the deal basics after validation errors, while adding reviewable German Ben suggestions to the three deal-copy fields.

**Architecture:** Keep deal parsing and validation in `app/partner-actions.ts`, but share a small pure deal-form contract with the client and tests. Failed deal actions return a bounded draft snapshot that the client feeds back into the controlled editor. A dedicated Ben deal-copy prompt/action reuses the existing Hermes/M1 bridge and returns a draft only; the editor applies it to the selected textarea after review.

**Tech Stack:** Next.js server actions, React 19 client components, TypeScript, Node test runner with `tsx`, Supabase, Hermes/M1 bridge.

**Spec:** Confirmed conversation design in the task thread (2-for-1 parser fix, failed-save draft preservation, and Ben suggestions for customer description, staff instructions, and terms).

## Global Constraints

- `reward_item` is valid for both `item` and `2for1` discount types.
- Ben receives only bounded deal context and must not invent facts; generated copy is never saved automatically.
- Existing Hermes/M1 bridge configuration and HTTPS validation remain in use.
- Regression tests must fail before production changes and pass after them.

---

### Task 1: Lock the deal parser and draft contract with tests

**Files:**
- Create: `lib/deal-form.ts`
- Modify: `tests/partner-management-regressions.test.mjs`

- [x] Add tests for `2for1` being a reward-item type, a form snapshot retaining deal concept/effect/audience/item, and a German Ben deal-copy prompt containing only the allowed field/context contract.
- [x] Run the focused test and confirm it fails because the shared helpers do not exist.

### Task 2: Fix server parsing and failed-save state

**Files:**
- Modify: `app/partner-actions.ts`
- Modify: `app/partner-admin.tsx`

- [x] Use the shared reward-item predicate for parsing and existing-copy preservation, and return a bounded `dealDraft` on save failures.
- [x] Feed `dealDraft` into `DealFields` and synchronize controlled basics/copy state after an error so selections and entered text remain visible.
- [x] Run focused tests and TypeScript/build checks.

### Task 3: Add Ben deal-copy generation and field buttons

**Files:**
- Create: `lib/deal-copy.ts`
- Modify: `app/partner-actions.ts`
- Modify: `app/partner-admin.tsx`
- Modify: `tests/partner-management-regressions.test.mjs`

- [x] Add a field allowlist and bounded German prompt/parser contract.
- [x] Add `generateDealCopy` server action using the configured Hermes/M1 bridge and Ben profile.
- [x] Add a compact Ben icon action beside each of the three deal-copy textareas and apply returned drafts locally without auto-saving.
- [x] Run the full test suite and production build.

### Task 4: Review the diff and hand off

**Files:**
- Modify: only files above if review finds a defect.

- [x] Run `git diff --check`, inspect the final diff, and report exact verification results.
