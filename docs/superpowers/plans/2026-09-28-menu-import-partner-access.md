# Menu import integration and partner access

**Goal:** Ship the reviewed photo/PDF menu import in the admin panel and enable it individually for partner owners.

**Architecture:** Keep the shared comparison dialog and authenticated server actions. Store the opt-in in a separate `partner_feature_flags` table; admins manage it, owners read their own flag. Check the current flag before extraction and confirmation. Add narrowly scoped menu RLS policies for enabled owners, because the deployed menu tables currently only allow admin writes. No service-role client or client-controlled permission metadata.

**Tech stack:** Next.js 16 server actions, React 19, Supabase/Postgres RLS, Node test runner and existing Hermes runtime.

**Spec:** User request of 2026-09-28 and `docs/ai-menu-import.md`.

**Global constraints:** Missing flags mean disabled. Admins retain access. Staff and other partners gain no management access. Disabling a flag blocks subsequent preview/confirmation requests. No partner is enabled by the migration. Keep existing menu rows and the explicit review-before-save flow.

1. Preserve the tested compact comparison and runner fix, then merge current `origin/main` into the existing feature branch.
2. Add action tests for disabled/missing flags, lookup errors, revoked access, admin bypass, and admin-only flag changes. Run them to observe failure before implementing the guards.
3. Add `partner_feature_flags` migration and transactional database tests. Cover admin enable/disable, owner reads, direct owner escalation denial, foreign/staff denial, own menu/category/item persistence, and revocation. Validate on the existing staging database with test data rolled back.
4. Add `lib/partner-features.ts`, the admin server action, dashboard data loading and a compact menu access switch. Propagate actual admin status through the shared workspace and hide import entry points for disabled partners. Preserve manual menu UI.
5. Run focused tests, the complete app suite, Python runtime tests, type/lint checks and the production build. Inspect the rendered feature switch and shared editor.
6. Update the existing PR with the complete feature and validation. Apply the tested additive migration before releasing application code; keep partner access off until an admin deliberately enables it. Verify the deployment and report its actual status.
