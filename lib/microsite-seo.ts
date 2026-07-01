import type { Metadata } from "next"
import type { MenuItem, PartnerWithDeals } from "./admin-data"
import type { MicrositeConfig } from "./microsites"

export const defaultMicrositeFaqItems = [
  {
    question: "Wie funktioniert die Stempelkarte?",
    answer:
      "Nach deinem Besuch checkst du in der Benefitsi App ein und sammelst automatisch Stempel. Sobald eine Belohnung erreicht ist, wird sie in der App freigeschaltet.",
  },
  {
    question: "Welche Vorteile gibt es mit Premium?",
    answer:
      "Premium-Mitglieder erhalten zusätzliche Deals, exklusive Belohnungen und besondere Aktionen bei teilnehmenden lokalen Partnern.",
  },
  {
    question: "Wie nutze ich den 2 für 1 Deal?",
    answer:
      "Aktiviere den Vorteil vor deiner Bestellung in der App. Vor Ort zeigst du den aktiven Vorteil einfach beim Bezahlen vor.",
  },
  {
    question: "Brauche ich die Benefitsi App?",
    answer:
      "Ja, Deals, Stempel und Belohnungen werden digital in der App gesammelt und eingelöst.",
  },
  {
    question: "Kann ich online bestellen?",
    answer:
      "Wenn der Partner Online-Bestellung anbietet, findest du den passenden Button direkt auf der Microsite oder in der Benefitsi App.",
  },
  {
    question: "Kostet die Teilnahme etwas?",
    answer:
      "Viele Vorteile sind kostenlos nutzbar. Manche Premium-Vorteile sind Benefitsi Premium-Mitgliedern vorbehalten.",
  },
]

export function createMicrositeMetadata({
  partner,
  config,
  slug,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  slug: string
}): Metadata {
  const name = partner.name || config.hero.headline
  const location = config.hero.locationText
  const fallbackTitle = `${name} in ${location} | Deals, Stempelkarte & Speisekarte`
  const fallbackDescription = `${name}: ${config.hero.slogan} Entdecke Benefitsi Deals, Stempelkarte, Speisekarte, Öffnungszeiten und Kontakt in ${location}.`
  const title = config.seo.title || fallbackTitle
  const description = truncateDescription(config.seo.description || fallbackDescription)
  const canonical = canonicalUrlFor(partner, slug)
  const image = firstDefined([
    config.seo.ogImageUrl,
    config.deals.topDealImageUrl,
    config.deals.illustrationUrl,
    config.hero.backgroundImageUrl,
    partner.feature_card_url,
    partner.logo_url,
  ])

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      locale: "de_DE",
      url: canonical,
      title,
      description,
      siteName: "Benefitsi",
      images: image
        ? [
            {
              url: image,
              alt: `${name} – Benefitsi Partnerseite`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
    keywords: config.seo.keywords,
    robots: {
      index: !config.seo.noIndex,
      follow: !config.seo.noIndex,
      googleBot: {
        index: !config.seo.noIndex,
        follow: !config.seo.noIndex,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  }
}

export function createMicrositeStructuredData({
  partner,
  config,
  slug,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  slug: string
}) {
  const canonical = canonicalUrlFor(partner, slug)
  const name = partner.name || config.hero.headline
  const address = partner.address || config.hero.locationText
  const menuItems = menuItemsForPartner(partner).slice(0, 80)
  const coordinates = parseCoordinates(partner.coordinates)
  const logo = partner.logo_url || config.branding.logoUrl || undefined
  const images = uniqueStrings([
    logo,
    config.hero.backgroundImageUrl,
    config.deals.illustrationUrl,
    config.deals.topDealImageUrl,
    partner.feature_card_url,
    ...(partner.cover_urls ?? []),
  ])
  const restaurantId = `${canonical}#restaurant`

  const restaurant = compactJsonLd({
    "@type": "Restaurant",
    "@id": restaurantId,
    name,
    url: canonical,
    image: images.length ? images : undefined,
    logo,
    description: truncateDescription(
      config.seo.description || partner.description || `${config.hero.slogan} ${config.content.aboutText}`,
      260,
    ),
    keywords: config.seo.keywords.length ? config.seo.keywords.join(", ") : undefined,
    telephone: partner.phone || undefined,
    email: partner.email || undefined,
    address: address
      ? {
          "@type": "PostalAddress",
          streetAddress: address,
          addressCountry: "DE",
        }
      : undefined,
    geo: coordinates
      ? {
          "@type": "GeoCoordinates",
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        }
      : undefined,
    servesCuisine: cuisineForPartner(partner),
    openingHoursSpecification: openingHoursForSchema(partner),
    sameAs: partner.website ? [partner.website] : undefined,
    hasMenu: menuItems.length ? { "@id": `${canonical}#menu` } : undefined,
  })

  const menu = menuItems.length
    ? compactJsonLd({
        "@type": "Menu",
        "@id": `${canonical}#menu`,
        name: `Speisekarte ${name}`,
        url: `${canonical}#speisekarte`,
        hasMenuItem: menuItems.map((item) => menuItemForSchema(item)),
      })
    : null

  const faq = compactJsonLd({
    "@type": "FAQPage",
    "@id": `${canonical}#faq`,
    mainEntity: defaultMicrositeFaqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  })

  const breadcrumb = compactJsonLd({
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumb`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Benefitsi",
        item: siteOrigin(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name,
        item: canonical,
      },
    ],
  })

  return compactJsonLd({
    "@context": "https://schema.org",
    "@graph": [restaurant, menu, faq, breadcrumb].filter(Boolean),
  })
}

function canonicalUrlFor(partner: PartnerWithDeals, slug: string) {
  const explicit = partner.microsite?.canonical_url?.trim()

  if (explicit) {
    return explicit
  }

  return `${siteOrigin()}/p/${encodeURIComponent(slug)}`
}

function siteOrigin() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://benefitsi.de"
  )
}

function truncateDescription(value: string, max = 155) {
  const normalized = value.replace(/\s+/g, " ").trim()

  return normalized.length > max
    ? `${normalized.slice(0, max - 1).trim()}…`
    : normalized
}

function firstDefined(values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function compactJsonLd<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => compactJsonLd(item))
      .filter((item) => item !== undefined && item !== null) as T
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, compactJsonLd(item)])
        .filter(([, item]) => item !== undefined && item !== null && item !== ""),
    ) as T
  }

  return value
}

function menuItemsForPartner(partner: PartnerWithDeals) {
  return partner.menus.flatMap((menu) => {
    const categoryItems = menu.categories.flatMap((category) =>
      category.items.map((item) => ({ ...item, categoryName: category.name })),
    )

    if (categoryItems.length) {
      return categoryItems
    }

    const categoryNames = new Map(
      menu.categories.map((category) => [category.id, category.name]),
    )

    return menu.items.map((item) => ({
      ...item,
      categoryName: item.category_id
        ? categoryNames.get(item.category_id) ?? null
        : null,
    }))
  })
}

function menuItemForSchema(item: MenuItem & { categoryName?: string | null }) {
  const numericPrice = typeof item.price === "string" ? Number(item.price) : item.price

  return compactJsonLd({
    "@type": "MenuItem",
    name: item.name,
    description: item.description,
    image: item.image_url,
    menuAddOn: item.categoryName,
    offers: Number.isFinite(numericPrice)
      ? {
          "@type": "Offer",
          price: numericPrice,
          priceCurrency: item.currency || "EUR",
        }
      : undefined,
  })
}

function openingHoursForSchema(partner: PartnerWithDeals) {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]

  return partner.opening_hours
    .filter((row) => !row.is_closed && row.weekday !== null && row.opens_at && row.closes_at)
    .map((row) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: dayNames[row.weekday ?? 0],
      opens: row.opens_at?.slice(0, 5),
      closes: row.closes_at?.slice(0, 5),
    }))
}

function cuisineForPartner(partner: PartnerWithDeals) {
  const haystack = [
    partner.name,
    partner.short_name,
    partner.type,
    ...(partner.category ?? []),
  ]
    .join(" ")
    .toLowerCase()

  const cuisines = ["Fast Food"]

  if (/döner|doener|doner|kebab/.test(haystack)) cuisines.push("Döner", "Kebab")
  if (/pizza/.test(haystack)) cuisines.push("Pizza")
  if (/restaurant/.test(haystack)) cuisines.push("Restaurant")

  return [...new Set(cuisines)]
}

function parseCoordinates(value: PartnerWithDeals["coordinates"]) {
  if (!value) return null

  if (typeof value === "string") {
    const parts = value.split(",").map((part) => Number(part.trim()))

    if (parts.length >= 2 && parts.every(Number.isFinite)) {
      return { latitude: parts[0], longitude: parts[1] }
    }

    try {
      return parseCoordinates(JSON.parse(value) as PartnerWithDeals["coordinates"])
    } catch {
      return null
    }
  }

  if (
    typeof value === "object" &&
    "latitude" in value &&
    "longitude" in value &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number"
  ) {
    return { latitude: value.latitude, longitude: value.longitude }
  }

  return null
}
