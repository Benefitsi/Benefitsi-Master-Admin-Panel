import { notFound } from "next/navigation"
import { MicrositeRenderer } from "@/components/microsite/microsite-renderer"
import { AdminLanguageProvider } from "@/app/admin-language"
import { MicrositePanel } from "@/app/microsite-panel"
import { createDefaultMicrositeConfig } from "@/lib/microsites"
import { categoryMicrositeThemes, categoryTemplateIds, type CategoryMicrositeTemplateId } from "@/lib/microsite-category-themes"
import type { PartnerWithDeals } from "@/lib/admin-data"
export default async function Check({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  if (process.env.NODE_ENV !== "development") notFound()
  const params = await searchParams
  const template = (Object.hasOwn(categoryMicrositeThemes, params.template || "") ? params.template : "salon-studio") as CategoryMicrositeTemplateId
  const category = params.category || Object.entries(categoryTemplateIds).find(([,id]) => id === template)?.[0] || ""
  const partner = { id: "template-check", name: params.name || ({ "salon-studio": "Studio Forma", "wellness-retreat": "Auszeit Spa", "hotel-stay": "Hotel Lindenhof", "fitness-club": "Kraftwerk", "cinema-showcase": "Lichtspielhaus", "adventure-play": "Mission Landau", "car-care": "Glanzwerk" }[template as string] || "Local Partner"), short_name: null, type: "", category: [category], city_name: "Landau", address: "Marktstrasse 12, 76829 Landau", phone: "+49 6341 123456", website: "https://example.com", description: null, cover_urls: params.noImage ? [] : ["https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=85"], deals: [], reward_milestones: [], menus: params.items ? [{ categories: [], items: Array.from({length:8}, (_,i) => ({ id: `item-${i}`, name: `${category} ${i+1}`, price: i===0 ? 0 : 20+i, currency:"EUR", description: "Details and availability directly from the team." })) }] : [], holidays: [], socials: [], opening_hours: [{ weekday:1, opens_at:"09:00", closes_at:"18:00" }, { weekday:0, is_closed:true }], staff: [], stamp_progress: [], visits: [], fraud_events: [], microsite: null } as unknown as PartnerWithDeals
  const config = createDefaultMicrositeConfig(partner, params.food ? "restaurant-premium" : template, params.lang === "en" ? "en" : "de")
  if (params.dark) config.appearance.mode = "dark"
  if (params.builder) return <AdminLanguageProvider><MicrositePanel partner={{...partner, microsite: { draftVersion: { config } } } as PartnerWithDeals} fullscreen /></AdminLanguageProvider>
  return <div style={{maxWidth:1440,margin:"0 auto",width:"100%"}}><MicrositeRenderer partner={partner} config={config} showAppDownloadPopup={false}/></div>
}
