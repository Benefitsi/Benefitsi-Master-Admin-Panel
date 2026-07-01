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
  const hasSeoTitle = config.seo.title.trim().length >= 20
  const hasSeoDescription = config.seo.description.trim().length >= 80
  const hasSeoKeywords = config.seo.keywords.length >= 4
  const mobileQaDone = Boolean(config.builder.mobileQaDone)
  const desktopQaDone = Boolean(config.builder.desktopQaDone)
  const assetReviewDone = Boolean(config.builder.assetReviewDone)
  const partnerDataReviewDone = Boolean(config.builder.partnerDataReviewDone)
  const seoReviewDone = Boolean(config.builder.seoReviewDone)
  const publishReviewDone = Boolean(config.builder.publishReviewDone)

  const items: MicrositeReadinessItem[] = [
    required("partner-review", "Partnerdaten geprüft", "Name, Logo, Adresse, Telefon und Öffnungszeiten wurden bewusst geprüft.", partnerDataReviewDone, "Daten"),
    required("partner-logo", "Partnerlogo", "Logo ist im Partnerprofil gepflegt und wird zentral ausgespielt.", Boolean(partner.logo_url), "Daten"),
    required("partner-name", "Partnername", "Name kommt aus dem Partnerprofil.", Boolean(partner.name), "Daten"),
    required("partner-address", "Adresse", "Adresse/Standort ist für Kontakt, Maps und LocalBusiness-Schema vorhanden.", Boolean(partner.address), "Daten"),
    required("partner-phone", "Telefon", "Telefonnummer ist für mobile Aktionen und Local SEO vorhanden.", Boolean(partner.phone), "Daten"),
    required("opening-hours", "Öffnungszeiten", "Öffnungszeiten sind gepflegt und werden in Hero/Kontakt/Schema verwendet.", partner.opening_hours.length > 0, "Daten"),
    required("menu-prices", "Speisekarte mit Preisen", "Gerichte und Preise kommen aus den Partnerdaten.", menuItems.length > 0 && menuItemsWithPrice.length === menuItems.length, "Daten"),
    recommended("coordinates", "Google-Maps-Koordinaten", "Koordinaten verbessern Maps, Route und strukturierte Daten.", Boolean(partner.coordinates), "SEO & LLM"),
    recommended("microsite-hero", "Hero-Bild", "Hero nutzt ein microsite-spezifisches Kampagnenbild.", Boolean(config.hero.backgroundImageUrl), "Assets"),
    recommended("microsite-deals-image", "Deals-Bild", "Deals & Vorteile haben ein eigenes Bild.", Boolean(config.deals.illustrationUrl), "Assets"),
    recommended("top-deal-image", "Top-Deal-Bild", "Top-Deal hat ein eigenes, emotionales Bild.", Boolean(config.deals.topDealImageUrl), "Assets"),
    required("asset-review", "Assets geprüft", "Microsite-Bilder/Fallbacks wurden für diesen Partner bewusst geprüft.", assetReviewDone, "Assets"),
    recommended("about-images", "Über-uns-Bilder", "Über-uns-Bereich hat mindestens zwei austauschbare Bilder.", micrositeImages.length >= 4, "Assets"),
    recommended("menu-images", "Menübilder", "Mindestens einige Speisen haben Bilder; ohne Bild werden Platzhalter genutzt.", menuItems.length === 0 || menuItemsWithImage.length >= Math.min(4, menuItems.length), "Assets"),
    required("seo-review", "SEO/LLM geprüft", "Title, Description, Schema und Indexierung wurden bewusst geprüft.", seoReviewDone, "SEO & LLM"),
    required("seo-title", "SEO-Titel", "Partner-spezifischer Titel ist aussagekräftig gepflegt.", hasSeoTitle, "SEO & LLM"),
    required("seo-description", "SEO-Beschreibung", "Meta-Beschreibung nennt Partner, Ort, Deals und Speisekarte ausreichend.", hasSeoDescription, "SEO & LLM"),
    recommended("seo-keywords", "SEO/LLM-Suchbegriffe", "Mindestens vier relevante Begriffe helfen interner Suche und KI-Systemen.", hasSeoKeywords, "SEO & LLM"),
    required("public-indexing", "Indexierung aktiv", "Öffentliche Live-Seiten dürfen nicht versehentlich auf noindex stehen.", !config.seo.noIndex, "SEO & LLM"),
    required("structured-data", "Strukturierte Daten", "Restaurant, Menu, FAQ und Breadcrumb JSON-LD sind systemisch aktiv.", true, "SEO & LLM"),
    required("preview-noindex", "Vorschau noindex", "Builder-/Preview-Seiten sind von Indexierung ausgeschlossen.", true, "SEO & LLM"),
    recommended("faq", "FAQ vorhanden", "FAQ ist sichtbar und als FAQPage für Suchsysteme strukturiert.", true, "SEO & LLM"),
    required("desktop-qa-done", "Desktopprüfung abgeschlossen", "Desktop-Navigation, Hero, Deals, Speisekarte, Kontakt und Footer wurden geprüft.", desktopQaDone, "Mobile"),
    required("mobile-qa-done", "Mobilprüfung abgeschlossen", "Mobile Ansicht wurde im Builder geprüft und freigegeben.", mobileQaDone, "Mobile"),
    required("responsive", "Responsives Layout", "Desktop- und Mobilvorschau sind im Builder verfügbar und müssen separat freigegeben werden.", true, "Mobile"),
    recommended("mobile-actions", "Mobile Kontaktaktionen", "Route/Anrufen/Karte sind mobil vorgesehen.", Boolean(partner.phone && partner.address), "Mobile"),
    required("publish-review", "Finale Veröffentlichung geprüft", "Vor Publish wurde bewusst geprüft: Daten, Assets, Mobile, SEO/LLM und Live-Link.", publishReviewDone, "Publish"),
    required("draft-versioning", "Versionierter Entwurf", "Entwurf und Veröffentlichung laufen über Microsite-Versionen.", true, "Publish"),
    recommended("published", "Veröffentlicht", "Eine veröffentlichte Version existiert.", Boolean(partner.microsite?.publishedVersion), "Publish"),
    recommended("self-service-safe", "Partner-Self-Service sicher", "Partner sollten Daten/Bilder ändern können, aber nicht das Layout zerstören.", true, "Partner-Self-Service"),
    required("sitemap-robots", "Sitemap & Robots", "robots.txt und sitemap.xml werden aus den Microsites erzeugt.", true, "Production"),
    required("public-url", "Öffentliche URL", "Slug/Subdomain oder Canonical URL ist für die Microsite vorhanden.", hasPublicIdentifier, "Production"),
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
        : score >= 85
          ? "live-ready"
          : "needs-work",
    items,
  }
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
