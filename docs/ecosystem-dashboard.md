# Ecosystem dashboard

The admin home page combines operational counts, observed/configured agents, a compact analytics view, a product/tier catalog, and a searchable city/microsite directory. Existing partner management remains at `/#partners`; partner query links retain their previous behavior.

## Visual overview

- Brand palette: blue `#118CFF`, cyan `#17D4D7`, navy `#061829`, neutral surfaces, and sparing gold `#FFB400`. Satoshi typography and Phosphor icons match the local Benefitsi brand guide.
- Four operational metrics lead into a large activity chart, an agent-status donut, and three independent workload bars. The donut describes configured/observed profiles, not running processes. Workload categories are not added together.
- Agent roles use compact icon tiles. Native disclosures reveal purpose, schedule, last observation, and management links.
- Four plan tiles and four product categories replace the long default inventory. All 72 features remain searchable, with explanations, availability, and links accessible on demand.
- Benefit icons follow the App's shared rounded icon set and original gift artwork, with explicit assignments for all 15 entries. See [the icon reference](benefit-icons.md) for the Notion taxonomy and App sources.
- The city/microsite directory is collapsible and retains its search, filters, and verified public links. Unknown values and chart gaps remain visibly unknown.
- Responsive grids support compact screens. Focus indicators, non-color status labels, chart descriptions, a data table, and reduced-motion preferences are retained.

## Sources and semantics

- Exact operational counts: `loadFounderOverview`. Failed source reads stay unavailable, not zero.
- Agent observations: `loadAgentControl`; stale snapshots remain labeled stale. The runtime registry and documented menu pipeline supply configured roles when telemetry is unavailable. A configured/observed profile is not a running process.
- Analytics: existing permission-controlled business analytics RPCs, production, last 30 days. The compact projection reapplies finance redaction, preserves null gaps and uses observation timestamps. The chart also exposes a data table.
- Product inventory: `lib/ecosystem/catalog.ts`, curated against Admin, App, Web and Database source on 2026-10-02 and updated for the partner CRM release on 2026-10-03. CRM drafts, editorial requests and unavailable message delivery are distinguished. Update this catalog when product permissions, plans or availability change. Planned features and disabled Premium purchases are explicit.
- Public microsite links: `get_public_microsites_v1`, without config payloads. A public projection must match the loaded partner, microsite and selected version. Missing evidence gives an admin link only. City links use stored slugs and do not claim live publication.

All new queries follow the existing admin authentication check. No schema, permission, publication or agent execution changes are included.

## Verification (2026-10-03)

- Integrated `origin/main` (`4ab3aaa`, partner CRM release) and installed its exact locked dependencies.
- Next.js 16.3.6 production build (`npm run build -- --webpack`), including TypeScript, passed before the CRM integration. The final deployment is built by Vercel; final local TypeScript passed separately.
- Existing test fixtures were aligned with the current entitlement response and partner route component boundaries; permission checks and assertions are unchanged. The offline component loader now reads the CRM benefit JSON manifest.
- Final full test suite with two workers: 1,151 passed, no failures or skips.
- CRM/editorial updates synchronize changed server snapshots during a guarded render, preserving local editing while avoiding redundant effect-driven renders. Targeted UI tests cover saved state, refreshed editorial status, unsaved changes and revoked access.
- Full ESLint: no errors; 21 existing warnings. TypeScript (`tsc --noEmit --incremental false`): passed.
- The suite includes directory publication rules, agent evidence, analytics redaction/gaps, existing analytics normalization and founder overview.
- Actual redesigned dashboard components bundle successfully into a standalone, clearly labeled synthetic-data preview. The fixture substitutes Next Link with an anchor.
- Icon alignment: all 15 benefits have required typed assignments; all 13 Material SVGs were checked for retained paths and safe static elements, and the full icon sheet was rendered and visually inspected. The production build above includes these icons.
- Production dependency audit (`npm audit --omit=dev --audit-level=high`): no findings. The full audit reports five high entries from one unpatched development-only `braces` advisory through `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. This existing dependency also affects `origin/main`; no audit exception or security workflow change has been made, and the full audit gate remains failing.
- The browser tool rejected access to the local HTML preview under its URL protocol policy. The revised layout has therefore not received a new browser visual/interaction check. Authenticated production data loading and Next navigation also require an authenticated preview session.
- Deployment status is tracked by GitHub and the existing Vercel project. Temporary preview/build outputs are removed after verification.

## Deployment location

The dashboard replaces the existing admin home route, available after admin sign-in at `https://admin.benefitsi.de/` via **Übersicht**. It belongs to the existing Vercel project `benefitsi-master-admin-panel`; no separate site, database migration, or new deployment project is required.
