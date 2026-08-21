import assert from "node:assert/strict"
import test from "node:test"
import {
  micrositeMenuItemDisplayName,
  micrositeMenuItemImageId,
  micrositeMenuItemKey,
  micrositeMenuPreviewItems,
  micrositeMenuItemVisibilityId,
} from "../lib/microsite-menu.ts"

test("menu image overrides use stable database ids when available", () => {
  const item = {
    id: "BEE7-Item_42",
    menu_id: "menu-1",
    category_id: "category-1",
    name: "Döner Spezial",
    sort_order: 3,
  }

  assert.equal(micrositeMenuItemKey(item), "bee7-item_42")
  assert.equal(
    micrositeMenuItemImageId(item),
    "content.menuItem.bee7-item_42.imageUrl",
  )
  assert.equal(
    micrositeMenuItemVisibilityId(item),
    "content.menuItem.bee7-item_42.showImage",
  )
})

test("menu image overrides have a deterministic fallback for unsaved items", () => {
  const item = {
    menu_id: "menu-1",
    category_id: "category-1",
    name: "Döner Spezial",
    sort_order: 3,
  }

  assert.equal(
    micrositeMenuItemKey(item),
    "menu-1-category-1-3-doner-spezial",
  )
})

test("microsite menu names omit partner item numbers", () => {
  assert.equal(micrositeMenuItemDisplayName("112. Joghurtsoße"), "Joghurtsoße")
  assert.equal(micrositeMenuItemDisplayName("  7) Ayran"), "Ayran")
  assert.equal(micrositeMenuItemDisplayName("Hausgemachte Pizza"), "Hausgemachte Pizza")
})

test("the configured menu item becomes the featured card", () => {
  const items = [
    { id: "one", name: "One", is_popular: true },
    { id: "two", name: "Two", is_popular: false },
    { id: "three", name: "Three", is_popular: true },
  ]

  assert.deepEqual(
    micrositeMenuPreviewItems(items, "two").map((item) => item.id),
    ["two", "one", "three"],
  )
})

test("the microsite menu preview includes six cards by default", () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: `item-${index + 1}`,
    name: `Item ${index + 1}`,
    is_popular: false,
  }))

  assert.deepEqual(
    micrositeMenuPreviewItems(items).map((item) => item.id),
    ["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"],
  )
})
