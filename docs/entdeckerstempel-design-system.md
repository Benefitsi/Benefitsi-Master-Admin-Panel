# Benefitsi Entdeckerstempel Design System

This is the design governance for collectible landmark stamps. It is
separate from partner loyalty cards.

## Naming and purpose

- Product term: **Entdeckerstempel**.
- Agent: **ENTDECKERSTEMPEL CURATOR** (`stamp_curator`).
- Skill: **CREATE_LANDMARK_STAMP**.
- Purpose: make a real place collectible while preserving recognition,
  source truth and local character.

## Standard stamp

Default direction: a round or lightly traditional collector seal with an
outer border, landmark name, central landmark illustration, city/location and
optional restrained local ornament. The visual language is a high-quality
tourist collector stamp: clear line work, lightly nostalgic, a modern
Benefitsi twist and subtle ink-print character. It is not an app badge, game
achievement, NFT or cartoon landmark.

Use one primary color or at most two controlled colors from the Benefitsi /
city palette. Use a lightly irregular ink edge and small grain variation, but
keep the mark clean and readable at small size. Front text stays minimal.

## Landmark fidelity

The governing rule is **STYLIZED, BUT NEVER INVENTED**.

The landmark must remain architecturally plausible and recognizable. Reduce
detail only after preserving the defining silhouette, dominant masses,
tower/building placement, roof forms and relevant terrain context. Never add
unverified towers, roofs, façades, crests or logos. Do not use a city crest,
operator logo or institutional seal without a verified rights/accuracy check.

The required prompt constraints are:

> Use the supplied/researched landmark references to preserve the real architectural silhouette and defining proportions.

> Create an original illustrative interpretation, not a copy or tracing of any single photograph.

## Front and back

The digital object has a front and back with a simple flip interaction.

Front: artwork, place, city and optional edition/series indicator.

Back: place/city, a short source-grounded story, collection, stamp number,
collection progress, edition/series position, collected date and optionally
the next nearby stamp. Historical text, dates and stories must always be
source-grounded.

## Collections and editions

Collections can be configured by city or theme, for example `Annweiler
entdecken`, `Burgen der Pfalz`, `Aussichtspunkte`, `Historische Orte` or
`Natur & Felsen`.

Supported edition types are `STANDARD`, `SPECIAL_EDITION`,
`LIMITED_EDITION`, `EVENT_EDITION`, `SEASONAL_EDITION`,
`ANNIVERSARY_EDITION`, `SERIES_PIECE` and `LEGACY_EDITION`.

`LIMITED_EDITION` is valid only with a real event, season, anniversary, route
or other availability constraint and source evidence. Random drop chances,
lootboxes and default game rarity (`COMMON`, `RARE`, `EPIC`, `LEGENDARY`) are
not part of the system.

## Multi-stamp and layer series

A series contains a stable `series_id`, piece count and piece number. Each
piece must be attractive alone and clearly part of the whole. Optional layers
may represent landscape, landmark body, details, vegetation and final
contour/text. A completion artwork or album treatment may be defined as
metadata, but no reward economy or album UI is implemented in this phase.

## QA and human review

Fidelity results are `PASS`, `NEEDS_REVISION` or `FAIL`. Fail on generic
replacement architecture, wrong main tower, invented building mass, false
silhouette, unrecognizable place or a different landmark. Design QA also
checks small-size readability, text legibility, collector appeal, Benefitsi
consistency, visual hierarchy and genuine print character.

Approval is explicit: references first, art second, final human approval last.
Manual lock protects the selected artwork from silent replacement.

## Provenance

Persist or attach city, place, collection, reference URLs, source kinds,
licenses/credits where relevant, checked time, generated time, agent,
version, design brief, fidelity result, approval and edition. References are
for architecture and recognition analysis; they are not permission to copy
the original photograph.
