# Benefitsi Admin Knowledge Mirror Implementation Plan

> **For agentic workers:** Execute this plan inline in the current worktree. Do not dispatch subagents. Steps use checkbox syntax for tracking.

**Goal:** Add a protected German Benefitsi Admin knowledge mirror with source-bound ingestion routes and a server-only read layer.

**Architecture:** Internal sync routes accept only the Benefitsi ingestion token, hash it with SHA-256, and call private Supabase RPCs through the service-role client. The `/wissen` Server Component uses a `server-only` DAL that exposes only Benefitsi projections; browser code receives no token, absolute M1 path, source selector, or unrestricted table payload.

**Tech Stack:** Next.js App Router, React Server/Client Components, TypeScript, Supabase service-role RPCs, Node’s built-in test runner via `tsx`.

**Spec:** `/Users/patrick/Documents/New project/benefitsi-admin-knowledge-worktree/task-6-brief.md`

## Global Constraints

- Work only in `/Users/patrick/Documents/New project/benefitsi-admin-knowledge-worktree`.
- Preserve unrelated dirty snapshot content, including the untracked task brief.
- Do not modify Arc, Benefitsi App, public web, M1, or the sibling database worktree.
- Source key is `benefitsi-obsidian`; ownership is derived by the database token and is never accepted from clients.
- Hash version is `sha256-lf-v1`; service-role credentials and private tables remain server-only.
- Ingestion batches accept at most 20 documents and 4 MiB of serialized document payload.
- All user-visible copy on the new surface is German.
- Every ingestion response uses `Cache-Control: no-store` and safe JSON shapes.

## Stable RPC Interface

Until the sibling Task 4 migration is available, keep these names in one adapter module and record them in the final report:

- `start_knowledge_sync`
- `stage_knowledge_sync_batch`
- `complete_knowledge_sync`
- `fail_knowledge_sync`
- `get_knowledge_source_status`
- `search_knowledge_documents`
- `get_knowledge_document`

### Task 1: Ingestion contract and security boundary

**Files:**
- Create: `lib/knowledge/ingestion.ts`
- Create: `lib/knowledge/ingestion-rpc.ts`
- Create: `app/api/internal/knowledge/sync/start/route.ts`
- Create: `app/api/internal/knowledge/sync/batch/route.ts`
- Create: `app/api/internal/knowledge/sync/complete/route.ts`
- Create: `app/api/internal/knowledge/sync/fail/route.ts`
- Test: `tests/knowledge-ingestion.test.mjs`

**Interfaces:**
- `hashIngestionToken(token: string): string`
- `parseStartPayload`, `parseBatchPayload`, `parseCompletePayload`, and `parseFailPayload` return validated route input or a safe error code.
- `callKnowledgeRpc(operation, args)` is the only route-to-Supabase seam and receives the token hash, never the raw token.

- [ ] Write failing tests for missing/short tokens, SHA-256 hashing, ownership/source rejection, ARC_PRIVATE rejection, malformed relative paths, invalid document hashes, batch count/size limits, no-store responses, and exact JSON response shapes.
- [ ] Run `node --import tsx --test tests/knowledge-ingestion.test.mjs` and confirm failure because the new contract modules do not exist.
- [ ] Implement minimal validation, logging, and RPC route handlers.
- [ ] Re-run the focused test file and confirm it passes.

### Task 2: Server-only Benefitsi read layer

**Files:**
- Create: `lib/knowledge/read.ts`
- Create: `lib/knowledge/read-rpc.ts`
- Test: `tests/knowledge-read.test.mjs`

**Interfaces:**
- `searchBenefitsiKnowledge({ query, limit? })` has no source parameter and returns only safe list rows.
- `getBenefitsiKnowledgeDocument(documentId)` has no source parameter and returns only the selected safe detail projection.

- [ ] Write failing tests for fixed Benefitsi source binding, bounded limits, search normalization, list/detail field projections, removal of absolute paths and secrets, and `server-only` imports.
- [ ] Run the focused read test file and confirm the expected missing-module failure.
- [ ] Implement the DAL and RPC projection normalizers with the stable RPC adapter names.
- [ ] Re-run the focused read test file and confirm it passes.

### Task 3: Protected German Admin mirror page and navigation

**Files:**
- Create: `app/wissen/page.tsx`
- Create: `app/wissen/knowledge-browser.tsx`
- Modify: `app/admin-shell.tsx`
- Test: `tests/knowledge-admin.test.mjs`

**Interfaces:**
- `/wissen` calls `requireAdmin()` and the server-only DAL directly.
- Search and pagination use server-rendered query parameters; document detail is read-only and selected by a safe document ID.

- [ ] Write failing tests for the `/wissen` route, Admin authorization, navigation item, German labels, 50-row pagination, and absence of raw token/absolute-path/client-private-table access.
- [ ] Run the focused Admin test file and confirm failure.
- [ ] Implement the server page, list/detail projection UI, empty/error states, and active nav item.
- [ ] Re-run focused Admin tests and confirm they pass.

### Task 4: Verification, report, and commit

**Files:**
- Create: `/Users/patrick/Documents/New project/arc-multivault-worktree/.superpowers/sdd/2026-08-21-multivault-knowledge-bridge/task-6-report.md`

- [ ] Run focused tests, full `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Re-read the brief and verify every route, security rule, projection, UI field, and scope boundary against the diff.
- [ ] Write the full report with changed files, TDD RED/GREEN evidence, stable RPC names, verification results, and the missing-migration interface concern.
- [ ] Commit exactly with `feat: add benefitsi knowledge admin and read layer`.
