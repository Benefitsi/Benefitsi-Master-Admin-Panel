import assert from "node:assert/strict"
import test from "node:test"
import { baseSearchEntries, searchEcosystem, agentSearchEntries, pageSearchEntries } from "../lib/ecosystem/search.ts"

test("header search finds existing features, tiers and actual admin destinations", () => {
  const feature = searchEcosystem(baseSearchEntries, "stempel")
  assert.ok(feature.some(item => item.kind === "feature"))
  assert.ok(searchEcosystem(baseSearchEntries, "premium").some(item => item.kind === "tier"))
  assert.ok(searchEcosystem(baseSearchEntries, "geschäftszahlen").some(item => item.href === "/analytics"))
  assert.ok(searchEcosystem(baseSearchEntries, "StaDtportale").some(item => item.href === "/city-pages"))
  assert.ok(baseSearchEntries.every(item => item.id && item.title && (item.href.startsWith("/") || item.href.startsWith("https://benefitsi.de"))))
})

test("search combines all query words, ignores accents, and ranks matching titles first", () => {
  const entries = [
    { id: "description", title: "Andere", description: "Menü Speisekarte", href: "/partners", kind: "feature" },
    { id: "title", title: "Menü", description: "Speisekarte", href: "/partners", kind: "feature" },
  ]
  assert.deepEqual(searchEcosystem(entries, "menu speisekarte").map(item => item.id), ["title", "description"])
  assert.equal(searchEcosystem(entries, "menü fehlt").length, 0)
  assert.deepEqual(searchEcosystem(entries, "   "), [])
})

test("dynamic agent and page results retain specific management links and publication evidence", () => {
  const agents = agentSearchEntries([{ id: "ben", name: "Ben", purpose: "Koordination", href: "/agents?agent=ben#agent-ben" }])
  assert.equal(searchEcosystem(agents, "Ben")[0].href, "/agents?agent=ben#agent-ben")
  const pages = pageSearchEntries([
    { id: "city:a", title: "Annweiler", kind: "Stadtseite", description: "Stadt", status: "Stadtseite", href: "https://benefitsi.de/stadt/annweiler", adminHref: "/city-pages/annweiler" },
    { id: "microsite:k", title: "Knobi", kind: "Microsite", description: "Annweiler", status: "Entwurf", href: null, adminHref: "/partners?partner=k&view=microsite" },
  ])
  assert.equal(pages[0].href, "/city-pages/annweiler")
  assert.equal(pages[0].publicHref, "https://benefitsi.de/stadt/annweiler")
  assert.equal(pages[1].publicHref, null, "drafts must never get an invented public URL")
  assert.equal(searchEcosystem(pages, "Knobi")[0].description.includes("Entwurf"), true)
})
