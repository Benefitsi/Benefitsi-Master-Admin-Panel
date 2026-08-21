import type { MenuItem } from "./admin-data"

type MenuItemIdentity = Pick<
  MenuItem,
  "id" | "menu_id" | "category_id" | "name" | "sort_order"
>

type MenuPreviewItem = MenuItemIdentity & Pick<MenuItem, "is_popular">

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

export function micrositeMenuItemDisplayName(name?: string | null) {
  return (name || "")
    .replace(/^\s*\d{1,5}\s*[.)]\s*/, "")
    .trim()
}

export function micrositeMenuPreviewItems<T extends MenuPreviewItem>(
  items: T[],
  featuredItemKey?: string,
  limit = 6,
) {
  const sortedItems = [...items].sort(
    (first, second) =>
      Number(Boolean(second.is_popular)) - Number(Boolean(first.is_popular)),
  )
  const featuredIndex = featuredItemKey
    ? sortedItems.findIndex(
        (item) => micrositeMenuItemKey(item) === featuredItemKey,
      )
    : -1

  if (featuredIndex <= 0) return sortedItems.slice(0, limit)

  const [featuredItem] = sortedItems.splice(featuredIndex, 1)
  return featuredItem
    ? [featuredItem, ...sortedItems].slice(0, limit)
    : sortedItems.slice(0, limit)
}
