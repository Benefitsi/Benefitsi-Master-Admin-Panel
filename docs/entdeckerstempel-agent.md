# Benefitsi Entdeckerstempel Curator

Status: Runtime registriert · `REGISTERED` · `MANUAL_TRIGGER` · kein Scheduler

## Agent position

```text
BEN
└── CONTENT / CREATIVE / DISCOVERY
    └── ENTDECKERSTEMPEL CURATOR (`stamp_curator`)
```

This is one shared Benefitsi capability, not one agent per city. The generic
input is `StampCurator.run({ cityId, placeId })`; the run is enriched with
place context, city context, references and collection context.

Ben remains the orchestrator. Ben may detect a missing stamp, delegate the
task, review the returned proposal and prioritize or escalate it. Ben does
not create the landmark artwork itself.

## Scope boundary

Entdeckerstempel are collectible place stamps for landmarks, viewpoints,
museums, historical places, nature places, events and local experiences. They
are not partner loyalty stamp cards and do not change the existing partner
reward system.

The curator owns research, visual fact extraction, art direction, landmark
fidelity, edition/series design, stamp metadata and stamp QA. City Ops remains
the source of city/place facts, verified sources and existing media. General
SEO, event crawling and partner loyalty remain outside this agent.

## Reusable skill

`CREATE_LANDMARK_STAMP` is registered in the Ben profile and implemented as a
shared workflow:

```text
RESEARCH
→ VISUAL FACT EXTRACTION
→ DESIGN BRIEF
→ STAMP GENERATION
→ FIDELITY QA
→ METADATA
→ HUMAN REVIEW
```

The first generation output is three candidates or composition variants. No
candidate is a final public asset by default.

## Reference workflow

Use 3–8 distinct views wherever possible. Prefer Benefitsi media, official
operator/city/tourism sources, licensed Wikimedia/Open Data and reputable
verification sources. Google Images is discovery-only. A reference is never
copied, traced or used as a single-photo composition source. Store URL,
source kind, author/license information where available, viewpoint, checked
time and notes.

Every run creates a `LANDMARK VISUAL FACT SHEET` covering silhouette, tower
arrangement, roof forms, relative masses, façade details, terrain/context,
recognizable viewpoints and explicit `MUST NOT INVENT` constraints. Important
facts carry `HIGH`, `MEDIUM` or `LOW` confidence. Missing references or
low-confidence critical facts stop final generation.

## Fidelity and approval

The governing rule is **STYLIZED, BUT NEVER INVENTED**. QA compares the
candidate with the fact sheet for silhouette, building/tower placement,
proportions, roof/mass shapes, terrain context and invented structures.

```text
DRAFT → REFERENCE_REVIEW → ART_REVIEW → HUMAN_APPROVED → READY
```

The reference gate must be explicitly approved before final artwork. A final
artwork also requires fidelity `PASS` and human approval. A selected artwork
can be `MANUAL_LOCK`ed; the curator may then propose a new version but may not
silently replace the locked artwork.

## Provenance and media

Stamp artwork is a creative collector asset, not a place hero, card or
gallery photo. The existing City Media Library remains the only asset source;
there is no second stamp asset library. The inspected library currently
supports `city_media_assets` and `city_media_assignments` with roles
`HERO`, `CARD`, `GALLERY`, `THUMBNAIL`, `OG`, `SECTION` and `BACKGROUND`.

No schema or public assignment is changed in this foundation. Before the
first persisted artwork, add an additive, reviewed `STAMP_ARTWORK` role (or a
documented equivalent) to that existing library. Do not overload a place
photo role and do not publish a stamp without artwork provenance.

## Safety isolation

The registration is enabled for manual invocation and manual-triggered. It
has no scheduler, no mass-run path and no publication permission. Hermes loads
the capability through the real `ben` profile and its `skills/` directory; the
machine-readable manifest documents that same registration rather than acting
as a second runtime registry. It does not change City Agent Shadow scheduler
state, source metrics, proposals, freshness, review policy or publication
policy.

The machine-readable registration lives at
`tools/hermes-city-profiles/ben/entdeckerstempel-curator.yaml`; the reusable
skill lives below that Ben profile. The deterministic contract and tests live
in `lib/stamp-curator` in Master Admin.
