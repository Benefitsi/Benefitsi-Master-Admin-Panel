import type { PartnerWithDeals } from "./admin-data"
import type { MicrositeConfig } from "./microsites"

export type MicrositeReadinessItem = {
  id: string
  label: string
  detail: string
  ok: boolean
  severity: "required" | "recommended" | "optional"
  area:
    | "Daten"
    | "Assets"
    | "SEO & LLM"
    | "Mobile"
    | "Publish"
    | "Partner-Self-Service"
    | "Production"
}

export type MicrositeReadinessReport = {
  score: number
  requiredDone: number
  requiredTotal: number
  recommendedDone: number
  recommendedTotal: number
  status: "live-ready" | "needs-work" | "blocked"
  items: MicrositeReadinessItem[]
}

export function createMicrositeReadinessReport(
  partner: PartnerWithDeals,
  config: MicrositeConfig,
): MicrositeReadinessReport {
  const menuItems = partner.menus.flatMap((menu) =>
    menu.categories.length
      ? menu.categories.flatMap((category) => category.items)
      : menu.items,
  )
  const menuItemsWithPrice = menuItems.filter((item) => item.price !== null && item.price !== "")
  const menuItemsWithImage = menuItems.filter((item) => item.image_url)
  const micrositeImages = [
    config.hero.backgroundImageUrl,
    config.deals.illustrationUrl,
    config.deals.topDealImageUrl,
    config.elementText["content.aboutHeroImageUrl"],
    config.elementText["content.aboutIngredientImageUrl"],
    config.elementText["content.aboutLocationImageUrl"],
    config.elementText["content.aboutPrepImageUrl"],
  ].filter(Boolean)
  const hasPublicIdentifier = Boolean(
    partner.microsite?.canonical_url ||
      partner.microsite?.slug ||
      partner.slug ||
      partner.subdomain,
  )
  const hasAbsoluteCanonical = Boolean(
    partner.microsite?.canonical_url?.startsWith("https://"),
  )
  const hasPublicSiteUrl = Boolean(process.env.NEXT_PUBLIC_SITE_URL)
  const hasSeoTitle = config.seo.title.trim().length >= 12
  const hasSeoDescription = config.seo.description.trim().length >= 50
  const hasSeoKeywords = config.seo.keywords.length >= 2
  const mobileQaDone = Boolean(config.builder.mobileQaDone)
  const desktopQaDone = Boolean(config.builder.desktopQaDone)
  const assetReviewDone = Boolean(config.builder.assetReviewDone)
  const seoReviewDone = Boolean(config.builder.seoReviewDone)
  const publishReviewDone = Boolean(config.builder.publishReviewDone)
  const requiresMenu = config.template.startsWith("restaurant")
  const offerOverviewReady = requiresMenu
    ? menuItems.length > 0 && menuItemsWithPrice.length >= Math.ceil(menuItems.length / 2)
    : menuItems.length > 0 || config.hero.services.length >= 2
  const hasActiveDeal = partner.deals.some((deal) => deal.active !== false)

  const items: MicrositeReadinessItem[] = [
    recommended("partner-logo", "Partnerlogo", "Logo ist im Partnerprofil gepflegt und wird zentral ausgespielt.", Boolean(partner.logo_url), "Daten"),
    required("partner-name", "Partnername", "Name kommt aus dem Partnerprofil.", Boolean(partner.name), "Daten"),
    recommended("partner-address", "Adresse", "Adresse/Standort ist für Kontakt, Maps und LocalBusiness-Schema vorhanden.", Boolean(partner.address), "Daten"),
    recommended("partner-phone", "Telefon", "Telefonnummer ist für mobile Aktionen und Local SEO vorhanden.", Boolean(partner.phone), "Daten"),
    recommended("opening-hours", "Öffnungszeiten", "Öffnungszeiten sind gepflegt und werden in Hero/Kontakt/Schema verwendet.", partner.opening_hours.length > 0, "Daten"),
    recommended(
      "menu-prices",
      requiresMenu ? "Speisekarte mit Preisen" : "Leistungsübersicht vorhanden",
      requiresMenu
        ? "Gerichte und Preise kommen aus den Partnerdaten."
        : "Services, Treatments oder Highlights sind für diesen Partnertyp sichtbar gepflegt.",
      offerOverviewReady,
      "Daten",
    ),
    recommended("coordinates", "Google-Maps-Koordinaten", "Koordinaten verbessern Maps, Route und strukturierte Daten.", Boolean(partner.coordinates), "SEO & LLM"),
    recommended("microsite-hero", "Hero-Bild", "Hero nutzt ein microsite-spezifisches Kampagnenbild.", Boolean(config.hero.backgroundImageUrl), "Assets"),
    recommended("microsite-deals-image", "Deals-Bild", "Deals & Vorteile haben ein eigenes Bild.", Boolean(config.deals.illustrationUrl), "Assets"),
    recommended("top-deal-image", "Vorteilsbild", "Der aktuelle Vorteil hat ein eigenes, emotionales Bild.", !hasActiveDeal || Boolean(config.deals.topDealImageUrl), "Assets"),
    recommended("asset-review", "Assets geprüft", "Microsite-Bilder/Fallbacks wurden für diesen Partner bewusst geprüft.", assetReviewDone, "Assets"),
    recommended("about-images", "Über-uns-Bilder", "Über-uns-Bereich hat mindestens zwei austauschbare Bilder.", micrositeImages.length >= 2, "Assets"),
    recommended("menu-images", "Menübilder", "Mindestens einige Speisen haben Bilder; ohne Bild werden Platzhalter genutzt.", menuItems.length === 0 || menuItemsWithImage.length >= 1, "Assets"),
    recommended("seo-review", "SEO/LLM geprüft", "Title, Description, Schema und Indexierung wurden bewusst geprüft.", seoReviewDone, "SEO & LLM"),
    recommended("seo-title", "SEO-Titel", "Partner-spezifischer Titel ist aussagekräftig gepflegt.", hasSeoTitle, "SEO & LLM"),
    recommended("seo-description", "SEO-Beschreibung", "Meta-Beschreibung nennt Partner, Ort, Deals und Speisekarte ausreichend.", hasSeoDescription, "SEO & LLM"),
    recommended("seo-keywords", "SEO/LLM-Suchbegriffe", "Mindestens zwei relevante Begriffe helfen interner Suche und KI-Systemen.", hasSeoKeywords, "SEO & LLM"),
    recommended("public-indexing", "Indexierung aktiv", "Öffentliche Live-Seiten dürfen nicht versehentlich auf noindex stehen.", !config.seo.noIndex, "SEO & LLM"),
    recommended("structured-data", "Strukturierte Daten", "Restaurant, Menu, FAQ und Breadcrumb JSON-LD sind systemisch aktiv.", true, "SEO & LLM"),
    recommended("preview-noindex", "Vorschau noindex", "Builder-/Preview-Seiten sind von Indexierung ausgeschlossen.", true, "SEO & LLM"),
    recommended("faq", "FAQ vorhanden", "FAQ ist sichtbar und als FAQPage für Suchsysteme strukturiert.", true, "SEO & LLM"),
    recommended("desktop-qa-done", "Desktopprüfung abgeschlossen", "Desktop-Navigation, Hero, Deals, Speisekarte, Kontakt und Footer wurden geprüft.", desktopQaDone, "Mobile"),
    recommended("mobile-qa-done", "Mobilprüfung abgeschlossen", "Mobile Ansicht wurde im Builder geprüft und freigegeben.", mobileQaDone, "Mobile"),
    recommended("responsive", "Responsives Layout", "Desktop- und Mobilvorschau sind im Builder verfügbar und müssen separat freigegeben werden.", true, "Mobile"),
    recommended("mobile-actions", "Mobile Kontaktaktionen", "Route/Anrufen/Karte sind mobil vorgesehen.", Boolean(partner.phone || partner.address), "Mobile"),
    recommended("publish-review", "Finale Veröffentlichung geprüft", "Vor Publish wurde bewusst geprüft: Daten, Assets, Mobile, SEO/LLM und Live-Link.", publishReviewDone, "Publish"),
    recommended("draft-versioning", "Versionierter Entwurf", "Entwurf und Veröffentlichung laufen über Microsite-Versionen.", true, "Publish"),
    recommended("published", "Veröffentlicht", "Eine veröffentlichte Version existiert.", Boolean(partner.microsite?.publishedVersion), "Publish"),
    recommended("self-service-safe", "Partner-Self-Service sicher", "Partner sollten Daten/Bilder ändern können, aber nicht das Layout zerstören.", true, "Partner-Self-Service"),
    recommended("sitemap-robots", "Sitemap & Robots", "robots.txt und sitemap.xml werden aus den Microsites erzeugt.", true, "Production"),
    recommended("public-url", "Öffentliche URL", "Slug/Subdomain oder Canonical URL ist für die Microsite vorhanden.", hasPublicIdentifier, "Production"),
    recommended("canonical-url", "Canonical URL", "Eine absolute HTTPS-Canonical verhindert Duplikate und hilft Such-/KI-Systemen.", hasAbsoluteCanonical, "Production"),
    recommended("site-url-env", "Produktive Basis-URL", "NEXT_PUBLIC_SITE_URL ist gesetzt, damit Sitemap und Canonicals stabil erzeugt werden.", hasPublicSiteUrl, "Production"),
  ]

  const requiredItems = items.filter((item) => item.severity === "required")
  const recommendedItems = items.filter((item) => item.severity === "recommended")
  const requiredDone = requiredItems.filter((item) => item.ok).length
  const recommendedDone = recommendedItems.filter((item) => item.ok).length
  const totalWeight = requiredItems.length * 2 + recommendedItems.length
  const doneWeight = requiredDone * 2 + recommendedDone
  const score = Math.round((doneWeight / Math.max(1, totalWeight)) * 100)

  return {
    score,
    requiredDone,
    requiredTotal: requiredItems.length,
    recommendedDone,
    recommendedTotal: recommendedItems.length,
    status:
      requiredDone < requiredItems.length
        ? "blocked"
        : score >= 70
          ? "live-ready"
          : "needs-work",
    items,
  }
}

export const micrositeReadinessEnglishTranslations: Readonly<Record<string, string>> = {
  Partnerlogo: "Partner logo",
  Partnername: "Partner name",
  Adresse: "Address",
  Telefon: "Phone",
  Öffnungszeiten: "Opening hours",
  "Speisekarte mit Preisen": "Menu with prices",
  "Leistungsübersicht vorhanden": "Service overview available",
  "Google-Maps-Koordinaten": "Google Maps coordinates",
  "Hero-Bild": "Hero image",
  "Deals-Bild": "Deals image",
  Vorteilsbild: "Benefit image",
  "Assets geprüft": "Assets reviewed",
  "Über-uns-Bilder": "About-us images",
  Menübilder: "Menu images",
  "SEO/LLM geprüft": "SEO/LLM reviewed",
  "SEO-Titel": "SEO title",
  "SEO-Beschreibung": "SEO description",
  "SEO/LLM-Suchbegriffe": "SEO/LLM keywords",
  "Indexierung aktiv": "Indexing enabled",
  "Strukturierte Daten": "Structured data",
  "Vorschau noindex": "Preview noindex",
  "FAQ vorhanden": "FAQ available",
  "Desktopprüfung abgeschlossen": "Desktop QA complete",
  "Mobilprüfung abgeschlossen": "Mobile QA complete",
  "Responsives Layout": "Responsive layout",
  "Mobile Kontaktaktionen": "Mobile contact actions",
  "Finale Veröffentlichung geprüft": "Final publishing review complete",
  "Versionierter Entwurf": "Versioned draft",
  Veröffentlicht: "Published",
  "Partner-Self-Service sicher": "Partner self-service protected",
  "Sitemap & Robots": "Sitemap & robots",
  "Öffentliche URL": "Public URL",
  "Canonical URL": "Canonical URL",
  "Produktive Basis-URL": "Production base URL",
  "Logo ist im Partnerprofil gepflegt und wird zentral ausgespielt.":
    "The logo is maintained in the partner profile and used consistently.",
  "Name kommt aus dem Partnerprofil.": "The name comes from the partner profile.",
  "Adresse/Standort ist für Kontakt, Maps und LocalBusiness-Schema vorhanden.":
    "The address is available for contact details, maps, and LocalBusiness schema.",
  "Telefonnummer ist für mobile Aktionen und Local SEO vorhanden.":
    "A phone number is available for mobile actions and local SEO.",
  "Öffnungszeiten sind gepflegt und werden in Hero/Kontakt/Schema verwendet.":
    "Opening hours are maintained and used in the hero, contact area, and schema.",
  "Gerichte und Preise kommen aus den Partnerdaten.":
    "Dishes and prices come from the partner data.",
  "Services, Treatments oder Highlights sind für diesen Partnertyp sichtbar gepflegt.":
    "Services, treatments, or highlights are configured for this partner type.",
  "Koordinaten verbessern Maps, Route und strukturierte Daten.":
    "Coordinates improve maps, directions, and structured data.",
  "Hero nutzt ein microsite-spezifisches Kampagnenbild.":
    "The hero uses a microsite-specific campaign image.",
  "Deals & Vorteile haben ein eigenes Bild.":
    "Deals and benefits have a dedicated image.",
  "Der aktuelle Vorteil hat ein eigenes, emotionales Bild.":
    "The current benefit has a dedicated promotional image.",
  "Microsite-Bilder/Fallbacks wurden für diesen Partner bewusst geprüft.":
    "Microsite images and fallbacks have been reviewed for this partner.",
  "Über-uns-Bereich hat mindestens zwei austauschbare Bilder.":
    "The about section has at least two replaceable images.",
  "Mindestens einige Speisen haben Bilder; ohne Bild werden Platzhalter genutzt.":
    "At least some dishes have images; placeholders are used when images are missing.",
  "Title, Description, Schema und Indexierung wurden bewusst geprüft.":
    "Title, description, schema, and indexing have been reviewed.",
  "Partner-spezifischer Titel ist aussagekräftig gepflegt.":
    "A meaningful partner-specific title is set.",
  "Meta-Beschreibung nennt Partner, Ort, Deals und Speisekarte ausreichend.":
    "The meta description adequately covers the partner, location, deals, and menu.",
  "Mindestens zwei relevante Begriffe helfen interner Suche und KI-Systemen.":
    "Relevant keywords help internal search and AI systems.",
  "Öffentliche Live-Seiten dürfen nicht versehentlich auf noindex stehen.":
    "Public live pages must not accidentally be set to noindex.",
  "Restaurant, Menu, FAQ und Breadcrumb JSON-LD sind systemisch aktiv.":
    "Restaurant, menu, FAQ, and breadcrumb JSON-LD are enabled.",
  "Builder-/Preview-Seiten sind von Indexierung ausgeschlossen.":
    "Builder and preview pages are excluded from indexing.",
  "FAQ ist sichtbar und als FAQPage für Suchsysteme strukturiert.":
    "The FAQ is visible and structured as an FAQPage for search systems.",
  "Desktop-Navigation, Hero, Deals, Speisekarte, Kontakt und Footer wurden geprüft.":
    "Desktop navigation, hero, deals, menu, contact area, and footer have been reviewed.",
  "Mobile Ansicht wurde im Builder geprüft und freigegeben.":
    "The mobile view has been reviewed and approved in the builder.",
  "Desktop- und Mobilvorschau sind im Builder verfügbar und müssen separat freigegeben werden.":
    "Desktop and mobile previews are available in the builder and can be approved separately.",
  "Route/Anrufen/Karte sind mobil vorgesehen.":
    "Directions, calling, and maps are available on mobile.",
  "Vor Publish wurde bewusst geprüft: Daten, Assets, Mobile, SEO/LLM und Live-Link.":
    "Before publishing, data, assets, mobile, SEO/LLM, and the live link were reviewed.",
  "Entwurf und Veröffentlichung laufen über Microsite-Versionen.":
    "Drafting and publishing use versioned microsite records.",
  "Eine veröffentlichte Version existiert.": "A published version exists.",
  "Partner sollten Daten/Bilder ändern können, aber nicht das Layout zerstören.":
    "Partners can update data and images without changing the protected layout.",
  "robots.txt und sitemap.xml werden aus den Microsites erzeugt.":
    "robots.txt and sitemap.xml are generated from the microsites.",
  "Slug/Subdomain oder Canonical URL ist für die Microsite vorhanden.":
    "A slug, subdomain, or canonical URL exists for the microsite.",
  "Eine absolute HTTPS-Canonical verhindert Duplikate und hilft Such-/KI-Systemen.":
    "An absolute HTTPS canonical URL prevents duplicates and supports search and AI systems.",
  "NEXT_PUBLIC_SITE_URL ist gesetzt, damit Sitemap und Canonicals stabil erzeugt werden.":
    "NEXT_PUBLIC_SITE_URL is set so sitemaps and canonical URLs can be generated reliably.",
}

function required(
  id: string,
  label: string,
  detail: string,
  ok: boolean,
  area: MicrositeReadinessItem["area"],
): MicrositeReadinessItem {
  return { id, label, detail, ok, severity: "required", area }
}

function recommended(
  id: string,
  label: string,
  detail: string,
  ok: boolean,
  area: MicrositeReadinessItem["area"],
): MicrositeReadinessItem {
  return { id, label, detail, ok, severity: "recommended", area }
}
