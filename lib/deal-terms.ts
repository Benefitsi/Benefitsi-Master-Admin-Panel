/**
 * Admin and partner vocabulary for deals, following Brand Guide 2.1 (p. 06–07).
 *
 * Storage enums stay unchanged. This module only names them: what the user
 * gets (Vorteil-Art) and when or why it applies (Anlass). Partner-facing names
 * differ from user labels where the guide says so, for example "Schnelle
 * Rückkehr" in the dashboard is "Schnell zurück" in the app.
 *
 * Public microsite and app labels are produced by lib/benefit-taxonomy.ts.
 */

export type BenefitKindKey = "two_for_one" | "discount" | "free_item" | "bonus_stamp"
export type OccasionKey =
  | "deal_drop"
  | "happy_hour"
  | "first_visit"
  | "quick_return"
  | "reactivation"
  | "birthday"

export type DealTermStyle = {
  /** Material Symbols Rounded icon name used by the app. */
  icon: string
  color: string
  surface: string
}

export type BenefitKindTerm = DealTermStyle & {
  key: BenefitKindKey
  label: string
  description: string
}

export type OccasionTerm = DealTermStyle & {
  key: OccasionKey
  /** Name in the app, on partner pages and on the website. */
  userLabel: string
  /** Name in the partner dashboard and the admin panel. */
  partnerLabel: string
  description: string
  /** Collected under the "Für dich" filter on the Discover page. */
  personal: boolean
  premiumOnly: boolean
}

export const benefitKindTerms: Record<BenefitKindKey, BenefitKindTerm> = {
  two_for_one: { key: "two_for_one", label: "2 für 1", description: "Zwei zum Preis von einem", icon: "confirmation_number", color: "#118CFF", surface: "#CBE7FF" },
  discount: { key: "discount", label: "Rabatt", description: "Prozent oder Betrag", icon: "percent", color: "#0B9F86", surface: "#BEEFE2" },
  free_item: { key: "free_item", label: "Gratis", description: "Ein Artikel gratis", icon: "card_giftcard", color: "#F59E0B", surface: "#FFDFA7" },
  bonus_stamp: { key: "bonus_stamp", label: "Bonusstempel", description: "Kommt automatisch", icon: "local_activity", color: "#17D4D7", surface: "#BEEFEF" },
}

// Everything personal shares one color (Brand Guide 2.1, p. 07).
const personal = { color: "#4F46E5", surface: "#D2D7FF", personal: true, premiumOnly: false } as const

export const occasionTerms: Record<OccasionKey, OccasionTerm> = {
  deal_drop: { key: "deal_drop", userLabel: "Deal Drop", partnerLabel: "Deal Drop", description: "Limitiert, nur Premium", icon: "bolt", color: "#E94B55", surface: "#FFD8DD", personal: false, premiumOnly: true },
  happy_hour: { key: "happy_hour", userLabel: "Happy Hour", partnerLabel: "Happy Hour", description: "Gilt in einem Zeitfenster", icon: "schedule", color: "#8B5CF6", surface: "#E3D3FF", personal: false, premiumOnly: false },
  first_visit: { key: "first_visit", userLabel: "Erster Besuch", partnerLabel: "Erster Besuch", description: "Erster Besuch bei diesem Partner", icon: "waving_hand", ...personal },
  quick_return: { key: "quick_return", userLabel: "Schnell zurück", partnerLabel: "Schnelle Rückkehr", description: "Rückkehr innerhalb weniger Tage", icon: "hourglass_bottom", ...personal },
  reactivation: { key: "reactivation", userLabel: "Wieder da", partnerLabel: "Reaktivierung", description: "Rückkehr nach längerer Pause", icon: "replay", ...personal },
  birthday: { key: "birthday", userLabel: "Geburtstag", partnerLabel: "Geburtstag", description: "Rund um den Geburtstag", icon: "cake", ...personal },
}

/** Terms the guide retires. Shown as hints when admins type them. */
export const retiredDealTerms: readonly { term: string; replacement: string }[] = [
  { term: "Top Deal", replacement: "konkreten Vorteil nennen, z. B. „2 für 1 Döner“" },
  { term: "Daily Deal", replacement: "konkreten Vorteil nennen" },
  { term: "Reward", replacement: "Prämie" },
  { term: "Punkte", replacement: "Stempel" },
  { term: "Willkommensbonus", replacement: "Erster Besuch" },
  { term: "Willkommensdeal", replacement: "Erster Besuch" },
  { term: "Zeitbonus", replacement: "Schnelle Rückkehr (Nutzer: Schnell zurück)" },
  { term: "Comeback", replacement: "Reaktivierung (Nutzer: Wieder da)" },
  { term: "Dauerrabatt", replacement: "Rabatt" },
  { term: "2-für-1-Deal", replacement: "2 für 1" },
  { term: "2:1", replacement: "2 für 1" },
  { term: "Händler", replacement: "Partner" },
  { term: "Landingpage", replacement: "Partnerseite" },
  { term: "Abo", replacement: "Premium-Mitgliedschaft" },
  { term: "Streak", replacement: "nicht mehr im Produkt" },
  { term: "Serie", replacement: "nicht mehr im Produkt" },
  { term: "Testphase", replacement: "nicht mehr im Produkt" },
]

function wordPattern(term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu")
}

const retiredPatterns = retiredDealTerms.map((entry) => ({ ...entry, pattern: wordPattern(entry.term) }))

/** Returns the retired terms found in admin-entered copy. */
export function findRetiredDealTerms(value: string | null | undefined) {
  if (!value) return []
  return retiredPatterns
    .filter(({ pattern }) => pattern.test(value))
    .map(({ term, replacement }) => ({ term, replacement }))
}

/** "20% Rabatt" without a space, as the guide requires everywhere. */
export function formatPercentDiscount(value: number) {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value)}% Rabatt`
}

export function formatFixedDiscount(value: number) {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value)} € Rabatt`
}

type DealTermInput = {
  type?: string | null
  discount_type?: string | null
  trigger_key?: string | null
  campaign_type?: string | null
  metadata?: unknown
}

function key(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function bonusMode(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return ""
  return key((metadata as Record<string, unknown>).bonus_mode)
}

/** Maps stored deal enums (including legacy ones) to the guide's Anlass. */
export function occasionForDeal(deal: DealTermInput): OccasionKey | null {
  const type = key(deal.type)
  const trigger = key(deal.trigger_key)
  const campaign = key(deal.campaign_type)
  const mode = bonusMode(deal.metadata)

  if (campaign === "deal_drop" || type === "limited_drop" || type === "deal_drop") return "deal_drop"
  if (campaign === "happy_hour" || type === "happy_hour") return "happy_hour"
  if (type === "welcome" || type === "welcome_bonus" || trigger === "welcome") return "first_visit"
  if (type === "birthday" || trigger === "birthday") return "birthday"
  if (type === "duration_bonus" || mode === "duration_bonus" || trigger === "time_bonus") return "quick_return"
  if (type === "comeback_inactive" || mode === "comeback_inactive") return "reactivation"
  if (type === "comeback" || type === "comeback_bonus" || trigger === "comeback") return "reactivation"
  return null
}

/** Maps stored deal enums to the guide's Vorteil-Art. */
export function benefitKindForDeal(deal: DealTermInput): BenefitKindKey | null {
  const type = key(deal.type)
  const discount = key(deal.discount_type)
  if (discount === "2for1" || type === "two_for_one") return "two_for_one"
  if (discount === "item" || type === "free_item") return "free_item"
  if (discount === "bonus_stamp" || type === "bonus_stamp") return "bonus_stamp"
  if (discount === "percent" || discount === "fixed" || type === "discount" || type === "permanent_discount") return "discount"
  return null
}
