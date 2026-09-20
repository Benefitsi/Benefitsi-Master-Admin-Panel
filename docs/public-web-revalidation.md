# Public partner and city cache contract

The public Web application owns cache tag definitions. Both its partner loader and bounded revalidation planner import `public-cache-keys.ts`. The Admin sends resource identifiers, never tag names or arbitrary paths.

`POST /api/revalidate` accepts a server-only Bearer secret and at most 1 KiB of JSON. For a partner it requires `resource: "partner"` and `partnerSlug`; `citySlug` is optional when the partner has no canonical city. Slugs are at most 120 lowercase ASCII characters with internal hyphens. Extra fields and path-like input are rejected. The server derives the exact partner tag and associated city tags/paths. All planned tags expire immediately with Next's `{ expire: 0 }`, preserving the current Web policy. The city UUID is resolved server-side for dependent tags.

Both the City and microsite producers use the exact configured `BENEFITSI_WEB_REVALIDATION_URL`; they do not infer a production origin. The City request contains only `{ "resource": "city", "citySlug": "annweiler" }`. The Web handler looks up the canonical city UUID by slug for UUID-dependent cache tags; the caller must not send `cityId`. City delivery requires HTTPS and exactly `/api/revalidate`, with no URL credentials, query or fragment, in every environment. A missing endpoint or secret yields `not_configured` without a request; legacy `BENEFITSI_WEB_URL` is not a fallback.

## Deployment order

1. Apply the additive `get_public_microsite_config_v1` database migration in staging, verify its public projection, then deploy the matching Web consumer to a protected preview or staging environment. Keep raw-policy cutover separate until all consumers have been checked.
2. Configure a new random secret of at least 32 characters as `BENEFITSI_WEB_REVALIDATION_SECRET` in both matching server environments. Never use a `NEXT_PUBLIC_` variable, application login password or service-role key.
3. Configure Admin `BENEFITSI_WEB_REVALIDATION_URL` to that exact Web origin's `/api/revalidate`. HTTPS, no credentials, query or fragment; loopback HTTP is available only outside production. Staging must not target production. Requests cannot follow redirects.
4. Deploy the matching Admin producer; run synthetic publication/draft/withdrawal/retry acceptance before promoting.
5. Verify deployment identities, secret separation, reachability and actual public rendering. The paired BEN61 contract now renders the supported Admin configuration; other templates and unsupported edits remain publication blockers.

For an additive credential transition, the matching Web release can accept a new server-only `BENEFITSI_PUBLISHER_REVALIDATION_SECRET`, while Admin uses that same value for its outgoing `BENEFITSI_WEB_REVALIDATION_SECRET` and `BENEFITSI_ADMIN_REVALIDATION_SECRET`. Preserve the Web's existing WEB and ADMIN secret values for existing callers. Activate and verify the new Web receiver before the new Admin producer; when rolling back, restore the old Admin deployment first. A staging-built artifact must not be promoted with production data expectations: build the production target with production environment values.

When the paired Web Preview uses Vercel Deployment Protection, provision a dedicated Web-project automation bypass and set it only on the matching Admin Preview branch as `BENEFITSI_WEB_PROTECTION_BYPASS_SECRET`. The server helper sends it in `x-vercel-protection-bypass` only when `VERCEL_ENV=preview` and the configured target is a `*.vercel.app` host. It is never a URL parameter and is not sent to production or custom domains. The application Bearer secret is still required. Revoke the temporary project bypass after acceptance; do not disable project-wide protection.

Admin commits a public state before delivery. Microsite delivery makes at most two attempts per slug with a 2.5-second request timeout; City delivery makes one bounded request with an eight-second timeout. A renamed microsite and canonical partner can require two distinct slugs. Failed delivery is a separate pending result, not a failed DB save. The editor can repeat just the cache update after reload. This is explicit retry, not a durable delivery queue. The unchanged cache TTL provides eventual refresh; do not promise immediate withdrawal if delivery failed.

Draft/review/approval and discarding a draft never write the parent microsite's public status. Explicit withdrawal archives the parent without deleting its saved versions. Re-publication uses the existing readiness gate.

## Validation and limits

The root integration artifact `scripts/verify-publication-roundtrip.mjs` accepts explicit Web/Admin checkout paths and starts a disposable production fixture using the installed Web Next version. It executes the actual Admin action/delivery helper, Web route, Web partner loader and Next data cache against synthetic loopback PostgREST/RPC-shaped rows. The fixture denies raw editor-config access. It uses actual Web CSS, Tailwind source scanning, and a bounded optional browser-review pause. It verifies warm hits, unchanged drafts, new public pointer reads, withdrawal and idempotent retry. Database auth/RLS and the full editor UI are separate acceptance surfaces.

No existing revalidation producer was found in the audited Database migrations/functions or Admin mutation source. External deployment-configured webhooks remain unverified. No production webhook, secret or cache was changed.

Reference: [Next revalidateTag semantics](https://nextjs.org/docs/app/api-reference/functions/revalidateTag).
