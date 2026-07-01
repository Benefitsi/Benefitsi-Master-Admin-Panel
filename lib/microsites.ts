export type MicrositeStatus = "draft" | "review" | "approved" | "published" | "archived"

export type MicrositeAsset = {
  id: string
  url: string
  label: string
  slot: string
  source: "partner" | "microsite" | "upload" | "system"
  createdAt?: string
}

export type MicrositeConfig = {
  template: "restaurant-premium"
  branding: {
    accent: string
    accentSecondary: string
    logoUrl: string
    partnerBadgeUrl: string
  }
  navigation: {
    links: Array<{ label: string; anchor: string }>
  }
  hero: {
    headline: string
    slogan: string
    locationText: string
    openingText: string
    backgroundImageUrl: string
    badgeText: string
    primaryButtonLabel: string
    secondaryButtonLabel: string
    services: Array<{ label: string; icon: string }>
  }
  deals: {
    label: string
    headline: string
    slogan: string
    description: string
    illustrationUrl: string
    topDealLabel: string
    topDealHeadline: string
    topDealDescription: string
    topDealImageUrl: string
    topDealBullets: string[]
    topDealButtonLabel: string
  }
  stamps: {
    label: string
    headline: string
    slogan: string
  }
  content: {
    menuLabel: string
    menuHeadline: string
    menuDescription: string
    aboutLabel: string
    aboutHeadline: string
    aboutText: string
    contactLabel: string
    contactHeadline: string
    appHeadline: string
    appText: string
    footerText: string
  }
  seo: {
    title: string
    description: string
    keywords: string[]
    ogImageUrl: string
    noIndex: boolean
  }
  assets: {
    library: MicrositeAsset[]
  }
  builder: {
    mobileQaDone: boolean
    desktopQaDone: boolean
    assetReviewDone: boolean
    partnerDataReviewDone: boolean
    seoReviewDone: boolean
    publishReviewDone: boolean
    lastQaAt: string
    versionNote: string
  }
  elementStyles: Record<string, MicrositeElementStyle>
  elementText: Record<string, string>
}

export type MicrositeElementStyle = {
  fontSize?: number
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontFamily?: string
  maxWidth?: number
  iconSize?: number
  imageScale?: number
  height?: number
  gap?: number
  xOffset?: number
  marginTop?: number
  marginBottom?: number
}

export type MicrositeVersion = {
  id: string
  microsite_id: string
  version_number: number | null
  config: unknown
  created_by: string | null
  status: MicrositeStatus | string | null
  created_at: string | null
}

export type PartnerMicrosite = {
  id: string
  partner_id: string
  slug: string | null
  subdomain: string | null
  canonical_url: string | null
  status: MicrositeStatus | string | null
  published_version_id: string | null
  created_at: string | null
  updated_at: string | null
  draftVersion: MicrositeVersion | null
  publishedVersion: MicrositeVersion | null
}

type PartnerSeed = {
  id?: string | null
  name?: string | null
  short_name?: string | null
  city_name?: string | null
  address?: string | null
  logo_url?: string | null
  feature_card_url?: string | null
  cover_urls?: string[] | null
  opening_hours?: Array<{
    weekday: number | null
    opens_at: string | null
    closes_at: string | null
    label: string | null
    is_closed: boolean | null
    sort_order: number | null
  }>
}

const defaultNavigation = [
  { label: "Deals", anchor: "deals" },
  { label: "Stempelkarte", anchor: "stempelkarte" },
  { label: "Speisekarte", anchor: "speisekarte" },
  { label: "Über Uns", anchor: "ueber-uns" },
  { label: "Benefitsi-App", anchor: "app" },
  { label: "Kontakt", anchor: "kontakt" },
]

export function createDefaultMicrositeConfig(partner: PartnerSeed): MicrositeConfig {
  const name = partner.name?.trim() || partner.short_name?.trim() || "Restaurant"
  const location = micrositeLocationText(partner)
  const backgroundImage =
    partner.cover_urls?.[0] || partner.feature_card_url || "/upload-image.jpg"

  return {
    template: "restaurant-premium",
    branding: {
      accent: "#f59e0b",
      accentSecondary: "#16c4cc",
      logoUrl: partner.logo_url || "",
      partnerBadgeUrl: "",
    },
    navigation: {
      links: defaultNavigation,
    },
    hero: {
      headline: name,
      slogan: "Lecker. Frisch. Aus der Region.",
      locationText: location,
      openingText: micrositeOpeningText(partner),
      backgroundImageUrl: backgroundImage,
      badgeText: "Offizieller Benefitsi Partner",
      primaryButtonLabel: "Deals ansehen",
      secondaryButtonLabel: "Speisekarte ansehen",
      services: [
        { label: "Abholung", icon: "bag" },
        { label: "Vegetarische Gerichte", icon: "leaf" },
        { label: "Bar / EC / PayPal", icon: "card" },
        { label: "Familienfreundlich", icon: "people" },
      ],
    },
    deals: {
      label: "Deals & Vorteile",
      headline: `Exklusive Benefitsi Deals bei ${partner.short_name || name}`,
      slogan: "Mehr genießen, mehr sparen!",
      description:
        "Entdecke die besten Vorteile und belohne dich bei jedem Besuch.",
      illustrationUrl: partner.feature_card_url || backgroundImage,
      topDealLabel: "Top Deal",
      topDealHeadline: "2 für 1 Döner",
      topDealDescription: "Zwei Döner genießen – nur einen bezahlen!",
      topDealImageUrl: partner.feature_card_url || backgroundImage,
      topDealBullets: [
        "Gültig für alle Döner",
        "Täglich einlösbar",
        `Nur in ${location}`,
      ],
      topDealButtonLabel: "Vorteil in der App aktivieren",
    },
    stamps: {
      label: "Stempelkarte",
      headline: "Stempel sammeln. Belohnung genießen.",
      slogan: "Ihre Treue wird belohnt!",
    },
    content: {
      menuLabel: "Speisekarte",
      menuHeadline: "Beliebte Gerichte direkt entdecken.",
      menuDescription:
        "Eine kompakte Auswahl aus der aktuellen Partner-Speisekarte.",
      aboutLabel: "Über uns",
      aboutHeadline: `${partner.short_name || name} auf einen Blick`,
      aboutText:
        "Frische Zutaten, schnelle Abholung und lokale Vorteile in der Benefitsi App.",
      contactLabel: "Kontakt",
      contactHeadline: "Bereit für deinen nächsten Besuch?",
      appHeadline: "Alle Vorteile in deiner Benefitsi App",
      appText:
        "Deals aktivieren, Punkte sammeln & lokale Partner unterstützen.",
      footerText: "Lokale Vorteile. Einfach gesammelt. Fair für Partner.",
    },
    seo: {
      title: `${name} in ${location} | Deals, Stempelkarte & Speisekarte`,
      description: `${name}: ${location}. Benefitsi Deals, Stempelkarte, Speisekarte, Öffnungszeiten und Kontakt auf einen Blick.`,
      keywords: [name, location, "Benefitsi", "Deals", "Stempelkarte", "Speisekarte"],
      ogImageUrl: backgroundImage,
      noIndex: false,
    },
    assets: {
      library: defaultAssetLibrary(partner, backgroundImage),
    },
    builder: {
      mobileQaDone: false,
      desktopQaDone: false,
      assetReviewDone: false,
      partnerDataReviewDone: false,
      seoReviewDone: false,
      publishReviewDone: false,
      lastQaAt: "",
      versionNote: "",
    },
    elementStyles: {},
    elementText: {},
  }
}

export function resolveMicrositeConfig(
  config: unknown,
  partner: PartnerSeed,
): MicrositeConfig {
  const fallback = createDefaultMicrositeConfig(partner)

  if (!isRecord(config)) {
    return fallback
  }

  const branding = isRecord(config.branding) ? config.branding : {}
  const hero = isRecord(config.hero) ? config.hero : {}
  const deals = isRecord(config.deals) ? config.deals : {}
  const stamps = isRecord(config.stamps) ? config.stamps : {}
  const content = isRecord(config.content) ? config.content : {}
  const elementStyles = isRecord(config.elementStyles)
    ? config.elementStyles
    : {}
  const elementText = isRecord(config.elementText) ? config.elementText : {}
  const seo = isRecord(config.seo) ? config.seo : {}
  const assets = isRecord(config.assets) ? config.assets : {}
  const builder = isRecord(config.builder) ? config.builder : {}

  return {
    ...fallback,
    branding: {
      ...fallback.branding,
      accent: safeColor(branding.accent, fallback.branding.accent),
      accentSecondary: safeColor(
        branding.accentSecondary,
        fallback.branding.accentSecondary,
      ),
      // Partner profile media is the source of truth for the partner logo.
      // This prevents old microsite drafts/localStorage from freezing outdated logos.
      logoUrl: fallback.branding.logoUrl,
      partnerBadgeUrl: safeString(
        branding.partnerBadgeUrl,
        fallback.branding.partnerBadgeUrl,
      ),
    },
    hero: {
      ...fallback.hero,
      // Defaults stay profile-bound, but the microsite builder may intentionally
      // store campaign copy overrides after an admin edits text inline.
      headline: safeString(hero.headline, fallback.hero.headline),
      slogan: safeString(hero.slogan, fallback.hero.slogan),
      locationText: safeLocationString(hero.locationText, fallback.hero.locationText),
      openingText: safeString(hero.openingText, fallback.hero.openingText),
      // Microsite campaign imagery remains intentionally overrideable in the builder.
      backgroundImageUrl: safeString(
        hero.backgroundImageUrl,
        fallback.hero.backgroundImageUrl,
      ),
      badgeText: safeString(hero.badgeText, fallback.hero.badgeText),
      primaryButtonLabel: safeString(
        hero.primaryButtonLabel,
        fallback.hero.primaryButtonLabel,
      ),
      secondaryButtonLabel: safeString(
        hero.secondaryButtonLabel,
        fallback.hero.secondaryButtonLabel,
      ),
    },
    deals: {
      ...fallback.deals,
      label: safeString(deals.label, fallback.deals.label),
      headline: safeString(deals.headline, fallback.deals.headline),
      slogan: safeString(deals.slogan, fallback.deals.slogan),
      description: safeString(deals.description, fallback.deals.description),
      illustrationUrl: safeString(
        deals.illustrationUrl,
        fallback.deals.illustrationUrl,
      ),
      topDealLabel: safeString(
        deals.topDealLabel,
        fallback.deals.topDealLabel,
      ),
      topDealHeadline: safeString(
        deals.topDealHeadline,
        fallback.deals.topDealHeadline,
      ),
      topDealDescription: safeString(
        deals.topDealDescription,
        fallback.deals.topDealDescription,
      ),
      topDealImageUrl: safeString(
        deals.topDealImageUrl,
        fallback.deals.topDealImageUrl,
      ),
      topDealButtonLabel: safeString(
        deals.topDealButtonLabel,
        fallback.deals.topDealButtonLabel,
      ),
    },
    stamps: {
      ...fallback.stamps,
      label: safeString(stamps.label, fallback.stamps.label),
      headline: safeString(stamps.headline, fallback.stamps.headline),
      slogan: safeString(stamps.slogan, fallback.stamps.slogan),
    },
    content: {
      ...fallback.content,
      menuLabel: safeString(content.menuLabel, fallback.content.menuLabel),
      menuHeadline: safeString(
        content.menuHeadline,
        fallback.content.menuHeadline,
      ),
      menuDescription: safeString(
        content.menuDescription,
        fallback.content.menuDescription,
      ),
      aboutLabel: safeString(content.aboutLabel, fallback.content.aboutLabel),
      aboutHeadline: safeString(
        content.aboutHeadline,
        fallback.content.aboutHeadline,
      ),
      aboutText: safeString(content.aboutText, fallback.content.aboutText),
      contactLabel: safeString(
        content.contactLabel,
        fallback.content.contactLabel,
      ),
      contactHeadline: safeString(
        content.contactHeadline,
        fallback.content.contactHeadline,
      ),
      appHeadline: safeString(content.appHeadline, fallback.content.appHeadline),
      appText: safeString(content.appText, fallback.content.appText),
      footerText: safeString(content.footerText, fallback.content.footerText),
    },
    seo: {
      ...fallback.seo,
      title: safeString(seo.title, fallback.seo.title),
      description: safeString(seo.description, fallback.seo.description),
      keywords: safeStringArray(seo.keywords, fallback.seo.keywords),
      ogImageUrl: safeString(seo.ogImageUrl, fallback.seo.ogImageUrl),
      noIndex: typeof seo.noIndex === "boolean" ? seo.noIndex : fallback.seo.noIndex,
    },
    assets: {
      library: normalizeAssetLibrary(assets.library, fallback.assets.library),
    },
    builder: {
      ...fallback.builder,
      mobileQaDone: typeof builder.mobileQaDone === "boolean" ? builder.mobileQaDone : fallback.builder.mobileQaDone,
      desktopQaDone: typeof builder.desktopQaDone === "boolean" ? builder.desktopQaDone : fallback.builder.desktopQaDone,
      assetReviewDone: typeof builder.assetReviewDone === "boolean" ? builder.assetReviewDone : fallback.builder.assetReviewDone,
      partnerDataReviewDone: typeof builder.partnerDataReviewDone === "boolean" ? builder.partnerDataReviewDone : fallback.builder.partnerDataReviewDone,
      seoReviewDone: typeof builder.seoReviewDone === "boolean" ? builder.seoReviewDone : fallback.builder.seoReviewDone,
      publishReviewDone: typeof builder.publishReviewDone === "boolean" ? builder.publishReviewDone : fallback.builder.publishReviewDone,
      lastQaAt: safeString(builder.lastQaAt, fallback.builder.lastQaAt),
      versionNote: safeString(builder.versionNote, fallback.builder.versionNote),
    },
    elementStyles: normalizeElementStyles(elementStyles),
    elementText: normalizeElementTextOverrides(elementText),
  }
}

function defaultAssetLibrary(partner: PartnerSeed, backgroundImage: string) {
  const assets = [
    partner.logo_url
      ? { id: "partner-logo", url: partner.logo_url, label: "Partnerlogo", slot: "branding.logo", source: "partner" as const }
      : null,
    partner.feature_card_url
      ? { id: "partner-feature", url: partner.feature_card_url, label: "Feature-Bild", slot: "partner.feature", source: "partner" as const }
      : null,
    backgroundImage
      ? { id: "hero-default", url: backgroundImage, label: "Standard Startbild", slot: "hero.background", source: "partner" as const }
      : null,
    ...(partner.cover_urls ?? []).map((url, index) => ({
      id: `cover-${index + 1}`,
      url,
      label: `Cover ${index + 1}`,
      slot: "partner.cover",
      source: "partner" as const,
    })),
  ].filter((asset): asset is NonNullable<typeof asset> => Boolean(asset?.url))

  return dedupeAssets(assets)
}

function normalizeAssetLibrary(value: unknown, fallback: MicrositeAsset[]) {
  if (!Array.isArray(value)) {
    return fallback
  }

  const normalized = value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const url = safeString(item.url, "")

      if (!url) {
        return null
      }

      const source =
        item.source === "partner" ||
        item.source === "microsite" ||
        item.source === "upload" ||
        item.source === "system"
          ? item.source
          : "microsite"

      return {
        id: safeString(item.id, `asset-${url}`),
        url,
        label: safeString(item.label, "Asset"),
        slot: safeString(item.slot, "general"),
        source,
        createdAt: safeString(item.createdAt, ""),
      } satisfies MicrositeAsset
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return dedupeAssets([...fallback, ...normalized])
}

function dedupeAssets(assets: MicrositeAsset[]) {
  const byUrl = new Map<string, MicrositeAsset>()

  for (const asset of assets) {
    if (!asset.url) {
      continue
    }

    byUrl.set(asset.url, {
      ...byUrl.get(asset.url),
      ...asset,
    })
  }

  return Array.from(byUrl.values()).slice(0, 80)
}

function micrositeLocationText(partner: PartnerSeed) {
  const city = partner.city_name?.trim()

  if (city && isUsableLocationText(city)) {
    return city
  }

  const partnerName = `${partner.name || ""} ${partner.short_name || ""}`
  const looksLikeKnobi = /knobi/i.test(partnerName)
  const address = partner.address?.trim()

  if (address && isUsableLocationText(address)) {
    const zipCity = address.match(/\b\d{5}\s+([^,]+)$/)

    if (zipCity?.[1] && isUsableLocationText(zipCity[1])) {
      return zipCity[1].trim()
    }

    const lastSegment = address
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1)

    if (lastSegment && isUsableLocationText(lastSegment)) {
      return lastSegment
    }
  }

  if (looksLikeKnobi) {
    return "Annweiler am Trifels"
  }

  return "Dein Lieblingsort vor Ort"
}

function micrositeOpeningText(partner: PartnerSeed) {
  const hours = partner.opening_hours ?? []

  if (!hours.length) {
    return "Öffnungszeiten im Admin ergänzen"
  }

  const today = new Date().getDay()
  const todayRows = hours
    .filter((row) => row.weekday === today)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const openRow = todayRows.find(
    (row) => !row.is_closed && row.opens_at && row.closes_at,
  )

  if (openRow) {
    return `Heute geöffnet · ${formatHour(openRow.opens_at)}–${formatHour(openRow.closes_at)}`
  }

  if (todayRows.some((row) => row.is_closed)) {
    return "Heute geschlossen"
  }

  const nextOpen = hours
    .filter((row) => !row.is_closed && row.opens_at && row.closes_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]

  if (nextOpen) {
    return `Geöffnet · ${formatHour(nextOpen.opens_at)}–${formatHour(nextOpen.closes_at)}`
  }

  return "Öffnungszeiten im Admin ergänzen"
}

function formatHour(value: string | null) {
  return value?.slice(0, 5) || ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function safeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function safeLocationString(value: unknown, fallback: string) {
  const candidate = typeof value === "string" ? value.trim() : ""

  return candidate && isUsableLocationText(candidate) ? candidate : fallback
}

function isUsableLocationText(value: string) {
  const normalized = value.trim()

  return (
    normalized.length > 0 &&
    normalized.length <= 72 &&
    !/\b(is a|located|restaurant|specializing|well-known|integrating|signature dishes|fresh garlic)\b/i.test(normalized)
  )
}

function safeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback
  }

  const strings = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)

  return strings.length ? strings : fallback
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
}

function normalizeElementStyles(
  value: Record<string, unknown>,
): Record<string, MicrositeElementStyle> {
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, Record<string, unknown>] =>
        isRecord(entry[1]),
      )
      .map(([key, style]) => [
        key,
        {
          fontSize: safeNumber(style.fontSize, 10, 160),
          color: safeOptionalColor(style.color),
          bold: typeof style.bold === "boolean" ? style.bold : undefined,
          italic: typeof style.italic === "boolean" ? style.italic : undefined,
          underline:
            typeof style.underline === "boolean" ? style.underline : undefined,
          fontFamily: safeFontFamily(style.fontFamily),
          maxWidth: safeNumber(style.maxWidth, 120, 1200),
          iconSize: safeNumber(style.iconSize, 12, 96),
          imageScale: safeNumber(style.imageScale, 50, 180),
          height: safeNumber(style.height, 44, 160),
          gap: safeNumber(style.gap, 0, 96),
          xOffset: safeNumber(style.xOffset, -360, 360),
          marginTop: safeNumber(style.marginTop, -120, 240),
          marginBottom: safeNumber(style.marginBottom, -120, 240),
        },
      ]),
  )
}

function normalizeElementText(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    ),
  )
}

function normalizeElementTextOverrides(value: Record<string, unknown>) {
  return normalizeElementText(value)
}

function safeFontFamily(value: unknown) {
  return typeof value === "string" &&
    /^[a-zA-Z0-9äöüÄÖÜß ,'"-]{2,80}$/.test(value)
    ? value
    : undefined
}

function safeNumber(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }

  return Math.min(Math.max(value, min), max)
}

function safeOptionalColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : undefined
}
