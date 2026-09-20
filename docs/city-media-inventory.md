# Read-only city media inventory

The active Admin now has `/media`, linked from the Admin navigation. The route and the server-only loader independently authenticate an administrator; the loader constructs a service client only after an exact boolean admin check. It selects only display fields from `city_media_assets`, `city_media_assignments`, `cities`, and city-scoped `city_places`. It has no mutation actions, upload handlers, signed URLs, audit reads, or new permissions.

The page shows asset status, source category, title/alt text, existing assignments, primary/manual-lock flags, and a GET-only filter. External source URLs and private audit/provenance/creator fields are not sent to the view. Thumbnails are limited to JPEG/PNG/WebP/AVIF in the configured project's public `city-media` bucket. Other images remain listed without thumbnails. Errors and missing configuration are unknown; a response that reaches its requested limit is explicitly a partial inventory (200 assets, 500 assignments, 200 cities, 500 places).

## Public preview contract

`publicMediaPreviewHref` in `lib/city-media/inventory.ts` binds the assignment to the same asset, assignment city, existing city, and a verified PLACE record from that city. An asset must be `PUBLISHED` and city-scoped to that city or global. IDs and keys must agree; supported roles are CARD and HERO. Unsupported or unresolved targets are visibly unverified.

The origin is fixed to `https://benefitsi.de`; database strings cannot supply a host or arbitrary URL. CARD links to `/stadt/<city>/sehenswuerdigkeiten#place-<place.id>`. HERO links to `/stadt/<city>/entdecken/ort/<canonical_slug-or-id>`. This follows the current Web `CityCollectionPage` ID anchor and `city-urls.ts` detail route. The old library preferred entityKey for the CARD anchor, which could miss the actual ID anchor.

A link identifies a public surface to inspect. It does not certify that this particular asset is currently visible: the public resolver also applies role/source/primary priorities, review/snapshot state, collection filters and cache. No public cache invalidation or publication happens here. The inventory is not a usage analytics counter.

## Legacy boundary

`benefitsi-admin-knowledge-worktree` still contains the older `components/city-media/media-library.tsx`, `lib/city-media/{contracts,data,server}.ts`, old page and four `/api/media` CRUD handlers. These nine working-tree files total 1,732 lines at inspection (20 September 2026). They include uploads, archive/delete, assignment writes, storage cleanup and broader lookups. They are not imported into this read-only route. Commits `1ded93836b176ae6a0f1b18f6770cecf0d14f11f` and `cfb0c73efcea87e067ad2aca978b180e721abde0` provide historical provenance, not an approved whole-branch migration.

Seven uncommitted Memory Stamp changes and `task-6-brief.md` in that old checkout remain untouched. In particular its uncommitted `MEMORY_STAMP_ARTWORK` role is absent from the current Database enum. Do not carry that role or the dirty assignment handler into a release accidentally.

To restore editing later: review the exact legacy diff, resolve Memory Stamp ownership/schema separately, define atomic database/storage/audit failure semantics, preserve city/entity/asset scope and authorization, verify public cache invalidation, then test a narrow migration in staging. Only remove old files/checkouts after all intended changes have a committed owner and their imports/deployments have been checked. No deletion or branch merge was performed for this inventory.

## Qualification

Run `node --import tsx --test --test-concurrency=1 tests/city-media-inventory*.test.mjs`, TypeScript, focused ESLint, and the full Admin suite. Tests execute the real helper, server loader with inert auth/transports, and rendered React component. They cover authorization ordering, identity/city/key mismatch, CARD versus HERO, trusted image URLs, minimal projection, unknown/empty/limited results, escaped content, and a GET-only interface.

A paired Web test should read this active module, not substitute the old media library checkout. Release acceptance still needs an authenticated Admin browser inspection against the intended environment plus public CARD/HERO spot checks. This local implementation does not claim a deployed page or a production browser pass.

Current local qualification (20 September 2026): 11 focused media tests and all 341 Admin tests passed, TypeScript and targeted ESLint exited0, and independent root review found no new blocking issue. The paired Web integration passed6/6. The actual component with current Tailwind and synthetic data was visually checked in Chrome at1440/390 CSS pixels: no horizontal overflow, readable long titles and status/unknown hints, distinct CARD/HERO targets, native mobile status selection confirmed, no browser console errors. This is an isolated component qualification, not an authenticated production-page test. A fresh production build is recorded separately in the execution report.
