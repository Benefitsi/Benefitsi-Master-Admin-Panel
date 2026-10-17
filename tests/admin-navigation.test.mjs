import assert from "node:assert/strict"
import test from "node:test"
import { adminNavigation, isAdminNavigationActive, activeAdminNavigationHref } from "../lib/admin-navigation.ts"

const destinations = [
  ["Übersicht", "Übersicht", "/"],
  ["Partner", "Partnerübersicht", "/partners"],
  ["Partner", "Akquise & Kontakte", "/partners/acquisition"],
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

test("keeps useful main destinations without the redundant workspace entry", () => {
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
    ["/partners", "Partner", "Partnerübersicht"],
    ["/partners/acquisition", "Partner", "Akquise & Kontakte"],
    ["/partners/acquisition/deep", "Partner", "Akquise & Kontakte"],
    ["/partners/visit-levels", "Partner", "Partnerübersicht"],
    ["/partners/example", "Partner", "Partnerübersicht"],
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
      .filter(item => activeAdminNavigationHref(pathname, "items" in entry ? entry.items : [entry]) === item.href)
      .map(item => [entry.label, item.label]))
    assert.deepEqual(matches, [[wantGroup, wantLink]], pathname)
  }
})

test("does not mistake similar route prefixes for admin destinations", () => {
  for (const pathname of ["/partner", "/partners-archive", "/city-pages-old", "/seo-tools", "/unknown"])
    assert.equal(adminNavigation.some(entry => ("items" in entry ? entry.items : [entry])
      .some(item => isAdminNavigationActive(pathname, item.href))), false, pathname)
})

test("workspace stays reachable in the selected partner without a redundant main link", async () => {
  const { readFileSync, existsSync } = await import("node:fs")
  assert.equal(adminNavigation.some(entry => "href" in entry && entry.href === "/workspace"), false)
  const partner = readFileSync(new URL("../app/partner-admin.tsx", import.meta.url), "utf8")
  assert.match(partner, /href=\{`\/workspace\?partner=\$\{encodeURIComponent\(partner\.id\)\}`\}/)
  assert.ok(existsSync(new URL("../app/workspace/page.tsx", import.meta.url)))
})
