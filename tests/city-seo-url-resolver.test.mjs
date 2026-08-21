import assert from "node:assert/strict";
import test from "node:test";

const { getCitySeoUrl, resolveCitySeoOpportunity } = await import("../lib/city-agent/seo-url-resolver.ts");

const directory = {
  cityId: "city-1",
  citySlug: "sample-city",
  cityName: "Sample City",
  places: [
    { id: "place-trifels", title: "Reichsburg Trifels", canonicalSlug: "sample-trifels", status: "active", kind: "place" },
    { id: "place-trifelsbad", title: "Trifelsbad Sample City", canonicalSlug: "sample-trifelsbad", status: "active", kind: "place" },
    { id: "place-library", title: "Stadtbücherei Sample City", canonicalSlug: "sample-stadtbuecherei", status: "active", kind: "place" },
    { id: "place-anebos", title: "Burgruine Anebos", canonicalSlug: "sample-anebos", status: "active", kind: "place" },
    { id: "place-fensterfelsen", title: "Fensterfelsen", canonicalSlug: "sample-fensterfelsen", status: "active", kind: "place" },
  ],
  events: [],
  routes: [],
  guides: [],
};

test("resolves an existing place to the shared canonical detail route", () => {
  const result = resolveCitySeoOpportunity({
    directory,
    contentType: "city_place",
    contentId: null,
    title: "Burg Trifels",
    sourceSlug: "sample-trifels-official",
    sourceTrustTier: "A",
  });
  assert.equal(result.action, "IMPROVE_EXISTING");
  assert.equal(result.entityId, "place-trifels");
  assert.equal(result.canonicalUrl, "https://benefitsi.de/stadt/sample-city/entdecken/ort/sample-trifels");
});

test("marks a second opportunity for the same entity as a merge, never a new URL", () => {
  const result = resolveCitySeoOpportunity({
    directory,
    contentType: "city_place",
    contentId: null,
    title: "Reichsburg Trifels – weiterer Quelltext",
    sourceSlug: "sample-trifels-official",
    sourceTrustTier: "A",
    existingEntityKeys: new Set(["place:place-trifels"]),
  });
  assert.equal(result.action, "MERGE_DUPLICATE");
  assert.equal(result.canonicalUrl, "https://benefitsi.de/stadt/sample-city/entdecken/ort/sample-trifels");
});

test("does not confuse a longer place name with the castle alias", () => {
  const result = resolveCitySeoOpportunity({
    directory,
    contentType: "city_place",
    contentId: null,
    title: "Trifelsbad Sample City | Verbandsgemeinde",
    sourceSlug: "sample-trifelsbad-vg",
    sourceTrustTier: "A",
  });
  assert.equal(result.action, "IMPROVE_EXISTING");
  assert.equal(result.entityId, "place-trifelsbad");
  assert.equal(result.canonicalUrl, "https://benefitsi.de/stadt/sample-city/entdecken/ort/sample-trifelsbad");
});

test("ignores provider chrome and external identifiers when resolving known places", () => {
  const library = resolveCitySeoOpportunity({
    directory,
    contentType: "city_place",
    contentId: null,
    title: "Node: Stadtbücherei Sample City (3148951211) | OpenStreetMap",
    sourceSlug: "osm-stadtbuecherei-sample-city",
    sourceTrustTier: "A",
  });
  assert.equal(library.entityId, "place-library");
  assert.equal(library.canonicalUrl, "https://benefitsi.de/stadt/sample-city/entdecken/ort/sample-stadtbuecherei");

  const anebos = resolveCitySeoOpportunity({
    directory,
    contentType: "city_place",
    contentId: null,
    title: "Burgruine Anebos • Castle and Fort » outdooractive.com",
    sourceSlug: "outdooractive-anebos-sample-city",
    sourceTrustTier: "A",
  });
  assert.equal(anebos.entityId, "place-anebos");

  const fensterfelsen = resolveCitySeoOpportunity({
    directory,
    contentType: "city_place",
    contentId: null,
    title: "Fensterfelsen • Biotop und Geotop » outdooractive.com",
    sourceSlug: "outdooractive-fensterfelsen-sample-city",
    sourceTrustTier: "A",
  });
  assert.equal(fensterfelsen.entityId, "place-fensterfelsen");
});

test("resolves event sources to the existing city event hub", () => {
  const result = resolveCitySeoOpportunity({
    directory,
    contentType: "city_event",
    contentId: null,
    title: "Veranstaltungen in Sample City",
    sourceSlug: "sample-official-events-calendar",
    sourceTrustTier: "A",
  });
  assert.equal(result.action, "IMPROVE_EXISTING");
  assert.equal(result.entityType, "hub");
  assert.equal(result.canonicalUrl, "https://benefitsi.de/stadt/sample-city/veranstaltungen");
});

test("builds all supported detail route shapes centrally", () => {
  assert.equal(getCitySeoUrl("sample-city", "route", "forest-loop"), "https://benefitsi.de/stadt/sample-city/entdecken/route/forest-loop");
  assert.equal(getCitySeoUrl("sample-city", "guide", "a-day-in-town"), "https://benefitsi.de/stadt/sample-city/a-day-in-town");
  assert.equal(getCitySeoUrl("sample-city", "hub", null, "discovery"), "https://benefitsi.de/stadt/sample-city/entdecken");
});
