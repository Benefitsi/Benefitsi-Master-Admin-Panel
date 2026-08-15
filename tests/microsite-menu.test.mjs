import assert from "node:assert/strict"
import test from "node:test"
import {
  micrositeMenuItemImageId,
  micrositeMenuItemKey,
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
