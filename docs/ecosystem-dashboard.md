# Ecosystem dashboard

The admin home page combines operational counts, observed/configured agents, a compact analytics view, a product/tier catalog, and a searchable city/microsite directory. Existing partner management remains at `/#partners`; partner query links retain their previous behavior.

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
- Actual dashboard components bundled into a temporary, clearly labeled synthetic-data browser fixture. Desktop, 390px and 320px widths showed no horizontal overflow. Search, category filter, empty-search reset and page search were exercised. Unavailable telemetry/analytics render honest empty states.
- The fixture substitutes Next Link with an anchor; it does not verify authenticated production data loading or Next navigation. Those require an authenticated preview session.
- No production deployment performed by this change. Temporary preview/build outputs are removed after verification.
