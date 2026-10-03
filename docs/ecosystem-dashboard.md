# Ecosystem dashboard

The admin home page combines operational counts, observed/configured agents, a compact analytics view, a product/tier catalog, and a searchable city/microsite directory. Existing partner management remains at `/#partners`; partner query links retain their previous behavior.

## Visual overview

- Brand palette: blue `#118CFF`, cyan `#17D4D7`, navy `#061829`, neutral surfaces, and sparing gold `#FFB400`. Satoshi typography and Phosphor icons match the local Benefitsi brand guide.
- Four operational metrics lead into a large activity chart, an agent-status donut, and three independent workload bars. The donut describes configured/observed profiles, not running processes. Workload categories are not added together.
- Agent roles use compact icon tiles. Native disclosures reveal purpose, schedule, last observation, and management links.
- Four plan tiles and four product categories replace the long default inventory. All 72 features remain searchable, with explanations, availability, and links accessible on demand.
- The city/microsite directory is collapsible and retains its search, filters, and verified public links. Unknown values and chart gaps remain visibly unknown.
- Responsive grids support compact screens. Focus indicators, non-color status labels, chart descriptions, a data table, and reduced-motion preferences are retained.

## Sources and semantics

- Exact operational counts: `loadFounderOverview`. Failed source reads stay unavailable, not zero.
- Agent observations: `loadAgentControl`; stale snapshots remain labeled stale. The runtime registry and documented menu pipeline supply configured roles when telemetry is unavailable. A configured/observed profile is not a running process.
- Analytics: existing permission-controlled business analytics RPCs, production, last 30 days. The compact projection reapplies finance redaction, preserves null gaps and uses observation timestamps. The chart also exposes a data table.
- Product inventory: `lib/ecosystem/catalog.ts`, curated against current Admin, App, Web and Database source on 2026-10-02. Update this catalog when product permissions, plans or availability change. Planned features and disabled Premium purchases are explicit.
- Public microsite links: `get_public_microsites_v1`, without config payloads. A public projection must match the loaded partner, microsite and selected version. Missing evidence gives an admin link only. City links use stored slugs and do not claim live publication.

All new queries follow the existing admin authentication check. No schema, permission, publication or agent execution changes are included.

## Verification

- Next.js production build (`next build --webpack`): passed.
- TypeScript (`tsc --noEmit --incremental false`): passed.
- ESLint on changed implementation and targeted tests: passed.
- 37 tests: directory publication rules, agent evidence, analytics redaction/gaps, existing analytics normalization and founder overview.
- Actual redesigned dashboard components bundle successfully into a standalone, clearly labeled synthetic-data preview. The fixture substitutes Next Link with an anchor.
- The browser tool rejected access to the local HTML preview under its URL protocol policy. The revised layout has therefore not received a new browser visual/interaction check. Authenticated production data loading and Next navigation also require an authenticated preview session.
- No production deployment performed by this change. Temporary preview/build outputs are removed after verification.
