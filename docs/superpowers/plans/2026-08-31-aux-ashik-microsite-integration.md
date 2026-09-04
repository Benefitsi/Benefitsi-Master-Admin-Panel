# AUX-ASHIK Microsite Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Integrate Reyan's \`AUX-ASHIK\` partner-microsite design and feature update into the current Benefitsi admin \`main\` line while preserving the current security and partner-action fixes.

**Architecture:** Merge the six-commit \`origin/AUX-ASHIK\` branch into the current \`origin/main\` snapshot in an isolated worktree. Keep the branch's unified \`restaurant-premium\` public renderer, builder/editor changes, palette/menu/deal/readiness/SEO helpers, and regression tests; retain \`main\`'s security workflow, gitleaks configuration, and partner-action hardening. The old \`partner-signature-microsite\` implementation is removed because the branch routes public rendering through the updated restaurant-premium template.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, GSAP, Lucide React, React Icons, Node's test runner through \`tsx\`.

**Spec:** User request in the conversation: inspect the Benefitsi admin panel and partner microsites, then integrate branch \`AUX-Ashik\` into \`main\` so all microsites inherit its design and features.

## Global Constraints

- Target repository: \`Benefitsi/Benefitsi-Master-Admin-Panel\`.
- Source branch: \`origin/AUX-ASHIK\`; target base: current \`origin/main\` (the repository's canonical branch is named \`main\`).
- Preserve the uncommitted changes in \`/Users/patrick/Documents/New project/benefitsi-master-admin-workspace/Benefitsi-Master-Admin-Panel\`.
- Do not modify Supabase schema, migrations, RLS, or production database structure.
- Keep \`main\`'s security and partner-action changes intact while bringing in the microsite update.
- Verify behavior with the repository's existing automated tests, lint, and production build before treating the integration as complete.

---

### Task 1: Merge the AUX-ASHIK microsite update into the current main snapshot

**Files:**
- Modify: \`app/layout.tsx\`
- Modify: \`app/microsite-actions.ts\`
- Modify: \`app/microsite-panel.tsx\`
- Modify: \`app/microsite-preview/[partner]/preview-shell.tsx\`
- Modify: \`app/partner/page.tsx\`
- Modify: \`components/microsite/microsite-renderer.tsx\`
- Remove: \`components/microsite/partner-signature-microsite.tsx\`
- Modify: \`components/microsite/restaurant-premium-microsite.tsx\`
- Add: \`lib/logo-palette.ts\`
- Add: \`lib/microsite-deals.ts\`
- Add: \`lib/microsite-menu.ts\`
- Modify: \`lib/microsite-personalization.ts\`
- Modify: \`lib/microsite-readiness.ts\`
- Modify: \`lib/microsite-seo.ts\`
- Modify: \`lib/microsite-templates.ts\`
- Modify: \`lib/microsites.ts\`
- Modify: \`lib/public-microsite.ts\`
- Modify: \`package.json\`
- Modify: \`package-lock.json\`
- Modify: \`proxy.ts\`
- Add: \`public/ai-sw.js\`
- Add: \`tests/ai-service-worker.test.mjs\`
- Add: \`tests/logo-palette.test.mjs\`
- Add: \`tests/microsite-deals.test.mjs\`
- Add: \`tests/microsite-menu.test.mjs\`
- Add: \`tests/microsite-readiness.test.mjs\`
- Add: \`tests/microsite-responsive.test.mjs\`
- Modify: \`tests/microsites-config.test.mjs\`
- Remove: \`tests/partner-signature-microsite.test.mjs\`
- Modify: \`tests/public-microsite.test.mjs\`

**Interfaces:**
- Consumes: \`origin/main\` at the current remote tip and \`origin/AUX-ASHIK\` at Reyan's six microsite commits.
- Produces: A merge commit on \`codex/aux-ashik-main-integration\` containing the complete update and all \`main\` security/partner-action changes.

- [ ] **Step 1: Confirm the isolated worktree and clean merge base**

\`\`\`bash
git status --short --branch
git merge-base origin/main origin/AUX-ASHIK
git diff --check origin/main...origin/AUX-ASHIK
\`\`\`

Expected: the worktree is on \`codex/aux-ashik-main-integration\`, the merge base is \`6d0899ba5a5d7cac83380987a19a7d9eee685444\`, and the source diff has no whitespace errors.

- [ ] **Step 2: Merge the reviewed source branch**

\`\`\`bash
git merge --no-ff --no-edit origin/AUX-ASHIK
\`\`\`

Expected: Git creates one merge commit. The only expected conflict areas are \`package-lock.json\` and the \`partner-signature-microsite.tsx\` deletion; retain the current \`main\` lockfile updates plus the three AUX-ASHIK runtime dependencies, and accept the source branch's removal of the legacy signature template because \`components/microsite/microsite-renderer.tsx\` imports only \`restaurant-premium-microsite.tsx\`.

- [ ] **Step 3: Normalize dependencies and finish any lockfile conflict**

\`\`\`bash
npm install --package-lock-only
git add package.json package-lock.json
git status --short
\`\`\`

Expected: \`package.json\` includes \`gsap\`, \`lucide-react\`, and \`react-icons\`; \`package-lock.json\` resolves them while retaining \`main\`'s dependency-security refresh; no unrelated files are staged.

- [ ] **Step 4: Run the full regression suite on the merged tree**

\`\`\`bash
npm test
\`\`\`

Expected: all existing and AUX-ASHIK microsite tests pass, including the responsive, palette, menu, deals, readiness, public DTO, and service-worker coverage.

### Task 2: Verify admin and partner-microsite production behavior

**Files:**
- Verify: \`app/microsite-panel.tsx\`
- Verify: \`app/microsite-preview/[partner]/preview-shell.tsx\`
- Verify: \`components/microsite/microsite-renderer.tsx\`
- Verify: \`components/microsite/restaurant-premium-microsite.tsx\`
- Verify: \`lib/microsite-readiness.ts\`
- Verify: \`lib/public-microsite.ts\`

**Interfaces:**
- Consumes: the merged application and its installed dependencies.
- Produces: evidence that builder, preview, public microsite rendering, responsive styling, dark mode, social feed, menu/deal cards, and readiness/SEO behavior compile together.

- [ ] **Step 1: Confirm the old renderer is no longer referenced**

\`\`\`bash
rg -n "partner-signature-microsite|PartnerSignatureMicrosite" app components lib tests || true
rg -n "MicrositeRenderer|RestaurantPremiumMicrosite|logo-palette|microsite-(deals|menu|readiness)" app components lib tests
\`\`\`

Expected: no active import of the removed signature component; the unified renderer and new helpers are referenced by builder/preview/public surfaces and tests.

- [ ] **Step 2: Run lint**

\`\`\`bash
npm run lint
\`\`\`

Expected: ESLint exits with status 0 and reports no errors.

- [ ] **Step 3: Run the production build**

\`\`\`bash
npm run build
\`\`\`

Expected: Next.js completes a production build without TypeScript, route, or dependency errors.

### Task 3: Advance the local main pointer to the verified merge

**Files:**
- Modify: local Git ref \`refs/heads/main\` (no working-tree file changes)

**Interfaces:**
- Consumes: the verified merge commit from Task 1 and the passing checks from Task 2.
- Produces: local \`main\` pointing at the verified integration commit; the remote \`origin/main\` remains unchanged until an explicit push/PR decision.

- [ ] **Step 1: Confirm the merge commit and worktree state**

\`\`\`bash
git status --short --branch
git log --oneline --decorate -3
git diff --check HEAD^1 HEAD
\`\`\`

Expected: the worktree is clean and \`HEAD\` is the merge commit with both \`origin/main\` and \`origin/AUX-ASHIK\` as ancestors.

- [ ] **Step 2: Fast-forward the local main ref**

\`\`\`bash
git branch --force main HEAD
git show-ref --heads main
git merge-base --is-ancestor origin/main main
git merge-base --is-ancestor origin/AUX-ASHIK main
\`\`\`

Expected: local \`main\` points at the same verified merge commit, and both source histories are ancestors. Do not push to GitHub in this task unless the user explicitly requests remote publication.

- [ ] **Step 3: Report the integration and remaining publication choice**

Report the local integration worktree path, merge commit, test/lint/build results, preserved dirty checkout path, and explicitly note that remote \`origin/main\` is not pushed.

