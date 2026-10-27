export type BenefitTaxonomyLanguage = "de" | "en"

export type BenefitTaxonomyInput = {
  type?: string | null
  discount_type?: string | null
  discount_value?: number | null
  reward_item?: string | null
  benefit_count?: number | null
  metadata?: unknown
  reward_format?: string | null
  trigger?: string | null
  trigger_key?: string | null
  campaign_type?: string | null
  activation_mode?: string | null
  benefit_category?: string | null
  audience?: string | null
  public_title?: string | null
  public_subtitle?: string | null
  display_title?: string | null
  display_subtitle?: string | null
}

type RewardFormat = "two_for_one" | "discount" | "free_item" | "bonus_stamp" | null
// Brand Guide 2.1 (27.10.2026): "comeback" is the reactivation mechanic
// ("Wieder da"), the quick return is "time_bonus" ("Schnell zurück").
type Trigger = "welcome" | "time_bonus" | "comeback" | "birthday" | "streak" | "challenge" | null
type CampaignType = "happy_hour" | "deal_drop" | null

const forbiddenPublicText = /\b(?:top[ -]?(?:deal|vorteil)|hauptdeal|daily[ -]?deal|(?:gratis|free)[ -]?rewards?|reward)\b/iu
const retiredPublicTitleKeys = new Set([
  "daily deal",
  "hauptdeal", "haupt deal",
  "top deal", "top vorteil",
  "2 für 1 deal", "2 for 1 deal", "2-für-1-deal", "2-for-1-deal",
  "rabattvorteil", "rabatt vorteil",
  "dauervorteil", "dauer vorteil",
  "automatischer basisrabatt",
  "bonus stempel",
  "streak bonus",
  "willkommensvorteil",
  "comeback vorteil",
  "geburtstagsvorteil",
  "welcome reward", "welcome rewards",
  "time based bonus",
  "selectable discount",
  "reward", "rewards",
  "gratis reward", "gratis rewards",
  "free reward", "free rewards",
])
const nonConcretePublicTitles = new Set([
  "2 für 1", "2-for-1", "rabatt", "discount", "gratisartikel", "free item",
  "bonusstempel", "bonus stamps", "willkommen", "willkommensdeal",
  "willkommensbonus", "welcome", "welcome deal", "welcome bonus", "zeitbonus",
  "time bonus", "comeback", "comeback-deal", "comeback-bonus", "comeback deal",
  "comeback bonus", "geburtstag", "birthday", "streak", "streak-bonus",
  "challenge", "challenge-bonus", "happy hour", "deal drop", "dauerrabatt",
  "permanent discount", "vorteil", "benefit",
  "erster besuch", "first visit", "schnell zurück", "back soon",
  "wieder da", "welcome back",
])
const nonConcreteTitleDecoration = /^(?:happy[\s-]+hour|deal[\s-]+drop|2\s*[-\s]*(?:für|for)\s*[-\s]*1|rabatt|discount|gratisartikel|free item|bonusstempel|bonus stamps|willkommen|willkommensdeal|willkommensbonus|welcome|welcome deal|welcome bonus|zeitbonus|time bonus|comeback|comeback-deal|comeback-bonus|comeback deal|comeback bonus|geburtstag|birthday|streak|streak-bonus|challenge|challenge-bonus|dauerrabatt|permanent discount|vorteil|benefit)(?:[\s-]+(?:angebot|aktion|deal|bonus|vorteil|benefit|rabatt|discount|gratisartikel|free item))*$/iu

function normalizePublicText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[‐‑‒–—―]/gu, "-")
    .replace(/\p{Z}+/gu, " ")
    .replace(/[ \t]{2,}/gu, " ")
    .trim()
}

function retiredPublicTitleKey(value: string) {
  return normalizePublicText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function hasRetiredPublicTitle(value: string) {
  const candidate = ` ${retiredPublicTitleKey(value)} `
  return [...retiredPublicTitleKeys].some((retiredTitle) =>
    candidate.includes(` ${retiredPublicTitleKey(retiredTitle)} `),
  )
}

function hasForbiddenPublicText(value: string) {
  const normalized = normalizePublicText(value)
  return (
    forbiddenPublicText.test(normalized) ||
    hasRetiredPublicTitle(normalized)
  )
}

function isNonConcretePublicTitle(value: string) {
  const normalized = normalizePublicText(value)
    .replace(/[!?.:;,…]+$/gu, "")
    .trim()
    .toLowerCase()

  return (
    nonConcretePublicTitles.has(normalized) ||
    nonConcreteTitleDecoration.test(normalized)
  )
}

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function metadataString(input: BenefitTaxonomyInput, key: string) {
  const metadata = input.metadata
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return ""
  }

  return normalizedString((metadata as Record<string, unknown>)[key])
}

function recognized<T extends string>(value: string, values: readonly T[]): T | null {
  return values.includes(value as T) ? (value as T) : null
}

function rewardFormat(input: BenefitTaxonomyInput): RewardFormat {
  const explicit = recognized(normalizedString(input.reward_format), [
    "two_for_one",
    "discount",
    "free_item",
    "bonus_stamp",
  ] as const)
  if (explicit) return explicit

  const type = normalizedString(input.type)
  const discountType = normalizedString(input.discount_type)
  if (type === "two_for_one" || discountType === "2for1") return "two_for_one"
  if (type === "free_item" || discountType === "item") return "free_item"
  if (type === "bonus_stamp" || discountType === "bonus_stamp") return "bonus_stamp"
  if (type === "discount" || discountType === "fixed" || discountType === "percent") return "discount"
  return null
}

function trigger(input: BenefitTaxonomyInput): Trigger {
  const explicit = recognized(
    normalizedString(input.trigger) || normalizedString(input.trigger_key),
    ["welcome", "time_bonus", "comeback", "birthday", "streak", "challenge"] as const,
  )
  if (explicit) return explicit

  const type = normalizedString(input.type)
  const bonusMode = metadataString(input, "bonus_mode")
  if (type === "duration_bonus" || bonusMode === "duration_bonus") return "time_bonus"
  if (type === "welcome" || type === "welcome_bonus") return "welcome"
  // Stored "comeback" deals use trigger_key time_bonus today (a quick return
  // within X days). Only comeback_inactive is the long-absence reactivation.
  if (bonusMode === "comeback_inactive" || type === "comeback_inactive") return "comeback"
  if (type === "comeback" || type === "comeback_bonus") return "time_bonus"
  if (type === "comeback_inactive") return "comeback"
  if (type === "birthday") return "birthday"
  if (type === "streak" || type === "streak_bonus") return "streak"
  if (type === "challenge" || type === "challenge_bonus") return "challenge"
  return null
}

function campaignType(input: BenefitTaxonomyInput): CampaignType {
  const explicit = recognized(normalizedString(input.campaign_type), [
    "happy_hour",
    "deal_drop",
  ] as const)
  if (explicit) return explicit

  const type = normalizedString(input.type)
  if (type === "happy_hour") return "happy_hour"
  if (type === "limited_drop" || type === "deal_drop") return "deal_drop"
  return null
}

function isAutomaticBonus(input: BenefitTaxonomyInput, format: RewardFormat) {
  return (
    format === "bonus_stamp" ||
    ["automatic_scan", "automatic_background"].includes(
      normalizedString(input.activation_mode),
    ) ||
    ["automatic_background", "automatic_scan"].includes(
      normalizedString(input.benefit_category),
    ) ||
    ["welcome_bonus", "comeback_bonus"].includes(normalizedString(input.type))
  )
}

function localizedLabel(
  input: BenefitTaxonomyInput,
  language: BenefitTaxonomyLanguage,
) {
  const format = rewardFormat(input)
  const lifecycleTrigger = trigger(input)
  const campaign = campaignType(input)
  const automaticBonus = isAutomaticBonus(input, format)

  void automaticBonus
  // "Dauerrabatt" is retired; an automatic fallback is shown as what you get.
  const occasion = isAutomaticFallback(input) ? null : occasionKey(lifecycleTrigger, campaign)
  if (occasion) return OCCASIONS[occasion].label[language]

  const kind = valueKindKey(input, format)
  return kind ? VALUE_KINDS[kind].label[language] : language === "en" ? "Benefit" : "Vorteil"
}

/** Brand Guide 2.1, page 07: what you get (value kind). */
export type BenefitValueKind = "two_for_one" | "discount" | "free_item" | "bonus_stamp"
/** Brand Guide 2.1, page 07: when or why it applies (occasion). */
export type BenefitOccasion =
  | "deal_drop"
  | "happy_hour"
  | "first_visit"
  | "quick_return"
  | "welcome_back"
  | "birthday"

export type BenefitChipStyle = {
  key: string
  label: string
  /** Material Symbols Rounded name used by the app; web maps it to its icon set. */
  icon: string
  /** Icon colour on the chip surface. */
  color: string
  /** Chip surface. Text on it stays Core Black for contrast. */
  surface: string
}

type ChipDefinition = Omit<BenefitChipStyle, "key" | "label"> & {
  label: Record<BenefitTaxonomyLanguage, string>
}

const PERSONAL = { color: "#4F46E5", surface: "#D2D7FF" }

export const VALUE_KINDS: Record<BenefitValueKind, ChipDefinition> = {
  two_for_one: { label: { de: "2 für 1", en: "2-for-1" }, icon: "confirmation_number", color: "#118CFF", surface: "#CBE7FF" },
  discount: { label: { de: "Rabatt", en: "Discount" }, icon: "percent", color: "#0B9F86", surface: "#BEEFE2" },
  free_item: { label: { de: "Gratis", en: "Free" }, icon: "card_giftcard", color: "#F59E0B", surface: "#FFDFA7" },
  bonus_stamp: { label: { de: "Bonusstempel", en: "Bonus stamp" }, icon: "local_activity", color: "#17D4D7", surface: "#BEEFEF" },
}

export const OCCASIONS: Record<BenefitOccasion, ChipDefinition> = {
  deal_drop: { label: { de: "Deal Drop", en: "Deal Drop" }, icon: "bolt", color: "#E94B55", surface: "#FFD8DD" },
  happy_hour: { label: { de: "Happy Hour", en: "Happy Hour" }, icon: "schedule", color: "#8B5CF6", surface: "#E3D3FF" },
  first_visit: { label: { de: "Erster Besuch", en: "First visit" }, icon: "waving_hand", ...PERSONAL },
  quick_return: { label: { de: "Schnell zurück", en: "Back soon" }, icon: "hourglass_bottom", ...PERSONAL },
  welcome_back: { label: { de: "Wieder da", en: "Welcome back" }, icon: "replay", ...PERSONAL },
  birthday: { label: { de: "Geburtstag", en: "Birthday" }, icon: "cake", ...PERSONAL },
}

function occasionKey(lifecycleTrigger: Trigger, campaign: CampaignType): BenefitOccasion | null {
  // The personal trigger is the more specific reason and wins over a campaign.
  if (lifecycleTrigger === "welcome") return "first_visit"
  if (lifecycleTrigger === "time_bonus") return "quick_return"
  if (lifecycleTrigger === "comeback") return "welcome_back"
  if (lifecycleTrigger === "birthday") return "birthday"
  if (campaign === "deal_drop") return "deal_drop"
  if (campaign === "happy_hour") return "happy_hour"
  // Streak and challenge bonuses are retired (Brand Guide 2.1).
  return null
}

function isAutomaticFallback(input: BenefitTaxonomyInput) {
  return normalizedString(input.activation_mode) === "automatic_fallback"
}

function valueKindKey(input: BenefitTaxonomyInput, format: RewardFormat): BenefitValueKind | null {
  if (format) return format
  const type = normalizedString(input.type)
  if (type === "permanent_discount" || isAutomaticFallback(input)) return "discount"
  return null
}

function chip(key: string, definition: ChipDefinition, language: BenefitTaxonomyLanguage): BenefitChipStyle {
  return { key, label: definition.label[language], icon: definition.icon, color: definition.color, surface: definition.surface }
}

/**
 * Value kind and occasion chips as in the app (Brand Guide 2.1, page 07).
 * Every card shows what you get first; the occasion is an optional label.
 */
export function benefitPresentation(
  input: BenefitTaxonomyInput,
  language: BenefitTaxonomyLanguage = "de",
) {
  const format = rewardFormat(input)
  const kind = valueKindKey(input, format)
  const occasion = isAutomaticFallback(input) ? null : occasionKey(trigger(input), campaignType(input))
  return {
    kind: kind ? chip(kind, VALUE_KINDS[kind], language) : null,
    occasion: occasion ? chip(occasion, OCCASIONS[occasion], language) : null,
  }
}

/** Returns the public taxonomy label while accepting legacy storage enums. */
export function benefitTaxonomyLabel(
  input: BenefitTaxonomyInput,
  language: BenefitTaxonomyLanguage = "de",
) {
  return localizedLabel(input, language)
}

function publicTitle(input: BenefitTaxonomyInput) {
  const title =
    (typeof input.public_title === "string" && input.public_title.trim()) ||
    (typeof input.display_title === "string" && input.display_title.trim()) ||
    ""
  if (typeof title !== "string") {
    return ""
  }

  const normalizedTitle = normalizePublicText(title)
    .replace(/\b2\s*[-\s]*(?:for|für)\s*[-\s]*1\b/giu, "2 für 1")

  if (
    !normalizedTitle ||
    hasForbiddenPublicText(normalizedTitle) ||
    isNonConcretePublicTitle(normalizedTitle) ||
    isGenericFormatTitle(input, normalizedTitle)
  ) {
    return ""
  }

  return normalizedTitle
}

function rewardItem(input: BenefitTaxonomyInput) {
  const item = normalizePublicText(input.reward_item || "")
    .replace(/^(?:gratisartikel|free item)\s*[:\-–]?\s*/iu, "")
    .replace(/^(?:gratis|free)\s+/iu, "")
    .replace(/^2\s*[-\s‐‑‒–—―]*(?:für|for)\s*[-\s‐‑‒–—―]*1\b\s*/iu, "")
    .trim()

  return hasForbiddenPublicText(item) ? "" : item
}

function normalizedTitleKey(value: string) {
  return normalizePublicText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function isGenericFormatTitle(input: BenefitTaxonomyInput, value: string) {
  const format = rewardFormat(input)
  const titleKey = normalizedTitleKey(value)
  const itemKey = normalizedTitleKey(rewardItem(input))

  if (format === "two_for_one") {
    return ["2 für 1", "2 for 1"].includes(titleKey) ||
      (itemKey !== "" && titleKey === itemKey)
  }
  if (format === "free_item") {
    return ["gratisartikel", "free item"].includes(titleKey) ||
      (itemKey !== "" && titleKey === itemKey)
  }
  if (format === "discount") {
    return ["rabatt", "discount"].includes(titleKey)
  }
  if (format === "bonus_stamp") {
    return ["bonusstempel", "bonus stamps", "bonus stamp"].includes(titleKey)
  }
  return false
}

function numberValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value)
}

function concreteTitle(input: BenefitTaxonomyInput, language: BenefitTaxonomyLanguage) {
  const format = rewardFormat(input)
  const item = rewardItem(input)
  if (format === "two_for_one") return item ? `${language === "en" ? "2-for-1" : "2 für 1"} ${item}` : language === "en" ? "2-for-1" : "2 für 1"
  if (format === "free_item") return item ? `${language === "en" ? "Free" : "Gratis"} ${item}` : language === "en" ? "Free item" : "Gratisartikel"
  if (format === "bonus_stamp") {
    const count = Math.max(1, numberValue(input.benefit_count) ?? 1)
    return `+${formatNumber(count)} ${language === "en" ? "bonus stamps" : "Bonusstempel"}`
  }
  if (format === "discount") {
    const amount = numberValue(input.discount_value)
    const discountType = normalizedString(input.discount_type)
    if (amount !== null && discountType === "fixed") return `${formatNumber(amount)} € ${language === "en" ? "discount" : "Rabatt"}`
    if (amount !== null && discountType === "percent") return `${formatNumber(amount)}% ${language === "en" ? "discount" : "Rabatt"}`
  }
  return localizedLabel(input, language)
}

/**
 * Returns a safe concrete public title. Explicit titles are retained unless
 * they contain retired public campaign labels; legacy enum values are only
 * used to derive the canonical fallback.
 */
export function formatBenefitTitle(
  input: BenefitTaxonomyInput,
  language: BenefitTaxonomyLanguage = "de",
) {
  const explicitTitle = publicTitle(input)
  if (explicitTitle) return explicitTitle

  // The occasion ("Erster Besuch", "Wieder da") is shown as its own label
  // above the title (Brand Guide 2.1), never as a title prefix.
  const result = concreteTitle(input, language)

  if (!hasForbiddenPublicText(result)) {
    return result
  }

  return concreteTitle({ ...input, reward_item: null }, language)
}

/** Returns whether a string contains a retired public taxonomy term. */
export function isForbiddenPublicDisplayText(value: string | null | undefined) {
  return typeof value === "string" && hasForbiddenPublicText(value)
}
