import assert from "node:assert/strict"
import test from "node:test"
import publicMicrositeModule from "../lib/public-microsite.ts"

const { getPublishedMicrositePage } = publicMicrositeModule

function createQuery(result, selections) {
  const query = {
    select(columns) {
      selections.push(columns)
      return query
    },
    eq() {
      return query
    },
    in() {
      return query
    },
    not() {
      return query
    },
    order() {
      return query
    },
    maybeSingle() {
      return Promise.resolve(result)
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected)
    },
  }

  return query
}

function createPublicMicrositeClient() {
  const selections = []
  const results = {
    microsites: {
      data: {
        id: "microsite-1",
        partner_id: "partner-1",
        slug: "public-shop",
        published_version_id: "version-1",
      },
      error: null,
    },
    partners: {
      data: {
        id: "partner-1",
        name: "Public shop",
        owner_id: "owner-private-id",
        email: "shop@example.com",
        pin: "private-pin",
      },
      error: null,
    },
    microsite_versions: {
      data: {
        id: "version-1",
        microsite_id: "microsite-1",
        version_number: 3,
        status: "published",
        created_by: "private-author-id",
        config: {
          elementText: {
            "content.aboutHeadline": "About our shop",
            "content.appPhoneScreenshotUrl": "https://cdn.example/phone.png",
            "social.instagram.url": "javascript:alert(1)",
            "social.instagram.enabled": "true",
            "builder.privateNote": "do not expose",
          },
          assets: { library: [{ url: "https://cdn.example/private.png" }] },
          builder: { versionNote: "internal launch note" },
          printables: { note: "internal printable note" },
        },
      },
      error: null,
    },
    deals: {
      data: [
        {
          id: "deal-1",
          partner_id: "partner-1",
          active: true,
          reward_item: "Public deal",
          staff_instructions: "private staff instructions",
          metadata: { internal: true },
        },
      ],
      error: null,
    },
    partner_reward_milestones: { data: [], error: null },
    partner_opening_hours: { data: [], error: null },
    menus: { data: [], error: null },
    menu_categories: { data: [], error: null },
    menu_items: { data: [], error: null },
  }

  return {
    client: {
      from(table) {
        return createQuery(results[table], selections)
      },
    },
    selections,
  }
}

test("published microsites return a narrow, safe public DTO", async () => {
  const { client, selections } = createPublicMicrositeClient()
  const page = await getPublishedMicrositePage(client, "public-shop")

  assert.ok(page)
  assert.equal(page.partner.owner_id, null)
  assert.equal(page.partner.pin, null)
  assert.equal(page.partner.microsite.publishedVersion.created_by, null)
  assert.equal(page.partner.deals[0].staff_instructions, null)
  assert.equal(page.partner.deals[0].metadata, null)
  assert.equal(page.config.assets.library.length, 0)
  assert.equal(page.config.builder.versionNote, "")
  assert.equal(page.config.printables.note, "")
  assert.equal(page.config.elementText["content.aboutHeadline"], "About our shop")
  assert.equal(
    page.config.elementText["content.appPhoneScreenshotUrl"],
    "https://cdn.example/phone.png",
  )
  assert.equal(page.config.elementText["social.instagram.url"], undefined)
  assert.equal(page.config.elementText["builder.privateNote"], undefined)
  assert.equal(selections.includes("*"), false)
})
