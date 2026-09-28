# Partner domain and authorization separation

User approved implementation in this chat on 2026-09-28.

Goal: serve partners at partner.benefitsi.de, retain admin.benefitsi.de for team accounts, and deny partner access to privileged operations even when callers bypass navigation or replay Server Actions.

- [x] Add regression tests for UID-only admin/partner identity, fail-closed role checks, explicit staff activation, domain allowlists, machine endpoint exceptions, isolated cookies, and portal login routing.
- [x] Implement host routing with exact public/machine route allowlists; deny unknown protected routes for non-admins. Keep authorization checks inside every privileged page/action as the primary boundary.
- [x] Bind profiles and memberships only to verified auth UID. Require is_admin === true. Deny admin context on partner host, including shared Server Actions.
- [x] Separate admin/partner login and logout destinations; host-only secure cookies with distinct names. Update recovery callback URLs and Supabase allowlist while preserving existing clients.
- [x] Run full tests, lint and production build; independent security review. Verify deployed DB prevents self-promotion, user ID changes and access to privileged RPCs.
- [ ] Deploy reviewed commit, attach partner subdomain to Vercel project; verify HTTPS, redirects, anonymous requests, authenticated non-admin requests and existing admin access. Document residual scope and rollback.

Baseline: origin/main 175d20e is production dpl_ChMSwvbBQtzwYGrwESZccLyUAEPV. Initial tests lacked jsdom because dependencies came from an older checkout; install locked dependencies before verification.

Implementation and tests complete (728 passing); Supabase redirect configuration and production/domain activation remain pending. See `docs/security/2026-09-28-partner-domain-isolation.md` for evidence, scope and release steps.

User explicitly approved GitHub OAuth; production Supabase callbacks added and verified. Latest main commerce-proxy changes integrated; 730 tests and production build pass. Domain attachment and live verification are next.

PR45 merged and deployed; partner domain active. Production HTTP/RLS/recovery checks pass. Browser testing found a stale form action import, corrected in PR47 with red/green regression coverage; all 731 tests pass and corrected local browser login succeeds. Final production browser verification and test-data cleanup follow PR47 release.
