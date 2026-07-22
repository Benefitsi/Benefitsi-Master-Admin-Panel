import assert from "node:assert/strict"
import test from "node:test"
import menuImport from "../lib/menu-import.js"

const {
  copyMenuImages,
  assertPublicHttpUrl,
  readMenuImportFiles,
  runMenuImportBatch,
  prepareMissingAddonsRetry,
  createAddonUpdatePlan,
  applyMenuItemUpdatePlan,
} = menuImport

function jsonFile(name, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return {
    name,
    size: Buffer.byteLength(text),
    async text() { return text },
  }
}

function menuDocument(overrides = {}) {
  return {
    categories: [{
      name: "Main dishes",
      image_url: "",
      items: [{
        name: "Example item",
        price: 9.5,
        ...overrides,
      }],
    }],
  }
}

test("optional descriptions and scraper defaults are normalized without invented content", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("menu.json", menuDocument({
      addons: [{ title: "Extra cheese", cost: 1.5 }],
    })),
  ])

  assert.deepEqual(prepared.errors, [])
  const item = prepared.menus[0].categories[0].items[0]
  assert.equal(item.description, "")
  assert.equal(item.currency, "EUR")
  assert.equal(item.image_url, "")
  assert.deepEqual(item.tags, [])
  assert.deepEqual(item.allergens, [])
  assert.equal(item.is_popular, false)
  assert.equal(item.addons[0].description, "")
})

test("multiple menu files and an asset manifest are classified by JSON structure", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("first.json", menuDocument()),
    jsonFile("assets_manifest.json", {
      mappings: {
        "assets/dish.jpg": "https://partner.example/images/dish.jpg",
      },
    }),
    jsonFile("second-arbitrary-name.json", menuDocument({ name: "Second item", price: 0 })),
  ])

  assert.equal(prepared.menus.length, 2)
  assert.equal(
    prepared.assetMappings.get("assets/dish.jpg"),
    "https://partner.example/images/dish.jpg",
  )
  assert.deepEqual(prepared.errors, [])
})

test("an empty array from the scraper is accepted as an empty asset manifest", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("manifest.json", []),
    jsonFile("menu.json", menuDocument()),
  ])

  assert.equal(prepared.menus.length, 1)
  assert.equal(prepared.assetMappings.size, 0)
  assert.deepEqual(prepared.errors, [])
})

test("malformed JSON is reported with its filename and does not hide valid files", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("broken.json", "{not json"),
    jsonFile("valid.json", menuDocument()),
  ])

  assert.equal(prepared.menus.length, 1)
  assert.match(prepared.errors[0], /^broken\.json: malformed JSON\.$/)
})

test("empty image URLs are not copied or replaced with invented values", async () => {
  const prepared = await readMenuImportFiles([jsonFile("menu.json", menuDocument())])
  let copyCalls = 0
  const copied = await copyMenuImages(
    prepared.menus[0],
    prepared.assetMappings,
    async () => {
      copyCalls += 1
      return "https://storage.example/unexpected.jpg"
    },
  )

  assert.equal(copyCalls, 0)
  assert.equal(copied.menu.categories[0].image_url, "")
  assert.equal(copied.menu.categories[0].items[0].image_url, "")
  assert.deepEqual(copied.warnings, [])
})

test("image upload failures keep the menu importable and return a field-level warning", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("menu.json", menuDocument({ image_url: "assets/dish.jpg" })),
    jsonFile("anything.json", {
      images: [{ local_path: "assets/dish.jpg", source_url: "https://partner.example/dish.jpg" }],
    }),
  ])
  const copied = await copyMenuImages(
    prepared.menus[0],
    prepared.assetMappings,
    async () => { throw new Error("storage upload failed") },
  )

  assert.equal(copied.menu.categories[0].items[0].image_url, "")
  assert.match(copied.warnings[0], /menu\.json: category "Main dishes" > item "Example item" > field "image_url"/)
  assert.match(copied.warnings[0], /storage upload failed; imported without image/)
})

test("menu image copies run concurrently without changing item assignments", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("menu.json", {
      categories: [{
        name: "Pizza",
        image_url: "https://partner.example/category.png",
        items: Array.from({ length: 6 }, (_, index) => ({
          name: `Pizza ${index + 1}`,
          price: index + 1,
          image_url: `https://partner.example/item-${index + 1}.png`,
        })),
      }],
    }),
  ])
  let active = 0
  let maxActive = 0
  const copied = await copyMenuImages(
    prepared.menus[0],
    prepared.assetMappings,
    async (url) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return `https://storage.example/${url.split("/").at(-1)}`
    },
    { concurrency: 3 },
  )

  assert.equal(maxActive, 3)
  assert.equal(copied.menu.categories[0].image_url, "https://storage.example/category.png")
  assert.equal(copied.menu.categories[0].items[5].image_url, "https://storage.example/item-6.png")
})

test("validation and save failures in one file do not prevent other valid files importing", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("invalid.json", menuDocument({ price: -1 })),
    jsonFile("database-failure.json", menuDocument({ name: "Database failure" })),
    jsonFile("successful.json", menuDocument({ name: "Successful item" })),
  ])
  const saveCalls = []
  const result = await runMenuImportBatch(prepared, {
    mode: "replace",
    async copyImage() { return "" },
    async saveMenu(menu, mode) {
      saveCalls.push([menu.filename, mode])
      if (menu.filename === "database-failure.json") throw new Error("insert rejected")
      return { importedCategories: 1, importedItems: 1 }
    },
  })

  assert.deepEqual(saveCalls, [
    ["database-failure.json", "replace"],
    ["successful.json", "replace"],
  ])
  assert.equal(result.successes.length, 1)
  assert.equal(result.successes[0].filename, "successful.json")
  assert.match(result.errors.join("\n"), /invalid\.json: category "Main dishes" > item "Example item" > field "price"/)
  assert.match(result.errors.join("\n"), /database-failure\.json: import failed: insert rejected/)
})

test("empty categories and nameless or priceless items are rejected before saving", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("empty-category.json", { categories: [{ name: "Empty", items: [] }] }),
    jsonFile("empty-item.json", { categories: [{ name: "Main", items: [{}] }] }),
  ])

  assert.equal(prepared.menus.length, 0)
  assert.match(prepared.errors.join("\n"), /empty categories are not imported/)
  assert.match(prepared.errors.join("\n"), /field "name": is required/)
  assert.match(prepared.errors.join("\n"), /field "price": is required/)
})

test("remote image downloads reject localhost and private IP targets", async () => {
  await assert.rejects(
    () => assertPublicHttpUrl("http://127.0.0.1/menu.jpg"),
    /private IP address/,
  )
  await assert.rejects(
    () => assertPublicHttpUrl("https://images.example/menu.jpg", async () => [
      { address: "10.0.0.8", family: 4 },
    ]),
    /private or unavailable address/,
  )
})

test("missing addons schema retries all items and reports skipped add-ons", () => {
  const retry = prepareMissingAddonsRetry(
    [{ name: "Pizza", addons: [], price: 9.5 }],
    "Could not find the 'addons' column of 'menu_items' in the schema cache",
  )
  assert.deepEqual(retry, {
    skippedAddons: 0,
    rows: [{ name: "Pizza", price: 9.5 }],
  })

  const withAddons = prepareMissingAddonsRetry(
    [{ name: "Pizza", addons: [{ title: "Cheese", cost: 1 }] }],
    "Could not find the 'addons' column of 'menu_items' in the schema cache",
  )
  assert.deepEqual(withAddons, {
    skippedAddons: 1,
    rows: [{ name: "Pizza" }],
  })
})

test("schema compatibility warnings are preserved without failing a valid menu", async () => {
  const prepared = await readMenuImportFiles([jsonFile("pizza.json", menuDocument())])
  const result = await runMenuImportBatch(prepared, {
    mode: "append",
    async copyImage() { return "" },
    async saveMenu() {
      return {
        importedCategories: 1,
        importedItems: 1,
        warnings: ["1 add-on was skipped because the database column is unavailable."],
      }
    },
  })

  assert.equal(result.successes.length, 1)
  assert.match(result.warnings[0], /add-on was skipped/)
})

test("existing item updates use normalized category and item names and preserve stored name casing", async () => {
  const prepared = await readMenuImportFiles([
    jsonFile("pizza-addons.json", menuDocument({
      name: "  MARＧHERITA  ",
      addons: [{ title: "33cm", cost: 2.5 }],
    })),
  ])
  const plan = createAddonUpdatePlan(
    prepared.menus,
    [{ id: "category-1", name: "Main   dishes", image_url: "manual-category.jpg" }],
    [{
      id: "item-1",
      category_id: "category-1",
      name: "Margherita",
      description: null,
      image_url: "manual-item.jpg",
      price: 99,
      currency: "EUR",
      tags: [],
      allergens: [],
      addons: [],
      is_popular: false,
    }],
  )

  assert.deepEqual(plan.warnings, [])
  assert.deepEqual(plan.updates, [{
    itemId: "item-1",
    values: {
      description: null,
      price: 9.5,
      currency: "EUR",
      image_url: null,
      tags: [],
      allergens: [],
      is_popular: false,
      addons: [{ title: "33cm", description: "", cost: 2.5 }],
    },
    changedFields: ["price", "image_url", "addons"],
    addonChanges: { created: 1, updated: 0, removed: 0 },
    filename: "pizza-addons.json",
    category: "Main dishes",
    item: "MARＧHERITA",
  }])
  assert.equal("name" in plan.updates[0].values, false)
})

test("an unchanged existing pizza saves all five newly imported add-ons", async () => {
  const addons = Array.from({ length: 5 }, (_, index) => ({
    title: `Add-on ${index + 1}`,
    description: index % 2 ? `Choice ${index + 1}` : undefined,
    cost: index === 0 ? 0 : index,
  }))
  const prepared = await readMenuImportFiles([
    jsonFile("dilara-addons.json", menuDocument({
      name: "Dilara Pizza",
      description: "Tomato and cheese",
      price: 12,
      addons,
    })),
  ])
  const plan = createAddonUpdatePlan(
    prepared.menus,
    [{ id: "category-1", name: "Main dishes" }],
    [{
      id: "item-1",
      category_id: "category-1",
      name: "Dilara Pizza",
      description: "Tomato and cheese",
      price: 12,
      currency: "EUR",
      image_url: null,
      tags: [],
      allergens: [],
      is_popular: false,
      addons: [],
    }],
  )
  const saved = []
  const supabase = {
    from(table) {
      assert.equal(table, "menu_items")
      return {
        update(values) {
          return {
            async eq(column, itemId) {
              saved.push({ values, column, itemId })
              return { error: null }
            },
          }
        },
      }
    },
  }

  const result = await applyMenuItemUpdatePlan(supabase, plan)

  assert.equal(result.successfulUpdates.length, 1)
  assert.deepEqual(result.addonChanges, { created: 5, updated: 0, removed: 0 })
  assert.equal(saved.length, 1)
  assert.equal(saved[0].values.addons.length, 5)
  assert.equal(saved[0].values.addons[0].cost, 0)
  assert.equal(saved[0].values.addons[0].description, "")
  assert.equal(saved[0].column, "id")
  assert.equal(saved[0].itemId, "item-1")
})
