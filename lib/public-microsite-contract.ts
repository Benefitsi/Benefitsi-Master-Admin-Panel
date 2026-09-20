/** Public contract v1. Kept byte-identical in Admin and Web; the optional
 * two-app verification checks this as well as the actual producer/consumer.
 * Editable/private config stays outside this projection. Never interpret HTML.
 */
export const PUBLIC_MICROSITE_SCHEMA = "benefitsi.public-microsite" as const
const fields = {
  branding: ["accent", "accentSecondary", "accentTertiary", "logoUrl", "partnerBadgeUrl"],
  hero: ["headline", "slogan", "locationText", "openingText", "backgroundImageUrl", "badgeText", "primaryButtonLabel", "secondaryButtonLabel"],
  deals: ["label", "headline", "slogan", "description", "illustrationUrl", "topDealLabel", "topDealHeadline", "topDealDescription", "topDealImageUrl", "topDealButtonLabel"],
  stamps: ["label", "headline", "slogan"],
  content: ["menuLabel", "menuHeadline", "menuDescription", "aboutLabel", "aboutHeadline", "aboutText", "quoteText", "quoteAttribution", "contactLabel", "contactHeadline", "appHeadline", "appText", "footerText"],
  seo: ["title", "description", "ogImageUrl"],
} as const

type Group<K extends keyof typeof fields> = Record<(typeof fields)[K][number], string>
export type PublicMicrositeStyle = Partial<Record<"fontSize" | "maxWidth" | "height" | "gap" | "xOffset" | "marginTop" | "marginBottom" | "imageScale" | "iconSize", number>> & { color?: string; bold?: boolean; italic?: boolean; underline?: boolean; fontFamily?: string }
export type PublicMicrositeConfig = {
  schema: typeof PUBLIC_MICROSITE_SCHEMA; version: 1; template: string; language: "de" | "en";
  appearance: { mode: "light" | "dark" };
  branding: Group<"branding">;
  navigation: { links: { anchor: string; label: string }[] };
  hero: Group<"hero"> & { services: { label: string; icon: string; description: string }[] };
  deals: Group<"deals"> & { topDealBullets: string[] };
  stamps: Group<"stamps">; content: Group<"content">;
  seo: Group<"seo"> & { noIndex: boolean; keywords: string[] };
  elementText: Record<string, string>; elementStyles: Record<string, PublicMicrositeStyle>;
}
export const PUBLIC_MICROSITE_SERVICE_ICONS = ["bag", "leaf", "card", "people", "gift", "heart", "star", "phone", "clock", "check", "pin", "sparkles", "basket", "scooter", "route"] as const
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 12000) : ""
export const PUBLIC_MICROSITE_ANCHORS = ["deals", "stempelkarte", "speisekarte", "ueber-uns", "app", "kontakt"] as const
const extraText = new Set([
  "branding.partnerName", "branding.logo", "contact.logo", "footer.benefitsiLogo",
  "content.aboutHeroImageUrl", "content.aboutIngredientImageUrl", "content.aboutLocationImageUrl", "content.aboutPrepImageUrl",
  "content.aboutSlogan", "content.aboutTextSecond", "content.aboutThanks", "content.aboutSignature",
  "content.contactSlogan", "content.contactSocialText", "content.contactMap", "content.contactOpening",
  "content.appKicker", "content.appPhoneScreenshotUrl", "content.appQrLabel", "content.appQrText",
  "content.ecosystemKicker", "content.ecosystemHeadline", "content.ecosystemText",
  "content.faqHeadline", "content.faqLabel", "content.faqText", "content.menuFeaturedItemKey",
  "content.socialFeed.enabled", "content.socialFeed.platform", "content.socialFeedHeadline", "content.socialFeedKicker",
  "stamps.description",
])
const textPatterns = [
  /^social\.(instagram|facebook|tiktok|youtube|whatsapp|website|google|linkedin)\.(enabled|iconUrl|label|url)$/,
  /^content\.socialFeed\.(instagram|tiktok)\.[0-5]\.url$/,
  /^content\.menuItem\.[a-z0-9_-]+\.(imageUrl|showImage)$/,
  /^content\.faq\.[0-5]\.(question|answer)$/,
  /^content\.aboutValue\.[0-3]$/,
  /^content\.appBenefit\.[0-2]$/,
  /^content\.contact\.(address|phone|opening)$/,
  /^hero\.services\.\d+\.(label|icon|description)$/,
  /^deals\.topDealBullets\.\d+$/,
]
function supportedText(key: string) {
  const [group, field] = key.split(".")
  return extraText.has(key) || textPatterns.some(p => p.test(key)) ||
    (Object.hasOwn(fields, group) && (fields[group as keyof typeof fields] as readonly string[]).includes(field) && key.split(".").length === 2) ||
    PUBLIC_MICROSITE_ANCHORS.some(anchor => key === `navigation.${anchor}`)
}
const assetKey = (key: string) => /(?:Url|\.logo)$/.test(key) || key === "footer.benefitsiLogo"
const linkKey = (key: string) => key.endsWith(".url") || key === "content.contactMap"
const visibilityKey = (key: string) => key.endsWith(".enabled") || key.endsWith(".showImage")
function supportedStyle(key: string) {
  return key === "navigation.group" || (supportedText(key) && !visibilityKey(key) && !linkKey(key) && !key.startsWith("seo.") &&
    !["branding.accent", "branding.accentSecondary", "branding.accentTertiary", "branding.logoUrl", "content.menuFeaturedItemKey", "content.socialFeed.platform"].includes(key))
}
const styleRanges = { fontSize: [10,160], maxWidth: [120,1200], height: [44,160], gap: [0,96], xOffset: [-360,360], marginTop: [-120,240], marginBottom: [-120,240], imageScale: [50,180], iconSize: [12,96] } as const

/** Only clean absolute HTTP(S) links or local paths; no credentials, controls,
 * protocol-relative URLs, encoded slash tricks or executable URI schemes. */
export function publicMicrositeUrl(value: unknown, kind: "link" | "asset" = "link"): string {
  const valueText = text(value)
  if (!valueText || /[\\\u0000-\u0020\u007f]/.test(valueText)) return ""
  if (kind === "asset") {
    try {
      const url = new URL(valueText, "https://public.invalid")
      if ([...url.searchParams.keys()].some(k => /token|signature|credential|authorization|api[-_]?key|secret|^sig$|^key$/i.test(k))) return ""
    } catch { return "" }
  }
  if (valueText.startsWith("/") && !valueText.startsWith("//") && !/^\/(?:%2f|%5c)/i.test(valueText)) {
    // This editor placeholder only exists in Admin; never ship a broken image.
    return kind === "asset" && valueText === "/upload-image.jpg" ? "" : valueText
  }
  if (kind === "link" && /^#[a-z0-9_-]+$/i.test(valueText)) return valueText
  try {
    const url = new URL(valueText)
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return ""
    // Signed/token URLs are temporary or private assets, not publication URLs.
    if (kind === "asset" && [...url.searchParams.keys()].some(k => /token|signature|credential|authorization|api[-_]?key|secret|^sig$|^key$/i.test(k))) return ""
    return url.href
  } catch { return "" }
}
function color(value: unknown) { const v = text(value); return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : "" }
function projectGroup<K extends keyof typeof fields>(input: Record<string, unknown>, group: K): Group<K> {
  const source = record(input[group]); const overrides = record(input.elementText)
  return Object.fromEntries(fields[group].map(key => {
    const value = overrides[`${group}.${key}`] ?? source[key]
    return [key, key.endsWith("Url") ? publicMicrositeUrl(value, "asset") : key.startsWith("accent") ? color(value) : text(value)]
  })) as Group<K>
}
export function createPublicMicrositeSnapshot(value: unknown): PublicMicrositeConfig | null {
  const input = record(value)
  if (!text(input.template) || !text(record(input.hero).headline)) return null
  const elementText: Record<string, string> = {}
  for (const [key, raw] of Object.entries(record(input.elementText))) {
    if (!supportedText(key)) continue
    const value = text(raw)
    elementText[key] = visibilityKey(key) ? (value === "false" ? "false" : "true") : assetKey(key) ? publicMicrositeUrl(value, "asset") : linkKey(key) ? publicMicrositeUrl(value) : value
  }
  const elementStyles: Record<string, PublicMicrositeStyle> = {}
  for (const [key, raw] of Object.entries(record(input.elementStyles))) {
    if (!supportedStyle(key)) continue
    const style = record(raw), safe: PublicMicrositeStyle = {}
    if (color(style.color)) safe.color = color(style.color)
    for (const key of ["bold", "italic", "underline"] as const) if (typeof style[key] === "boolean") safe[key] = style[key]
    if (["inherit", "Arial", "Georgia", "Verdana", "system-ui", "serif", "sans-serif"].includes(text(style.fontFamily))) safe.fontFamily = text(style.fontFamily)
    for (const key of ["fontSize", "maxWidth", "height", "gap", "xOffset", "marginTop", "marginBottom", "imageScale", "iconSize"] as const) {
      const n = style[key]; if (typeof n === "number" && Number.isFinite(n)) safe[key] = Math.max(styleRanges[key][0], Math.min(n, styleRanges[key][1]))
    }
    if (Object.keys(safe).length) elementStyles[key] = safe
  }
  const hero = record(input.hero), deals = record(input.deals), seo = record(input.seo)
  return {
    schema: PUBLIC_MICROSITE_SCHEMA, version: 1, template: text(input.template), language: input.language === "en" ? "en" : "de",
    appearance: { mode: record(input.appearance).mode === "dark" ? "dark" : "light" },
    branding: projectGroup(input, "branding"),
    navigation: { links: (Array.isArray(record(input.navigation).links) ? record(input.navigation).links as unknown[] : []).flatMap(raw => {
      const link = record(raw), anchor = text(link.anchor)
      return PUBLIC_MICROSITE_ANCHORS.some(a => a === anchor) ? [{ anchor, label: elementText[`navigation.${anchor}`] || text(link.label) }] : []
    }) },
    hero: { ...projectGroup(input, "hero"), services: (Array.isArray(hero.services) ? hero.services : []).slice(0, 12).map((raw, index) => ({ label: elementText[`hero.services.${index}.label`] || text(record(raw).label), icon: elementText[`hero.services.${index}.icon`] || text(record(raw).icon), description: elementText[`hero.services.${index}.description`] || text(record(raw).description) })) },
    deals: { ...projectGroup(input, "deals"), topDealBullets: (Array.isArray(deals.topDealBullets) ? deals.topDealBullets : []).slice(0, 20).map((v, i) => elementText[`deals.topDealBullets.${i}`] || text(v)) },
    stamps: projectGroup(input, "stamps"), content: projectGroup(input, "content"),
    seo: { ...projectGroup(input, "seo"), noIndex: seo.noIndex === true, keywords: (Array.isArray(seo.keywords) ? seo.keywords : []).slice(0, 40).map(text).filter(Boolean) },
    elementText, elementStyles,
  }
}
export function readPublicMicrositeSnapshot(value: unknown): PublicMicrositeConfig | null {
  const source = record(value)
  if (Object.hasOwn(source, "publicSnapshot")) {
    const snapshot = record(source.publicSnapshot)
    if (snapshot.schema !== PUBLIC_MICROSITE_SCHEMA || snapshot.version !== 1) return null
    for (const [group, keys] of Object.entries(fields)) {
      if (!keys.every(key => typeof record(snapshot[group])[key] === "string")) return null
    }
    if (!Array.isArray(record(snapshot.navigation).links) || !Array.isArray(record(snapshot.hero).services) || !Array.isArray(record(snapshot.deals).topDealBullets)) return null
    return createPublicMicrositeSnapshot(snapshot)
  }
  // Pre-v1 nested publications retain their reviewed content without requiring
  // a migration or changing the currently selected published version.
  return createPublicMicrositeSnapshot(source)
}
export function isModernMicrositeConfig(value: unknown) {
  const source = record(value)
  return Object.hasOwn(source, "publicSnapshot") || Object.hasOwn(source, "hero") || Object.hasOwn(source, "template")
}

/** Publication-only capability gate. Draft editing remains available. Private
 * builder/printable/asset-library metadata does not participate in this gate. */
export function publicMicrositePublishBlockers(value: unknown): string[] {
  const input = record(value), blockers: string[] = []
  if (input.template !== "restaurant-premium") blockers.push(`Template „${text(input.template) || "unbekannt"}“: öffentliche Darstellung noch nicht freigegeben (unterstützt: restaurant-premium)`)
  if (!createPublicMicrositeSnapshot(input)) blockers.push("Hero-Überschrift: gültiger öffentlicher Inhalt fehlt")
  for (const [key, raw] of Object.entries(record(input.elementText))) {
    const value = text(raw)
    if (!value) continue
    if (/^content\.socialFeed\.(instagram|tiktok)\.[0-5]\.url$/.test(key) && record(input.elementText)["content.socialFeed.enabled"] !== "false") {
      blockers.push(`Social-Feed-Feld „${key}“: eingebettete Beiträge sind öffentlich noch nicht unterstützt; Feed deaktivieren oder Beitrag entfernen`)
    }
    if (!supportedText(key)) blockers.push(`Text-/Medienfeld „${key}“: öffentliche Darstellung noch nicht unterstützt`)
    else if ((assetKey(key) || linkKey(key)) && !publicMicrositeUrl(value, assetKey(key) ? "asset" : "link")) blockers.push(`Feld „${key}“: sichere öffentliche URL ohne Zugangsdaten erforderlich`)
  }
  const services = record(input.hero).services
  if (Array.isArray(services)) services.forEach((service, index) => {
    const key = `hero.services.${index}.icon`
    const icon = text(record(input.elementText)[key] ?? record(service).icon)
    if (icon && !(PUBLIC_MICROSITE_SERVICE_ICONS as readonly string[]).includes(icon)) blockers.push(`Service-Icon „${key}“ (${icon}): öffentliche Darstellung noch nicht unterstützt`)
  })
  for (const [key, raw] of Object.entries(record(input.elementStyles))) {
    if (!Object.values(record(raw)).some(v => v !== "" && v !== undefined && v !== null)) continue
    if (!supportedStyle(key)) blockers.push(`Layoutfeld „${key}“: öffentliche Darstellung noch nicht unterstützt`)
    const font = text(record(raw).fontFamily)
    if (font && !["inherit", "Arial", "Georgia", "Verdana", "system-ui", "serif", "sans-serif"].includes(font)) blockers.push(`Schriftart „${font}“ in „${key}“: öffentliche Schrift noch nicht unterstützt`)
  }
  for (const [group, keys] of Object.entries(fields)) for (const key of keys) {
    const value = text(record(input[group])[key])
    if (key.endsWith("Url") && value && value !== "/upload-image.jpg" && !publicMicrositeUrl(value, "asset")) blockers.push(`Medienfeld „${group}.${key}“: öffentliche URL ohne Zugangsdaten oder Signatur erforderlich`)
  }
  return [...new Set(blockers)]
}
