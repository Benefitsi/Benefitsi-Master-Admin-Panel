import assert from "node:assert/strict"
import test from "node:test"
import { adminNavigation, isAdminNavigationActive } from "../lib/admin-navigation.ts"

const destinations = [
  ["Übersicht", "Übersicht", "/"],
  ["Partner", "Partner", "/partners"],
  ["Städte", "Stadtportale", "/city-pages"],
  ["Städte", "Prüfung & Freigaben", "/city-operations"],
  ["Inhalte", "Magazin", "/editorial"],
  ["Inhalte", "Medien", "/media"],
  ["Inhalte", "Wissen", "/wissen"],
  ["Buchungen & Bestellungen", "Buchungen", "/bookings"],
  ["Buchungen & Bestellungen", "Essensbestellungen", "/commerce"],
  ["Agenten", "Agentenübersicht", "/agents"],
  ["Agenten", "Aufträge & Abläufe", "/automation"],
  ["Auswertung", "Geschäftszahlen", "/analytics"],
  ["Auswertung", "SEO & Sichtbarkeit", "/seo"],
]

test("keeps all thirteen destinations under the seven approved main areas", () => {
  assert.deepEqual(adminNavigation.map(entry => entry.label), [
    "Übersicht", "Partner", "Städte", "Inhalte", "Buchungen & Bestellungen", "Agenten", "Auswertung",
  ])
  assert.deepEqual(adminNavigation.flatMap(entry => "items" in entry
    ? entry.items.map(item => [entry.label, item.label, item.href])
    : [[entry.label, entry.label, entry.href]]), destinations)
})

test("marks the current page and its parent group on nested routes", () => {
  for (const [pathname, wantGroup, wantLink] of [
    ["/", "Übersicht", "Übersicht"],
    ["/partners", "Partner", "Partner"],
    ["/partners/example", "Partner", "Partner"],
    ["/city-pages/annweiler/content/event/123", "Städte", "Stadtportale"],
    ["/city-operations/events/123", "Städte", "Prüfung & Freigaben"],
    ["/editorial/new", "Inhalte", "Magazin"],
    ["/media/123", "Inhalte", "Medien"],
    ["/wissen/123", "Inhalte", "Wissen"],
    ["/bookings/123", "Buchungen & Bestellungen", "Buchungen"],
    ["/commerce/orders/123", "Buchungen & Bestellungen", "Essensbestellungen"],
    ["/agents/123", "Agenten", "Agentenübersicht"],
    ["/automation/jobs/123", "Agenten", "Aufträge & Abläufe"],
    ["/analytics/revenue", "Auswertung", "Geschäftszahlen"],
    ["/seo/audit", "Auswertung", "SEO & Sichtbarkeit"],
  ]) {
    const matches = adminNavigation.flatMap(entry => ("items" in entry ? entry.items : [entry])
      .filter(item => isAdminNavigationActive(pathname, item.href))
      .map(item => [entry.label, item.label]))
    assert.deepEqual(matches, [[wantGroup, wantLink]], pathname)
  }
})

test("does not mistake similar route prefixes for admin destinations", () => {
  for (const pathname of ["/partner", "/partners-archive", "/city-pages-old", "/seo-tools", "/unknown"])
    assert.equal(adminNavigation.some(entry => ("items" in entry ? entry.items : [entry])
      .some(item => isAdminNavigationActive(pathname, item.href))), false, pathname)
})
