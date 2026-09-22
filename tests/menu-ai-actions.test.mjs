import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID, randomInt } from "node:crypto"
import test from "node:test"
import ts from "typescript"
import * as menuImport from "../lib/menu-import.js"
import * as config from "../lib/partner-config.ts"

const draft = {
  name: "Speisekarte", currency: "EUR", complete: true, warnings: [],
  categories: [{ name: "Speisen", items: [{ name: "Suppe", description: "Tomaten", price: 6.5, tags: [], allergens: [], note: "" }] }],
}

function fixture({ signedIn = true, owner = true, admin = false, missingMenu = false, alreadyExists = false, failItems = false } = {}) {
  const writes = [], calls = [], invalidations = []
  const session = signedIn ? { user: { id: randomUUID() }, isAdmin: admin, ownedPartnerIds: owner ? ["partner-owned"] : [], partnerIds: ["partner-owned"] } : null
  const db = { from(table) {
    let operation, payload
    const filters = {}
    const query = {}
    query.select = () => query
    query.eq = (key, value) => { filters[key] = value; return query }
    for (const method of ["limit", "order", "maybeSingle", "single", "in"]) query[method] = () => query
    for (const method of ["insert", "update", "delete"]) query[method] = value => { operation = method; payload = value; return query }
    query.then = (resolve, reject) => {
      let data = null, error = null
      if (operation) {
        writes.push({ table, operation, payload, filters: { ...filters } })
        if (table === "menus" && operation === "insert") data = { id: "menu-created" }
        if (table === "menu_categories" && operation === "insert") data = payload.map((row, i) => ({ ...row, id: `category-${i}` }))
        if (table === "menu_items" && operation === "insert" && failItems) error = { message: "Synthetic item save failure" }
      } else if (table === "menus") {
        data = filters.id ? (missingMenu ? null : { id: filters.id, partner_id: filters.id === "foreign-menu" ? "partner-other" : "partner-owned" }) : alreadyExists ? { id: "menu-existing" } : null
      } else if (table === "partners") data = { id: "partner-owned", type: "Food & Drink" }
      else data = []
      return Promise.resolve({ data, error }).then(resolve, reject)
    }
    return query
  } }
  const boundaries = {
    "node:crypto": { randomUUID, randomInt },
    "next/cache": { revalidatePath: path => invalidations.push(path) },
    "next/server": { after: fn => fn() },
    "@/lib/partner-portal": {
      getPartnerPortalSession: async () => session,
      canManagePartner: (s, id) => s.isAdmin || s.ownedPartnerIds.includes(id),
    },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/partner-config": config,
    "@/lib/menu-import.js": menuImport,
    "@/lib/menu-ai-import": {
      extractMenuFromFiles: async files => { calls.push(files); return structuredClone(draft) },
      validateReviewedMenuDraft: value => {
        if (value.categories.some(c => c.items.some(i => i.price === null))) throw new Error("Preis fehlt")
        return value
      },
    },
  }
  const loaded = { exports: {} }
  const js = ts.transpileModule(readFileSync(new URL("../app/partner-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)(id => boundaries[id] ?? {}, loaded, loaded.exports)
  const actions = loaded.exports
  assert.equal(typeof actions.previewAIMenuImport, "function", "preview action must exist")
  assert.equal(typeof actions.confirmAIMenuImport, "function", "confirm action must exist")
  function form({ menuId = "menu-owned", partnerId = "partner-owned", confirmed = true, value = draft } = {}) {
    const input = new FormData()
    input.set("menu_id", menuId)
    input.set("partner_id", partnerId)
    input.set("menu_draft", JSON.stringify(value))
    if (confirmed) input.set("confirm_review", "true")
    input.append("menu_source", new File(["%PDF-1.7 test"], "menu.pdf", { type: "application/pdf" }))
    return input
  }
  return { writes, calls, invalidations, actions, form }
}

test("AI preview requires menu ownership or admin rights before provider calls", async () => {
  for (const options of [{ signedIn: false }, { owner: false }, { missingMenu: true }]) {
    const f = fixture(options)
    assert.equal((await f.actions.previewAIMenuImport(f.form())).ok, false)
    assert.deepEqual(f.calls, [])
    assert.deepEqual(f.writes, [])
  }
  const f = fixture()
  assert.equal((await f.actions.previewAIMenuImport(f.form({ menuId: "foreign-menu" }))).ok, false)
  assert.deepEqual(f.calls, [])
})

test("AI preview for an owner or admin returns a draft without any database writes", async () => {
  for (const options of [{}, { owner: false, admin: true }]) {
    const f = fixture(options)
    const result = await f.actions.previewAIMenuImport(f.form())
    assert.equal(result.ok, true)
    assert.equal(result.draft.categories[0].items[0].price, 6.5)
    assert.equal(f.calls.length, 1)
    assert.deepEqual(f.writes, [])
  }
})

test("AI preview rejects an empty or non-file page instead of silently omitting it", async () => {
  for (const invalid of [new File([], "empty.png", { type: "image/png" }), "missing page"]) {
    const f = fixture()
    const form = f.form()
    form.append("menu_source", invalid)
    assert.equal((await f.actions.previewAIMenuImport(form)).ok, false)
    assert.deepEqual(f.calls, [])
    assert.deepEqual(f.writes, [])
  }
})

test("confirmation rechecks ownership and requires explicit review before any write", async () => {
  for (const options of [{ owner: false }, { missingMenu: true }]) {
    const f = fixture(options)
    assert.equal((await f.actions.confirmAIMenuImport(f.form())).ok, false)
    assert.deepEqual(f.writes, [])
  }
  for (const input of [{ confirmed: false }, { partnerId: "forged-partner" }, { value: { ...draft, categories: [{ name: "Test", items: [{ ...draft.categories[0].items[0], price: null }] }] } }]) {
    const f = fixture()
    assert.equal((await f.actions.confirmAIMenuImport(f.form(input))).ok, false)
    assert.deepEqual(f.writes, [])
  }
})

test("confirmed import appends reviewed values, preserves existing menu metadata and refreshes both views", async () => {
  const f = fixture()
  const result = await f.actions.confirmAIMenuImport(f.form())
  assert.equal(result.ok, true, result.message)
  assert.equal(result.importedItems, 1)
  assert.ok(f.writes.every(w => w.operation === "insert" && w.table !== "menus"))
  const item = f.writes.find(w => w.table === "menu_items").payload[0]
  assert.equal(item.price, 6.5)
  assert.equal(item.currency, "EUR")
  assert.equal(item.menu_id, "menu-owned")
  assert.equal(item.image_url, null)
  assert.ok(f.invalidations.includes("/"))
  assert.ok(f.invalidations.includes("/partner"))
  assert.deepEqual(f.calls, [], "saving must not call AI again")
})

test("a new menu is created only after confirmation and does not reuse a concurrently-created menu", async () => {
  const f = fixture()
  assert.equal((await f.actions.previewAIMenuImport(f.form({ menuId: "" }))).ok, true)
  assert.deepEqual(f.writes, [])
  const result = await f.actions.confirmAIMenuImport(f.form({ menuId: "" }))
  assert.equal(result.ok, true, result.message)
  assert.equal(f.writes[0].table, "menus")
  assert.equal(f.writes[0].payload.partner_id, "partner-owned")
  const changed = fixture({ alreadyExists: true })
  assert.equal((await changed.actions.confirmAIMenuImport(changed.form({ menuId: "" }))).ok, false)
  assert.deepEqual(changed.writes, [])
})

test("failed item persistence rolls back only imported content and the newly-created menu", async () => {
  for (const menuId of ["", "menu-owned"]) {
    const f = fixture({ failItems: true })
    assert.equal((await f.actions.confirmAIMenuImport(f.form({ menuId }))).ok, false)
    assert.equal(f.writes.filter(w => w.table === "menus" && w.operation === "delete").length, menuId ? 0 : 1)
    assert.ok(f.writes.some(w => w.table === "menu_categories" && w.operation === "delete"))
  }
})
