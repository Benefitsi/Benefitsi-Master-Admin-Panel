# Public partner-page contract v1 (BEN-61)

The canonical Admin producer is `saveMicrositeVersion`. On successful publication it adds `config.publicSnapshot` to the existing editable JSON in `microsite_versions.config`. The snapshot has `schema: "benefitsi.public-microsite"` and `version: 1`. It projects public fields only; builder review notes, print content, unused asset-library entries and unknown element metadata remain outside the projection. Storing the snapshot needs no new column, but the paired public Web reader requires the Database migration `20260920072631_public_microsite_projection.sql` before rollout. The snapshot alone does not restrict access to the raw version row.

Install the additive `get_public_microsite_config_v1` RPC first, then the Web consumer and this Admin publisher. After synthetic acceptance and existing-publication inventory, use the separately gated Database script `tools/microsite-public-data/close-raw-access.sql` to remove public raw-config access and verify hosted role behavior. The migration alone leaves the old exposure in place; the cutover must not precede the compatible consumer. Never restore anonymous raw-config access as a fallback.

Web reads only a published parent and its exact published version (including microsite ownership). A valid v1 snapshot takes precedence over surrounding editable fields. Unsupported versions, malformed snapshots, missing versions, draft versions and withdrawn parents resolve to no public page. Existing unversioned nested configurations use the compatibility adapter. Existing flat legacy publications retain their existing renderer.

The producer and consumer keep `lib/public-microsite-contract.ts` / `src/lib/public-microsite-contract.ts` byte-identical. There is no external-checkout dependency in either default test suite. Run the explicit two-checkout integration command below when changing the contract; it checks exact agreement and the real producer/consumer rendering. Any incompatible change requires a new version and a documented reader migration.

## Supported public fields

| Group | Behavior |
| --- | --- |
| Template | New publications: `restaurant-premium`. Existing nested category publications stay readable in the shared semantic layout; category-specific layout parity is not claimed. |
| Language / appearance | Stored language and light/dark mode; supplied copy is not automatically translated. |
| Branding | Accent colors, logo and partner badge; palette-generation/editor metadata is not public configuration. |
| Navigation | Six actual editor anchors: deals, stempelkarte, speisekarte, ueber-uns, app, kontakt; customized labels retained. |
| Hero | Headline, slogan, location/opening copy, image, badge, service labels/icons/descriptions, primary/secondary section-link labels. Admin-only image/opening placeholders are suppressed. |
| Deals / stamps | Editor section and promotion copy, media and bullet lists; actual published benefits provide reward facts and benefit IDs. Promotion media/copy is conditional on current published benefits. No fabricated balances or rewards. |
| Content | Menu headings/description; about copy, quotation and attribution; contact/app/footer headings and text. Published menu data stays authoritative. |
| SEO | Title, description, keywords, OG image and noIndex. City PRELAUNCH/DRAFT policies remain stronger. Canonical URLs remain owned by Web routing. |
| Inline text/media | Supported IDs are explicitly listed in the contract. About images/additional copy, contact address/phone/map/opening, app screenshot/copy, FAQ and benefit lists are rendered as React text or safe media/links. |
| Visibility / ordering | Disabled social links disappear; per-menu-item `showImage:false` removes images, image overrides and featured-menu ordering are respected. |
| Social links | Eight platforms plus database profile fallback; safe public links and optional icons. No automatic third-party embeds/scripts. |
| Styling | Explicit supported rendered element IDs; bounded typography, spacing, sizing, scale and colors. Unsupported populated layout IDs and unavailable fonts block publication. This is a responsive semantic renderer, not pixel parity with every Admin canvas layout. |

The Admin readiness list and publish action name unsupported templates/fields. Draft/review/approval remain available. Empty style placeholders and unused builder/print/asset defaults do not block a supported publication. Unknown templates cannot be silently normalized into the supported template at publication time.

The public Database reader also limits the entire stored editor configuration, including the snapshot, to 1 MiB of PostgreSQL JSONB text. The Admin action checks a conservative UTF-8 upper bound before uploads and again on the final payload before database writes. It reserves JSONB separator spacing and expanded decimal-number notation, so a near-limit configuration may be rejected conservatively. Oversized drafts remain saveable and the prior public pointer is preserved. This prevents a successful publication followed by a public-reader `null`; it does not delete assets or trim the author's draft silently.

If returned upload URLs push an initially acceptable payload over the limit, the second check prevents version/pointer writes; it does not reverse an already completed upload. Unreferenced storage cleanup remains a separate reference-aware operation.

## Deliberate capability limits

- All category templates beyond `restaurant-premium` are blocked for new publication/republication until their specific public layout is supported. Existing published pointers remain readable. This is a real remaining product boundary, not an assertion that every Admin template is complete.
- Advanced unsupported inline elements and layout IDs are blocked by concrete field name. This includes custom app-download/QR destinations: benefit and app entry continue through the existing `AppEntryAction` pilot/launch gate.
- Embedded social posts are not supported for new publication. A populated enabled feed reports the exact post field and asks the editor to disable/remove it. Existing unversioned feeds degrade to safe outbound post links; this compatibility limitation is explicit and requires product follow-up for embed parity. Merely unused feed defaults do not block publication.
- Existing category-specific styling or unknown historical overrides are not claimed to have layout parity. Their recognized content still renders; the Admin readiness gate identifies unsupported fields before the next publication. The pre-v1 compatibility path deliberately does not withdraw a live page automatically.

## URL and rendering boundary

All modern link/media values pass the same bounded normalizer. No executable schemes, protocol-relative addresses, control characters or URL credentials are accepted. Media also rejects common signed/token query parameters, including relative paths. Arbitrary text is React-escaped; the new renderer uses no HTML injection. Images reserve dimensions, use no-referrer and lazy loading below the hero; they do not pass through a server-side image proxy. Existing unverified hero-media policy also overrides inline hero and SEO image configuration.

## Verification

Default suites: `npm test` in each checkout. Producer tests execute the actual save action with synthetic I/O; consumer tests run the actual public loader, React renderer and metadata generator. They cover nested/legacy/v1, invalid version, draft/withdrawal, text/media/links/visibility, styling/menu order/FAQ, URL credentials and AppEntryAction context. Neither suite claims database RLS or deployed cache verification.

Explicit two-app integration, from Admin:

```sh
node --import tsx scripts/verify-publication-roundtrip.mjs /absolute/web-checkout /absolute/admin-checkout
```

This builds a disposable Next production application, serves synthetic rows over loopback, runs the actual Admin publication/delivery, reads through the actual Web loader/cache, and asserts actual Next HTML and metadata. It checks warm-cache reuse, draft isolation, publication invalidation and modern rendering, withdrawal 404, retry and non-resurrection. No production user/data/secret is used. Parent integration must separately verify CI, deployment, public layouts on devices and real partner content before rollout.
