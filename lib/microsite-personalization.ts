import type { PartnerWithDeals } from "./admin-data"

export type MicrositeTemplateId =
  | "restaurant-premium"
  | "restaurant-local"
  | "restaurant-clean"
  | "salon-editorial"
  | "atelier-noir"
  | "wellness-serene"
  | "cinema-spotlight"
  | "festival-neon"

export type PrintableFormatId =
  | "flyer-a5"
  | "poster-a4"
  | "square-post"
  | "story-banner"
  | "landscape-banner"

export type PrintableTemplateId =
  | "bold-offer"
  | "clean-story"
  | "photo-spotlight"
  | "editorial-luxe"
  | "midnight-glow"

type PartnerSeed = {
  id?: string | null
  name?: string | null
  short_name?: string | null
  city_name?: string | null
  address?: string | null
  description?: string | null
  type?: string | null
  category?: string[] | null
  website?: string | null
  phone?: string | null
  email?: string | null
  socials?: Array<{
    platform: string | null
    url: string | null
    handle: string | null
  }> | null
}

export type MicrositePartnerProfile =
  | "restaurant"
  | "salon"
  | "wellness"
  | "cinema"

export function inferMicrositePartnerProfile(
  partner: Pick<
    PartnerSeed,
    "name" | "short_name" | "type" | "category" | "description"
  >,
): MicrositePartnerProfile {
  const haystack = [
    partner.name,
    partner.short_name,
    partner.type,
    partner.description,
    ...(partner.category ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (
    /(salon|hair|barber|beauty|studio|friseur|kosmetik|nails?|lashes?|brow)/.test(
      haystack,
    )
  ) {
    return "salon"
  }

  if (
    /(massage|spa|wellness|physio|therapy|therapie|relax|yoga|pilates)/.test(
      haystack,
    )
  ) {
    return "wellness"
  }

  if (
    /(cinema|kino|movie|film|ticket|bowling|escape|event|activity|activities)/.test(
      haystack,
    )
  ) {
    return "cinema"
  }

  return "restaurant"
}

export function defaultMicrositeTemplateForPartner(partner: PartnerSeed): MicrositeTemplateId {
  const profile = inferMicrositePartnerProfile(partner)

  if (profile === "salon") {
    return "salon-editorial"
  }

  if (profile === "wellness") {
    return "wellness-serene"
  }

  if (profile === "cinema") {
    return "cinema-spotlight"
  }

  return "restaurant-premium"
}

export function defaultMicrositeCopyForPartner(partner: PartnerSeed) {
  const profile = inferMicrositePartnerProfile(partner)
  const name = partner.short_name?.trim() || partner.name?.trim() || "Partner"
  const place = micrositePlaceLabel(partner)
  const description = partner.description?.trim()
  const serviceSummary = partner.category?.filter(Boolean).slice(0, 3).join(" · ")

  if (profile === "salon") {
    return {
      heroSlogan: "Looks, Pflege und Vertrauen an einem Ort.",
      aboutText:
        description ||
        `${name} verbindet persönliche Beratung, verlässliche Termine und ein hochwertiges Studio-Erlebnis für ${place}.`,
      menuLabel: "Services",
      menuHeadline: "Beliebte Services auf einen Blick.",
      menuDescription:
        "Treatments, Add-ons und Signature-Services können hier für schnelle Buchungsentscheidungen präsentiert werden.",
      contactHeadline: "Buche deinen nächsten Termin.",
      appHeadline: "Deine Vorteile und Wiederbesuche in einer App",
      appText:
        "Angebote aktivieren, Loyalty-Vorteile sammeln und mit deinem Lieblingsstudio verbunden bleiben.",
      footerText: "Moderner Service, loyale Gäste und ein starker lokaler Auftritt.",
      services: [
        { label: "Beratung", icon: "spark" },
        { label: "Hair & Styling", icon: "smile" },
        { label: "Color Services", icon: "star" },
        { label: "Termine", icon: "clock" },
      ],
      printHeadline: `${name} x Benefitsi`,
      printSubheadline:
        serviceSummary || "Termine, Specials und Loyalty-Vorteile für wiederkehrende Gäste.",
      printNote: `${name} in ${place} entdecken`,
    }
  }

  if (profile === "wellness") {
    return {
      heroSlogan: "Ruhe, Pflege und ein Grund wiederzukommen.",
      aboutText:
        description ||
        `${name} schafft in ${place} ein regeneratives Erlebnis mit Premium-Treatments, ruhigen Räumen und Benefitsi Vorteilen für wiederkehrende Gäste.`,
      menuLabel: "Treatments",
      menuHeadline: "Signature-Treatments und Mitglieds-Favoriten.",
      menuDescription:
        "Massagen, Pakete, Wellness-Rituale und Premium-Add-ons lassen sich hier ruhig und hochwertig darstellen.",
      contactHeadline: "Bereit zum Abschalten?",
      appHeadline: "Wellness-Angebote und Loyalty-Vorteile in deiner Tasche",
      appText:
        "Gäste können individuelle Angebote freischalten, Besuche sammeln und leichter wiederkommen.",
      footerText: "Ruhige Premium-Sprache, verlässliche Betreuung und stärkere Retention für lokale Wellness-Partner.",
      services: [
        { label: "Entspannende Sessions", icon: "leaf" },
        { label: "Individuelle Pflege", icon: "shield" },
        { label: "Premium-Rituale", icon: "star" },
        { label: "Flexible Buchung", icon: "clock" },
      ],
      printHeadline: `${name} Wellness`,
      printSubheadline:
        serviceSummary || "Treatments, Rituale und exklusive Mitglieder-Vorteile für wiederkehrende Gäste.",
      printNote: `Auszeit in ${place}`,
    }
  }

  if (profile === "cinema") {
    return {
      heroSlogan: "Ausgeh-Abende, Member-Perks und lokale Erlebnisse mit Wiederkehrfaktor.",
      aboutText:
        description ||
        `${name} macht aus Besuchen wiederkehrende Erlebnisse mit exklusiven Angeboten, leichter Entdeckung und stärkerer lokaler Sichtbarkeit in ${place}.`,
      menuLabel: "Highlights",
      menuHeadline: "Erlebnisse, die Gäste nicht verpassen sollten.",
      menuDescription:
        "Screenings, Events, Bundles oder besondere Aktivitäten lassen sich hier schnell scanbar präsentieren.",
      contactHeadline: "Plane deinen nächsten Besuch.",
      appHeadline: "Das nächste Event und alle Vorteile immer griffbereit",
      appText:
        "Erlebnis-Highlights bewerben, wiederkehrende Besuche sammeln und Gäste zur nächsten Buchung führen.",
      footerText: "Mehr Sichtbarkeit für Events, bessere Discovery und wiederkehrende Besuche mit Benefitsi.",
      services: [
        { label: "Events & Premieren", icon: "star" },
        { label: "Food & Drinks", icon: "gift" },
        { label: "Gruppenbesuche", icon: "people" },
        { label: "Digitale Rewards", icon: "phone" },
      ],
      printHeadline: `Heute bei ${name}`,
      printSubheadline:
        serviceSummary || "Das nächste Event, Bundle oder Benefitsi Angebot aufmerksamkeitsstark bewerben.",
      printNote: `${name} in ${place}`,
    }
  }

  return {
    heroSlogan: "Frisch, lokal und immer einen weiteren Besuch wert.",
    aboutText:
      description ||
      `${name} bringt lokalen Geschmack, verlässlichen Service und Benefitsi Vorteile für Gäste in ${place} zusammen.`,
    menuLabel: "Speisekarte",
    menuHeadline: "Beliebte Gerichte und Gäste-Favoriten.",
    menuDescription:
      "Die aktuelle Speisekarte zeigen, Favoriten hervorheben und Gäste vor dem Besuch stöbern lassen.",
    contactHeadline: "Bereit für deinen nächsten Besuch?",
    appHeadline: "Alle lokalen Vorteile in deiner Benefitsi App",
    appText:
      "Deals aktivieren, Loyalty-Stempel sammeln und den Lieblingspartner immer nur einen Tap entfernt haben.",
    footerText: "Lokaler Geschmack, loyale Gäste und eine Microsite für mehr Wiederbesuche.",
    services: [
      { label: "Abholung", icon: "bag" },
      { label: "Frische Auswahl", icon: "leaf" },
      { label: "Kartenzahlung & Mobile Pay", icon: "card" },
      { label: "Familienfreundlich", icon: "people" },
    ],
    printHeadline: `${name} x Benefitsi`,
    printSubheadline:
      serviceSummary || "Bestes Angebot, Top-Gerichte und Loyalty-Vorteile an einem Ort zeigen.",
    printNote: `${name} in ${place}`,
  }
}

export function micrositePlaceLabel(partner: Pick<PartnerSeed, "city_name" | "address">) {
  const city = partner.city_name?.trim()

  if (city) {
    return city
  }

  const address = partner.address?.trim()

  if (!address) {
    return "your neighborhood"
  }

  const lastSegment = address
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .at(-1)

  return lastSegment || address
}

export function partnerSocialUrl(
  partner: Pick<PartnerSeed, "phone" | "website" | "socials">,
  platform: string,
) {
  if (platform === "website") {
    return normalizeUrl(partner.website)
  }

  if (platform === "whatsapp") {
    const explicitWhatsapp = socialEntryForPlatform(partner.socials, "whatsapp")

    if (explicitWhatsapp?.url) {
      return explicitWhatsapp.url
    }

    const digits = partner.phone?.replace(/[^\d+]/g, "")
    return digits ? `https://wa.me/${digits.replace(/^\+/, "")}` : ""
  }

  const social = socialEntryForPlatform(partner.socials, platform)
  return normalizeUrl(social?.url)
}

export function partnerSocialLabel(
  partner: Pick<PartnerSeed, "socials" | "website">,
  platform: string,
) {
  if (platform === "website" && partner.website) {
    return readableWebsiteLabel(partner.website)
  }

  const social = socialEntryForPlatform(partner.socials, platform)

  if (!social) {
    return ""
  }

  return (
    social.handle?.replace(/^@/, "") ||
    readableWebsiteLabel(social.url || "") ||
    platform
  )
}

export function preferredContactUrl(partner: Pick<PartnerSeed, "website" | "phone" | "email">) {
  return (
    normalizeUrl(partner.website) ||
    (partner.phone ? `tel:${partner.phone.replace(/[^\d+]/g, "")}` : "") ||
    (partner.email ? `mailto:${partner.email}` : "")
  )
}

export function sanitizeTemplateId(
  value: unknown,
  fallback: MicrositeTemplateId,
): MicrositeTemplateId {
  return isTemplateId(value) ? value : fallback
}

export function sanitizePrintableFormatId(
  value: unknown,
  fallback: PrintableFormatId,
): PrintableFormatId {
  return isPrintableFormatId(value) ? value : fallback
}

export function sanitizePrintableTemplateId(
  value: unknown,
  fallback: PrintableTemplateId,
): PrintableTemplateId {
  return isPrintableTemplateId(value) ? value : fallback
}

function isTemplateId(value: unknown): value is MicrositeTemplateId {
  return [
    "restaurant-premium",
    "restaurant-local",
    "restaurant-clean",
    "salon-editorial",
    "atelier-noir",
    "wellness-serene",
    "cinema-spotlight",
    "festival-neon",
  ].includes(String(value))
}

function isPrintableFormatId(value: unknown): value is PrintableFormatId {
  return [
    "flyer-a5",
    "poster-a4",
    "square-post",
    "story-banner",
    "landscape-banner",
  ].includes(String(value))
}

function isPrintableTemplateId(value: unknown): value is PrintableTemplateId {
  return [
    "bold-offer",
    "clean-story",
    "photo-spotlight",
    "editorial-luxe",
    "midnight-glow",
  ].includes(String(value))
}

function socialEntryForPlatform(
  socials:
    | Array<{
        platform: string | null
        url: string | null
        handle: string | null
      }>
    | null
    | undefined,
  platform: string,
) {
  return socials?.find(
    (entry) => entry.platform?.trim().toLowerCase() === platform,
  )
}

function normalizeUrl(value?: string | null) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return ""
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^(mailto:|tel:)/i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed.replace(/^\/+/, "")}`
}

function readableWebsiteLabel(value: string) {
  const normalized = normalizeUrl(value)

  if (!normalized) {
    return ""
  }

  try {
    return new URL(normalized).hostname.replace(/^www\./i, "")
  } catch {
    return value
  }
}

export function hasAnyPartnerSocials(
  partner: Pick<PartnerSeed, "website" | "phone" | "socials">,
) {
  return [
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "whatsapp",
    "website",
    "google",
    "linkedin",
  ].some((platform) => Boolean(partnerSocialUrl(partner, platform)))
}

export function primaryMicrositeImage(partner: Pick<PartnerWithDeals, "feature_card_url" | "cover_urls" | "logo_url">, fallback: string) {
  return partner.feature_card_url || partner.cover_urls?.[0] || partner.logo_url || fallback
}
