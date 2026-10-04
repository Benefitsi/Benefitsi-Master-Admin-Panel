import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import adminData from "../lib/admin-data.ts"

const { createClient } = createRequire(import.meta.url)("@supabase/supabase-js")
const { getDashboardData } = adminData

function version(id, micrositeId, number, status, text = id) {
  return {
    id, microsite_id: micrositeId, version_number: number, status,
    config: { content: { aboutText: text } }, created_by: null,
    created_at: "2026-10-01T00:00:00Z",
  }
}

function micrositeDatabase({ publishedId = "a-live", hiddenVersions = [], error } = {}) {
  const requests = []
  const transferredVersions = []
  const microsites = [
    { id: "site-a", partner_id: "partner-a", published_version_id: publishedId },
    { id: "site-b", partner_id: "partner-b", published_version_id: "b-live" },
    { id: "site-c", partner_id: "partner-c", published_version_id: null },
  ].map((row) => ({
    ...row, slug: row.id, subdomain: row.id, canonical_url: null,
    status: "published", created_at: null, updated_at: null,
  }))
  const versions = [
    version("a-old-draft", "site-a", 4, "draft", "old draft".repeat(1000)),
    version("a-live", "site-a", 2, "published"),
    version("a-draft", "site-a", 7, "draft"),
    version("a-review", "site-a", 8, "review"),
    version("a-null-draft", "site-a", null, "draft"),
    version("a-other-published", "site-a", 3, "published", "old publication".repeat(1000)),
    version("a-archived", "site-a", 1, "archived"),
    version("b-live", "site-b", 5, "archived"),
    version("unrelated", "other-site", 1, "published"),
  ].filter((row) => !hiddenVersions.includes(row.id))
  const partners = ["a", "b", "c", "d"].map((id) => ({
    id: `partner-${id}`, name: `Synthetic business ${id}`, owner_id: null, city_id: null,
  }))

  function ordered(rows, order) {
    if (!order) return rows
    assert.equal(order, "version_number.desc.nullslast")
    return [...rows].sort((a, b) => (b.version_number ?? -Infinity) - (a.version_number ?? -Infinity))
  }

  const client = createClient("https://database.example.test", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const endpoint = new URL(input)
        assert.equal(init.method, "GET")
        requests.push(endpoint)
        const query = endpoint.searchParams
        const table = endpoint.pathname.split("/").at(-1)
        if (table === "microsite_versions") {
          transferredVersions.push(...versions)
          return Response.json(ordered(versions, query.get("order")))
        }
        if (table === "microsites") {
          if (error) return Response.json(error, { status: 403 })
          if (query.get("select") === "*") return Response.json(microsites)

          assert.equal(query.get("select"), "*,draftVersions:microsite_versions!microsite_versions_microsite_id_fkey(*),publishedVersion:microsite_versions!microsites_published_version_fk(*)")
          const rows = microsites.map((site) => {
            let drafts = versions.filter((row) => row.microsite_id === site.id)
            if (query.has("draftVersions.status")) {
              assert.equal(query.get("draftVersions.status"), "eq.draft")
              drafts = drafts.filter((row) => row.status === "draft")
            }
            drafts = ordered(drafts, query.get("draftVersions.order"))
            if (query.has("draftVersions.limit")) drafts = drafts.slice(0, Number(query.get("draftVersions.limit")))
            const published = versions.find((row) => row.id === site.published_version_id) ?? null
            transferredVersions.push(...drafts, ...(published ? [published] : []))
            return { ...site, draftVersions: drafts, publishedVersion: published }
          })
          return Response.json(rows)
        }
        const rows = {
          partners,
          menus: [{ id: "menu-a", partner_id: "partner-a", name: "Menu" }],
          menu_categories: [{ id: "category-a", menu_id: "menu-a", name: "Food" }],
          menu_items: [{ id: "item-a", menu_id: "menu-a", category_id: "category-a", name: "Soup" }],
          visits: [{ id: "visit-a", partner_id: "partner-a", user_id: null }],
        }
        return Response.json(rows[table] ?? [])
      },
    },
  })
  return { client, requests, transferredVersions }
}

test("dashboard transfers only the latest draft and exact published version in one microsite request", async () => {
  const db = micrositeDatabase()
  const dashboard = await getDashboardData(db.client)
  const site = dashboard.partners[0].microsite

  assert.equal(site.draftVersion.id, "a-draft")
  assert.equal(site.draftVersion.config.content.aboutText, "a-draft")
  assert.equal(site.publishedVersion.id, "a-live")
  assert.equal(site.publishedVersion.config.content.aboutText, "a-live")
  assert.equal(Object.hasOwn(site, "draftVersions"), false)
  assert.deepEqual(dashboard.errors, [])
  assert.deepEqual(db.transferredVersions.map((row) => row.id).sort(), ["a-draft", "a-live", "b-live"])
  assert.equal(db.requests.filter((request) => request.pathname.includes("microsite")).length, 1)
  assert.equal(db.requests.length, 18)
})

test("missing drafts, missing versions and partners without microsites remain visible", async () => {
  const db = micrositeDatabase()
  const dashboard = await getDashboardData(db.client)
  const [, publishedOnly, empty, noSite] = dashboard.partners

  assert.equal(publishedOnly.microsite.draftVersion, null)
  assert.equal(publishedOnly.microsite.publishedVersion.id, "b-live")
  assert.equal(publishedOnly.microsite.publishedVersion.status, "archived")
  assert.equal(empty.microsite.id, "site-c")
  assert.equal(empty.microsite.draftVersion, null)
  assert.equal(empty.microsite.publishedVersion, null)
  assert.equal(noSite.microsite, null)
})

test("a published pointer to another microsite never becomes this partner's configuration", async () => {
  const db = micrositeDatabase({ publishedId: "b-live" })
  const dashboard = await getDashboardData(db.client)

  assert.equal(dashboard.partners[0].microsite.published_version_id, "b-live")
  assert.equal(dashboard.partners[0].microsite.publishedVersion, null)
  assert.equal(dashboard.partners[0].microsite.draftVersion.id, "a-draft")
  assert.equal(dashboard.partners[1].microsite.publishedVersion.id, "b-live")
})

test("versions hidden by the database stay absent without falling back to older publications", async () => {
  const db = micrositeDatabase({ hiddenVersions: ["a-live", "a-draft", "a-old-draft", "a-null-draft"] })
  const dashboard = await getDashboardData(db.client)

  assert.equal(dashboard.partners[0].microsite.id, "site-a")
  assert.equal(dashboard.partners[0].microsite.draftVersion, null)
  assert.equal(dashboard.partners[0].microsite.publishedVersion, null)
  assert.deepEqual(dashboard.errors, [])
})

for (const failure of [
  { code: "42501", message: "permission denied for table microsites" },
  { code: "42501", message: "permission denied for table microsite_versions" },
  { code: "PGRST200", message: "Could not find a relationship in the schema cache" },
]) {
  test(`microsite failure preserves menus and activity: ${failure.message}`, async () => {
    const db = micrositeDatabase({ error: { ...failure, details: null, hint: null } })
    const dashboard = await getDashboardData(db.client)

    assert.deepEqual(dashboard.errors, [failure.message])
    assert.equal(dashboard.partners.length, 4)
    assert.equal(dashboard.partners[0].microsite, null)
    assert.equal(dashboard.partners[0].menus[0].categories[0].items[0].name, "Soup")
    assert.equal(dashboard.partners[0].visits[0].id, "visit-a")
    assert.equal(db.requests.filter((request) => request.pathname.includes("microsite")).length, 1)
  })
}
