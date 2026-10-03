import assert from "node:assert/strict"
import test from "node:test"
import { buildPageDirectory, parsePublicMicrositeDirectory } from "../lib/ecosystem/directory.ts"

function dashboard(overrides = {}) {
  return { cities: [], partners: [], errors: [], ...overrides }
}

function partner(overrides = {}) {
  return {
    id: "partner-1",
    name: "Knobi",
    city_name: "Annweiler",
    address: "Hauptstraße 1",
    slug: "partner-only-slug",
    status: "active",
    is_active: true,
    microsite: null,
    ...overrides,
  }
}

function publishedPartner(overrides = {}) {
  return partner({
    microsite: {
      id: "micro-1", partner_id: "partner-1", slug: "knobi-doener-annweiler",
      status: "published", published_version_id: "version-1",
    },
    ...overrides,
  })
}

function publicDirectory(overrides = {}) {
  return parsePublicMicrositeDirectory([{
    id: "micro-1", partner_id: "partner-1", slug: "knobi-doener-annweiler",
    published_version_id: "version-1", updated_at: "2026-10-02T10:00:00Z", ...overrides,
  }])
}

test("city directory uses stored slugs without claiming publication", () => {
  const [page] = buildPageDirectory(dashboard({
    cities: [{ id: "city-1", name: "Annweiler am Trifels", slug: "annweiler" }],
  }))
  assert.equal(page.id, "city:city-1")
  assert.equal(page.title, "Annweiler am Trifels")
  assert.equal(page.kind, "Stadtseite")
  assert.equal(page.status, "Stadtseite")
  assert.equal(page.href, "https://benefitsi.de/stadt/annweiler")
  assert.equal(page.adminHref, "/city-pages/annweiler")
})

test("directory encodes database strings as path segments and query values", () => {
  const [city, microsite] = buildPageDirectory(dashboard({
    cities: [{ id: "city-1", name: "Bad Dürkheim", slug: "bad dürkheim/alt?x=1#teil" }],
    partners: [partner({ id: "partner&view=other#fake" })],
  }))
  assert.equal(city.href, "https://benefitsi.de/stadt/bad%20d%C3%BCrkheim%2Falt%3Fx%3D1%23teil")
  assert.equal(city.adminHref, "/city-pages/bad%20d%C3%BCrkheim%2Falt%3Fx%3D1%23teil")
  assert.equal(microsite.adminHref, "/partners?partner=partner%26view%3Dother%23fake&view=microsite")
})

test("city names cannot invent missing slugs", () => {
  const [page] = buildPageDirectory(dashboard({
    cities: [{ id: "city-1", name: "Annweiler", slug: null }],
  }))
  assert.equal(page.href, null)
  assert.equal(page.adminHref, "/city-pages")
  assert.match(page.status, /Slug fehlt/)
})

test("partner-only slugs and retained non-public versions never become public links", () => {
  const partners = [partner(), ...["draft", "review", "approved", "archived", null].map(status => partner({
    microsite: { id: "micro-1", slug: "knobi", status, published_version_id: "old-version" },
  }))]
  for (const page of buildPageDirectory(dashboard({ partners }))) {
    assert.equal(page.href, null)
    assert.ok(page.adminHref.includes("view=microsite"))
    assert.doesNotMatch(page.status, /^Live$|^Veröffentlicht$/)
  }
})

test("partial loading marks unknown absence instead of claiming no microsite", () => {
  const [page] = buildPageDirectory(dashboard({
    partners: [partner()],
    errors: ["microsites could not be read"],
  }))
  assert.equal(page.href, null)
  assert.match(page.status, /unvollständig|unbekannt/i)
  assert.doesNotMatch(page.status, /nicht angelegt/i)
  assert.equal(page.adminHref, "/partners?partner=partner-1&view=microsite")
})

test("empty and failed input does not create invented rows or totals", () => {
  assert.deepEqual(buildPageDirectory(dashboard()), [])
  assert.deepEqual(buildPageDirectory(dashboard({ errors: ["database unavailable"] })), [])
})

test("only the authoritative selected publication produces a canonical microsite link", () => {
  const [page] = buildPageDirectory(dashboard({ partners: [publishedPartner()] }), publicDirectory())
  assert.equal(page.href, "https://benefitsi.de/partner/knobi-doener-und-pizza-haus")
  assert.equal(page.status, "Öffentlich freigegeben")
  assert.equal(page.title, "Knobi")
  assert.equal(page.description, "Annweiler")
})

test("authoritative current slug takes precedence over a stale partner or microsite slug", () => {
  const [page] = buildPageDirectory(dashboard({ partners: [publishedPartner()] }), publicDirectory({ slug: "neu /?ü" }))
  assert.equal(page.href, "https://benefitsi.de/partner/neu%20%2F%3F%C3%BC")
})

test("stored publication without a successful public projection remains unknown", () => {
  for (const projection of [undefined, parsePublicMicrositeDirectory(null, { message: "denied" })]) {
    const [page] = buildPageDirectory(dashboard({ partners: [publishedPartner()] }), projection)
    assert.equal(page.href, null)
    assert.match(page.status, /nicht geprüft/i)
  }
})

test("a successful empty projection means not publicly released, not a load failure", () => {
  const [page] = buildPageDirectory(dashboard({ partners: [publishedPartner()] }), parsePublicMicrositeDirectory([]))
  assert.equal(page.href, null)
  assert.equal(page.status, "Nicht öffentlich freigegeben")
})

test("mismatched publication identity or selected version cannot publish a directory link", () => {
  for (const override of [{ id: "other" }, { partner_id: "other" }, { published_version_id: "old-version" }]) {
    const [page] = buildPageDirectory(dashboard({ partners: [publishedPartner()] }), publicDirectory(override))
    assert.equal(page.href, null)
  }
  for (const override of [{ is_active: false }, { is_active: null }, { status: "draft" }]) {
    const [page] = buildPageDirectory(dashboard({ partners: [publishedPartner(override)] }), publicDirectory())
    assert.equal(page.href, null)
  }
})

test("public projection cannot override a locally withdrawn or incomplete parent", () => {
  for (const override of [
    { status: "archived" }, { status: "draft" }, { published_version_id: null },
  ]) {
    const candidate = publishedPartner()
    candidate.microsite = { ...candidate.microsite, ...override }
    const [page] = buildPageDirectory(dashboard({ partners: [candidate] }), publicDirectory())
    assert.equal(page.href, null)
  }
})

test("missing partner activation evidence is unknown rather than inactive", () => {
  const [page] = buildPageDirectory(dashboard({
    partners: [publishedPartner({ is_active: null, status: null })],
  }), publicDirectory())
  assert.equal(page.href, null)
  assert.equal(page.status, "Partnerstatus unbekannt")
})

test("malformed public projection fails closed and never exposes retained private fields", () => {
  for (const value of [null, {}, "[]", [null], [{ id: "micro-1" }]]) {
    assert.equal(parsePublicMicrositeDirectory(value).state, "unavailable")
  }
  assert.equal(parsePublicMicrositeDirectory([], { message: "failed" }).state, "unavailable")
  const projection = publicDirectory({ config: { private: "must not survive" }, owner_id: "private" })
  assert.equal(projection.state, "available")
  assert.equal("config" in projection.items[0], false)
  assert.equal("owner_id" in projection.items[0], false)
})

test("independently verified publication survives unrelated partial dashboard data", () => {
  const [page] = buildPageDirectory(dashboard({
    partners: [publishedPartner()], errors: ["deals unavailable"],
  }), publicDirectory())
  assert.equal(page.href, "https://benefitsi.de/partner/knobi-doener-und-pizza-haus")
  assert.match(page.status, /Daten unvollständig/)
})
