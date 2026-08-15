import type { MenuItem } from "./admin-data"

type MenuItemIdentity = Pick<
  MenuItem,
  "id" | "menu_id" | "category_id" | "name" | "sort_order"
>

export function micrositeMenuItemKey(item: MenuItemIdentity) {
  const source =
    item.id ||
    [
      item.menu_id || "menu",
      item.category_id || "category",
      item.sort_order ?? 0,
      item.name || "item",
    ].join("-")

  return source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item"
}

export function micrositeMenuItemImageId(item: MenuItemIdentity) {
  return `content.menuItem.${micrositeMenuItemKey(item)}.imageUrl`
}

export function micrositeMenuItemVisibilityId(item: MenuItemIdentity) {
  return `content.menuItem.${micrositeMenuItemKey(item)}.showImage`
}
