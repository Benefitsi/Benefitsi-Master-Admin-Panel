export type PartnerMediaChoice = { url: string; label: string }
type MediaItem = { name?: string | null; image_url?: string | null }
type MediaPartner = {
  logo_url?: string | null; feature_card_url?: string | null; discover_card_image_url?: string | null; cover_urls?: string[] | null;
  menus?: Array<{ categories?: Array<MediaItem & { items?: MediaItem[] }>; items?: MediaItem[] }>;
  deals?: Array<{ metadata?: unknown }>;
}
export function partnerMediaLibrary(partner: MediaPartner): PartnerMediaChoice[] {
  const choices = new Map<string, PartnerMediaChoice>()
  const add = (url: unknown, label: string) => { if (typeof url === "string" && url.trim() && !choices.has(url)) choices.set(url, { url, label }) }
  add(partner.feature_card_url, "Profilbild"); add(partner.discover_card_image_url, "Entdecken-Bild")
  partner.cover_urls?.forEach((url, index) => add(url, `Partnerbild ${index + 1}`))
  add(partner.logo_url, "Partnerlogo")
  for (const menu of partner.menus || []) {
    for (const category of menu.categories || []) {
      add(category.image_url, category.name || "Menükategorie")
      category.items?.forEach(item => add(item.image_url, item.name || "Menüartikel"))
    }
    menu.items?.forEach(item => add(item.image_url, item.name || "Menüartikel"))
  }
  for (const deal of partner.deals || []) if (deal.metadata && typeof deal.metadata === "object") add((deal.metadata as Record<string, unknown>).card_image_url, "Vorteilsbild")
  return [...choices.values()]
}
