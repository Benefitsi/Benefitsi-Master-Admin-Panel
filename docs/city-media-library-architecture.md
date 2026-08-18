# City Media Library Architecture

Status: P1 Welle 2A · Annweiler PRELAUNCH · 2026-08-13

## 1. Current state

The city product already had media values distributed across several legacy
fields: `cities.hero_image_url`, `city_places.image_url`,
`city_events.image_url`, `city_routes.image_url`/`media`,
`city_guides.hero_image_url`, and partner `feature_card_url`/cover assets.
Public surfaces render these values through Next/Image or the shared
`CityMedia` fallback surface. The existing `partner-assets` Supabase Storage
bucket remains the source for partner media. Before this wave there was no
generic, role-aware city media catalog or admin workflow for assignments,
focal points, provenance, or safe removal.

## 2. Reusable parts and compatibility boundary

The existing Supabase project, Storage, Next/Image pipeline, city data models,
AdminShell, `requireAdmin()` authorization, and public CityMedia component are
reused. Legacy URL fields are compatibility-read only for now. They are not
deleted or rewritten in this wave. A future migration can catalog them one by
one and then remove the old fields after a separate audit.

The canonical admin surface is `https://admin.benefitsi.de`. The city-web
`/admin/*` routes remain protected/redirected and are not a second admin
product. The Media Library is available centrally at `/media` and from the
existing City and entity editor entry points.

## 3. Target model

`city_media_assets` stores one physical or referenced asset with optional
city scope, Storage bucket/path or public URL, media metadata, dimensions,
hash, title, alt text, photographer, copyright holder, license, source URL,
source type, provenance note, status, actor, and timestamps.

`city_media_assignments` maps an asset to an entity and role. Supported entity
types are `PLACE`, `BUSINESS`, `PARTNER_LOCATION`, `EVENT`, `ROUTE`, `GUIDE`,
`COLLECTION`, `HUB`, `CITY`, and `CITY_HOMEPAGE`. Supported roles are `HERO`,
`CARD`, `GALLERY`, `THUMBNAIL`, `OG`, `SECTION`, and `BACKGROUND`. Assignments
include primary/order flags, role-scoped `manual_lock`, and global plus
desktop/mobile focal coordinates from 0 to 1.

`city_media_audit` records upload, metadata, assignment, replacement,
reorder, lock, unassign, archive, and blocked-delete actions with actor,
entity, role, and previous/next state snapshots.

## 4. Source priority and manual lock

The shared public resolver ranks candidates in this order:

1. role-scoped manual lock
2. manual upload/curation
3. partner or existing entity media
4. official or tourism source
5. agent-discovered asset
6. neutral fallback

The lock belongs to one entity-role assignment. A locked Hero does not stop a
Gallery assignment from being added later. No automated/agent path exists in
this wave; the data contract is ready for a future proposal/review flow.

## 5. Storage and permissions

New uploads use the existing Supabase project and the public `city-media`
bucket at `cities/{cityId}/media/{assetId}-{safe-name}.{extension}`. JPG, PNG,
WebP, and AVIF are allowlisted with a 10 MB limit. The public bucket setting
only controls downloads: Storage and table writes are restricted to admins.
Public clients can read published assets and their assignments through RLS.
All admin API mutations authenticate with `requireAdmin()` and use the
service-role server client only after that check.

## 6. Admin workflow

The existing AdminShell contains `Media Library`; a city editor also links to
the library with city/entity filters. The UI supports upload, search, city/
entity/role/source/status filters, missing-metadata filtering, metadata and
provenance editing, assignment, Hero/Card/Gallery/etc. roles, ordering,
manual lock, focal-point controls, desktop/mobile/Card previews, usage view,
assignment removal, and archive. Assets with active assignments cannot be
deleted. Archiving removes only owned `city-media` objects; referenced legacy
partner assets are not physically removed.

## 7. Public resolver and legacy migration

`src/lib/cities/city-media.ts` is the central public resolver. City homepage,
Place, Event, Route, Guide, and public city Business/Partner surfaces consult
the catalog first and retain their legacy fields as fallback. Focal data is
passed to the existing image surfaces without changing public layout design.

Existing active Knobi media was cataloged as `EXISTING_ASSET` and role-scoped
locked for the Business Hero. Its partner association is verified from the
active partner record. Photographer, copyright holder, and license remain
unknown; no legal metadata was invented.

## 8. Agent readiness

No media agent, web image search, or automatic publisher was added. A future
agent can create a proposal with source/provenance and await human review;
the resolver and database lock prevent it from replacing a locked role.

## 9. QA contract

The contract tests cover upload restrictions, admin-only mutation paths,
published-read boundaries, role assignments, gallery ordering, focal-point
fields, role-scoped locking, resolver priority, safe-delete blocking,
existing-asset provenance, legacy compatibility, and PRELAUNCH preservation.
Live QA must use a temporary asset, remove its assignments, verify it is not
left public, and then check the existing homepage, Trifels Place, Event,
Route, Guide, and Business surfaces for image and layout regressions.
