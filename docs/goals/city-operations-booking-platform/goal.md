# Benefitsi City Operations & Booking Platform

## Objective

Build a production-oriented Benefitsi city operations system that gives admins one review center for all cities, models local and regional geography without duplicate content, and supports Benefitsi-owned marketplace bookings through Stripe Connect with automation and agent assistance.

## Original Request

“Lass uns das machen. Aber wir sollten unseren eigenen Service daraus machen mit Stripe-Integration. Wie immer alles voll automatisiert und gegebenenfalls durch Agents unterstützt.”

## Intake Summary

- Input shape: `existing_plan`
- Audience: Benefitsi administrators, local partners/providers, city residents, visitors, and future city agents
- Authority: `requested`
- Proof type: `demo`
- Completion proof: A verified local/test-mode walkthrough shows the global review workflow, hierarchical geo aggregation, provider onboarding, bookable offer creation, successful Stripe test checkout and idempotent webhook processing, booking visibility, and guarded agent automation.
- Goal oracle: The end-to-end test-mode demo and its automated test/build receipts remain green after every implementation package.
- Likely misfire: Producing attractive screens or a thin Stripe Checkout button without a reliable review queue, inventory rules, webhook idempotency, auditability, city isolation, provider ownership, or safe human approval gates.
- Blind spots considered: merchant-of-record and tax responsibilities, Stripe Connect account model, refunds/cancellations, payouts, overselling, webhook replay, privacy, accessibility, source licensing, regional SEO duplication, dirty worktree preservation, and agent authority boundaries.
- Existing plan facts:
  - Build the global city review dashboard first.
  - Add a flexible region/place model instead of one page per village.
  - Start with Annweiler, then Landau and surroundings, then larger regional hubs.
  - Benefitsi should own the booking experience rather than only forwarding to third-party checkouts.
  - Stripe should handle payments and connected-provider onboarding in test mode during implementation.
  - Automation and city agents may research, propose, validate, and queue work, but sensitive actions need explicit gates.

## Goal Oracle

The oracle for this goal is:

`In Stripe test mode, an admin can review Annweiler content from a global all-cities queue, inspect source and agent findings, request correction or publish through an audited human gate; the same system can represent Annweiler inside multiple administrative/editorial regions; a connected test provider can complete onboarding, publish a reviewed bookable offer, accept a successful test booking without overselling, process repeated webhook delivery exactly once, show the booking in admin/provider views, and preserve an auditable Benefitsi application fee.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Continuously complete the largest safe verified vertical slices until the full oracle is satisfied. Begin with read-only architecture and schema discovery because the Master Admin worktree already contains unrelated user changes. Then implement the city review and geography vertical slice, followed by Stripe Connect test-mode booking, provider/admin operations, public Annweiler booking discovery, and guarded agent automation.

## Non-Negotiable Constraints

- Preserve all existing user changes in the dirty Master Admin worktree.
- Use the existing Benefitsi Master Admin as the global operational surface.
- Read the repository `AGENTS.md` and the installed Next.js version documentation before changing Next.js code.
- Apply the `design-taste-frontend` skill to dashboard implementation while preserving the existing visual system.
- Use Stripe test mode only until the owner explicitly authorizes production activation.
- Do not expose secret keys, webhook secrets, personal booking data, or provider KYC data to Hermes agents.
- Agents may create proposals and drafts, rescan sources, classify issues, and prepare replies; they may not autonomously publish, refund, change payouts, or activate live payments.
- All write paths require authorization, validation, idempotency, and audit receipts.
- Booking inventory must be transaction-safe and webhook processing replay-safe.
- One canonical content or offer record may appear in multiple city/region views without duplicating its canonical URL.
- No production deployment, real charge, real payout, destructive migration, or external provider communication without the authority required for that action.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if safe implementation work remains.

If production Stripe credentials, legal policy choices, or destructive deployment approval become necessary, mark only that exact slice blocked and continue all safe local and test-mode work.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny. Each Worker package should produce a demonstrable vertical slice rather than isolated helper files.

## Board Health

Machine truth lives at:

`docs/goals/city-operations-booking-platform/state.yaml`

Run the bundled checker when the board is repaired or a task changes shape:

```bash
node /Users/patrick/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/city-operations-booking-platform
```

## Canonical Board

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/city-operations-booking-platform/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter and the GoalBuddy execution contract.
2. Read `state.yaml`.
3. Work only on the active board task.
4. Preserve the existing dirty worktree.
5. Record a compact receipt and update the board.
6. Advance to the next largest safe vertical slice while local work remains.
7. Finish only after the final audit records `full_outcome_complete: true`.
