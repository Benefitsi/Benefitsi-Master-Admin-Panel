import type { Deal, PartnerRewardMilestone } from "./admin-data"
import {
  isMicrositeDealAvailable,
  isMicrositeTopDeal,
} from "./microsite-deals"
import {
  benefitTaxonomyLabel,
  formatBenefitTitle,
  isForbiddenPublicDisplayText,
} from "./benefit-taxonomy"

export type MicrositeContentLanguage = "de" | "en"

const NON_PUBLIC_TOP_DEAL_TYPES = new Set([
  "welcome",
  "comeback",
  "birthday",
  "streak",
  "challenge",
  "bonus_stamp",
])

export function normalizeMicrositePublicText(value: string | null | undefined) {
  if (!value?.trim()) return ""
  const protectedTerms: Array<[RegExp, string]> = [
    [/\bwillkommensbonus\b/giu, "__BENEFIT_WELCOME_BONUS__"],
    [/\bwillkommensdeal\b/giu, "__BENEFIT_WELCOME_DEAL__"],
    [/\bcomeback[- ]bonus\b/giu, "__BENEFIT_COMEBACK_BONUS__"],
    [/\bcomeback[- ]deal\b/giu, "__BENEFIT_COMEBACK_DEAL__"],
    [/\bdeal drops?\b/giu, "__BENEFIT_DEAL_DROP__"],
    [/\bstreak[- ]bonus\b/giu, "__BENEFIT_STREAK_BONUS__"],
    [/\bchallenge[- ]bonus\b/giu, "__BENEFIT_CHALLENGE_BONUS__"],
  ]
  let normalized = value.trim().normalize("NFKC").replace(/[‐‑‒–—―]/gu, "-")

  for (const [pattern, token] of protectedTerms) {
    normalized = normalized.replace(pattern, token)
  }

  normalized = normalized
    .replace(/\b2\s*[-–]?\s*for\s*[-–]?\s*1\b/gi, "2 für 1")
    .replace(/\b(?:gratis|free)[- ]?rewards?\s*[:\-–]?\s*/gi, "Gratis ")
    .replace(/\b(?:stamp|stempel)[- ]?rewards?\b/gi, "Stempelbelohnung")
    .replace(/\bstempel[- ]?belohnung\b/gi, "Stempelbelohnung")
    .replace(/\bwillkommens(?:vorteile?|deals?)\b/gi, "Willkommensdeal")
    .replace(/\bwillkommen(?=\s*:)/giu, "Willkommensdeal")
    .replace(/\bcomeback[- ]?(?:vorteile?|deals?)\b/gi, "Comeback-Deal")
    .replace(/\bcomeback[- ]?bonus\b/gi, "Comeback-Bonus")
    .replace(/\bgeburtstags(?:deal|vorteile?)\b/gi, "Geburtstag")
    .replace(/\bstreak[- ]?(?:boni|bonus)\b/gi, "Streak-Bonus")
    .replace(/\bchallenge[- ]?(?:boni|bonus)\b/gi, "Challenge-Bonus")
    .replace(/\bvorteile?\s+drop\b/gi, "Deal Drop")
    .replace(/\b(?:top[- ]?(?:deal|vorteil)|hauptdeal|daily[- ]?deal|2[- ]?für[- ]?1[- ]?deal|rabattvorteil|dauervorteil|automatischer basisrabatt|bonus[- ]stempel|streak bonus)\b/gi, "Vorteil")
    .replace(/\bdeal\b(?!\s+drop\b)/gi, "Vorteil")
    .replace(/\brewards\b/gi, "Belohnungen")
    .replace(/\breward\b/gi, "Belohnung")
    .replace(/[ \t]{2,}/g, " ")
    .trim()

  return normalized
    .replaceAll("__BENEFIT_WELCOME_BONUS__", "Willkommensbonus")
    .replaceAll("__BENEFIT_WELCOME_DEAL__", "Willkommensdeal")
    .replaceAll("__BENEFIT_COMEBACK_BONUS__", "Comeback-Bonus")
    .replaceAll("__BENEFIT_COMEBACK_DEAL__", "Comeback-Deal")
    .replaceAll("__BENEFIT_DEAL_DROP__", "Deal Drop")
    .replaceAll("__BENEFIT_STREAK_BONUS__", "Streak-Bonus")
    .replaceAll("__BENEFIT_CHALLENGE_BONUS__", "Challenge-Bonus")
}

function normalizeRewardItem(value: string | null | undefined) {
  return (value?.trim() || "")
    .replace(/^(?:Gratisartikel|Free item)\s*[:\-–]?\s*/i, "")
    .replace(/^(?:Gratis|Free)\s+/i, "")
    .trim()
}

export function getMicrositePublicDeals(
  deals: Deal[],
  now = Date.now(),
) {
  return deals
    .filter((deal) => {
      if (!isMicrositeDealAvailable(deal, now)) {
        return false
      }

      const dealType = deal.type?.trim().toLowerCase() || ""
      const discountType = deal.discount_type?.trim().toLowerCase() || ""

      return (
        !NON_PUBLIC_TOP_DEAL_TYPES.has(dealType) &&
        discountType !== "bonus_stamp"
      )
    })
    .sort((first, second) =>
      Number(isMicrositeTopDeal(second)) - Number(isMicrositeTopDeal(first)),
    )
}

export function getMicrositeWelcomeDeals(
  deals: Deal[],
  now = Date.now(),
) {
  return deals.filter(
    (deal) =>
      isMicrositeDealAvailable(deal, now) &&
      deal.type?.trim().toLowerCase() === "welcome",
  )
}

export function getMicrositeStampDeals(
  deals: Deal[],
  now = Date.now(),
) {
  return deals.filter((deal) => {
    if (!isMicrositeDealAvailable(deal, now)) {
      return false
    }

    const dealType = deal.type?.trim().toLowerCase() || ""
    const discountType = deal.discount_type?.trim().toLowerCase() || ""

    return (
      dealType === "bonus_stamp" ||
      (discountType === "bonus_stamp" && dealType !== "welcome")
    )
  })
}

export function micrositeDealTypeLabel(
  deal: Partial<Pick<Deal, "type" | "discount_type" | "reward_format" | "metadata" | "trigger_key" | "campaign_type" | "activation_mode" | "benefit_category">>,
  language: MicrositeContentLanguage = "de",
) {
  return benefitTaxonomyLabel(toTaxonomyInput(deal), language)
}

export function getMicrositeStampRewards(
  milestones: PartnerRewardMilestone[],
) {
  const trackOrder = new Map([
    ["base", 0],
    ["all", 1],
    ["premium", 2],
  ])

  return milestones
    .filter(
      (milestone) =>
        milestone.active !== false &&
        typeof milestone.required_stamps === "number" &&
        milestone.required_stamps > 0,
    )
    .map((milestone, index) => ({ milestone, index }))
    .sort((first, second) => {
      const stampDifference =
        (first.milestone.required_stamps || 0) -
        (second.milestone.required_stamps || 0)

      if (stampDifference !== 0) {
        return stampDifference
      }

      const firstTrack = trackOrder.get(
        first.milestone.reward_track_target || "",
      )
      const secondTrack = trackOrder.get(
        second.milestone.reward_track_target || "",
      )

      if (firstTrack !== undefined && secondTrack !== undefined) {
        return firstTrack - secondTrack
      }

      return first.index - second.index
    })
    .map(({ milestone }) => milestone)
}

export function micrositeDealTitle(
  deal: Partial<Pick<
    Deal,
    | "type"
    | "discount_type"
    | "discount_value"
    | "reward_item"
    | "benefit_count"
    | "customer_description"
    | "min_spend"
    | "reward_format"
    | "trigger_key"
    | "campaign_type"
    | "activation_mode"
    | "benefit_category"
  >> &
    Partial<Pick<Deal, "display_title" | "public_title">> & {
    public_title?: string | null
  },
  language: MicrositeContentLanguage = "de",
) {
  const minimumSpend =
    typeof deal.min_spend === "number" && Number.isFinite(deal.min_spend)
      ? ` ${language === "en" ? "from" : "ab"} ${formatEuroAmount(deal.min_spend, language)} ${language === "en" ? "minimum spend" : "Einkaufswert"}`
      : ""
  const title = formatBenefitTitle(
    toTaxonomyInput(deal),
    language,
  )

  if (minimumSpend && !title.includes(`${formatEuroAmount(deal.min_spend!, language)} ${language === "en" ? "minimum spend" : "Einkaufswert"}`)) {
    return `${title}${minimumSpend}`
  }
  return title
}

export function micrositeDealDescription(
  deal: Pick<
    Deal,
    | "customer_description"
    | "terms"
    | "type"
    | "discount_type"
    | "discount_value"
    | "reward_item"
    | "benefit_count"
    | "min_spend"
  > &
    Partial<Pick<Deal, "display_title" | "display_subtitle" | "public_subtitle">>,
  language: MicrositeContentLanguage = "de",
) {
  if (deal.public_subtitle !== null && deal.public_subtitle !== undefined) {
    return normalizeMicrositePublicText(deal.public_subtitle)
  }

  if (deal.display_subtitle !== null && deal.display_subtitle !== undefined) {
    return normalizeMicrositePublicText(deal.display_subtitle)
  }

  return (
    normalizeMicrositePublicText(deal.customer_description) ||
    normalizeMicrositePublicText(deal.terms) ||
    micrositeDealTitle(deal, language)
  )
}

export function micrositeDealDetails(
  deal: Pick<Deal, "terms" | "min_spend"> &
    Partial<
      Pick<
        Deal,
        | "type"
        | "happy_hour_start"
        | "happy_hour_end"
        | "valid_weekdays"
        | "weekdays"
      >
    >,
  language: MicrositeContentLanguage = "de",
) {
  const details: string[] = []
  const dealType = deal.type?.trim().toLowerCase() || ""
  const terms = deal.terms?.trim()
  const happyHourSchedule =
    dealType === "happy_hour"
      ? micrositeHappyHourSchedule(deal, language)
      : ""

  if (happyHourSchedule) {
    details.push(happyHourSchedule)
    const supplementalTerms = removeHappyHourScheduleTerms(terms)
    if (supplementalTerms) {
      details.push(supplementalTerms)
    }
  } else if (terms) {
    details.push(normalizeMicrositePublicText(terms))
  }

  if (isFiniteNumber(deal.min_spend)) {
    details.push(
      language === "en"
        ? `From ${formatEuroAmount(deal.min_spend, language)} minimum spend`
        : `Ab ${formatEuroAmount(deal.min_spend, language)} Einkaufswert`,
    )
  }

  return Array.from(new Set(details.filter((detail): detail is string => Boolean(detail))))
}

export function micrositeWelcomeTitle(
  deal: Pick<Deal, "discount_type" | "benefit_count" | "type" | "discount_value" | "reward_item" | "customer_description" | "min_spend">,
  language: MicrositeContentLanguage = "de",
) {
  const discountType = deal.discount_type?.trim().toLowerCase() || ""

  if (discountType === "bonus_stamp") {
    const count = deal.benefit_count ?? 1
    return language === "en"
      ? `Directly ${count} stamps on the first visit.`
      : `Direkt ${count} Stempel beim ersten Besuch.`
  }

  return micrositeDealTitle(deal, language)
}

export function micrositeStampRewardTitle(
  milestone: Pick<
    PartnerRewardMilestone,
    | "reward_type"
    | "discount_type"
    | "discount_value"
    | "reward_item"
    | "title"
    | "customer_description"
  >,
  language: MicrositeContentLanguage = "de",
) {
  const rawTitle = milestone.title?.trim() || ""
  const explicitTitle = normalizeMicrositePublicText(rawTitle)
  const rewardType =
    milestone.reward_type?.trim().toLowerCase() ||
    milestone.discount_type?.trim().toLowerCase() ||
    ""

  // The configured reward format is authoritative. This prevents a legacy
  // free-form title (or the raw reward item) from replacing a concrete,
  // canonical public title on the microsite.
  if (/(?:stamp|stempel)/i.test(rewardType)) {
    return language === "en" ? "Stamp reward" : "Stempelbelohnung"
  }

  if (rewardType === "item" && normalizeRewardItem(milestone.reward_item)) {
    return `${language === "en" ? "Free" : "Gratis"} ${normalizeRewardItem(milestone.reward_item)}`
  }

  if (rewardType === "fixed" && isFiniteNumber(milestone.discount_value)) {
    return `${formatEuroAmount(milestone.discount_value, language)} ${language === "en" ? "discount" : "Rabatt"}`
  }

  if (rewardType === "percent" && isFiniteNumber(milestone.discount_value)) {
    return `${formatNumber(milestone.discount_value, language)} % ${language === "en" ? "discount" : "Rabatt"}`
  }

  if (rewardType === "bonus_stamp" && isFiniteNumber(milestone.discount_value)) {
    return `+${milestone.discount_value} ${language === "en" ? "bonus stamps" : "Bonusstempel"}`
  }

  if (rewardType === "2for1") {
    const item = normalizeRewardItem(milestone.reward_item)
    return item
      ? `${language === "en" ? "2-for-1" : "2 für 1"} ${item}`
      : language === "en"
        ? "2-for-1"
        : "2 für 1"
  }

  if (explicitTitle && !isForbiddenPublicDisplayText(rawTitle)) {
    return explicitTitle
  }

  return (
    normalizeMicrositePublicText(milestone.customer_description) ||
    (language === "en" ? "Stamp reward" : "Stempelbelohnung")
  )
}

export function micrositeStampRewardDescription(
  milestone: Pick<PartnerRewardMilestone, "customer_description" | "terms" | "title" | "reward_item" | "reward_type" | "discount_type" | "discount_value">,
  language: MicrositeContentLanguage = "de",
) {
  // The App's DiscoverRewardMilestone DTO intentionally contains only the
  // structured reward fields. Do not surface free-text milestone copy here:
  // it can contradict the configured stamp threshold (for example, 5 vs. 6).
  void milestone
  void language
  return ""
}

export function micrositeRewardTrackLabel(
  milestone: Pick<PartnerRewardMilestone, "reward_track_target" | "audience">,
  language: MicrositeContentLanguage = "de",
) {
  const target = milestone.reward_track_target?.trim().toLowerCase()
  const audience = milestone.audience?.trim().toLowerCase()

  if (target === "premium" || audience === "premium") {
    return language === "en" ? "Premium" : "Premium"
  }

  if (target === "base" && audience === "free") {
    return language === "en" ? "Standard" : "Standard"
  }

  return ""
}

export function micrositeWelcomeStampCount(
  deal: Pick<Deal, "discount_type" | "benefit_count">,
) {
  return deal.discount_type?.trim().toLowerCase() === "bonus_stamp"
    ? Math.max(1, deal.benefit_count ?? 1)
    : 1
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function toTaxonomyInput(
  deal: Partial<Pick<Deal, "type" | "discount_type" | "discount_value" | "reward_item" | "benefit_count" | "reward_format" | "trigger_key" | "campaign_type" | "activation_mode" | "benefit_category" | "metadata">> & {
    display_title?: string | null
    public_title?: string | null
  },
) {
  return {
    type: deal.type,
    discount_type: deal.discount_type,
    discount_value: deal.discount_value,
    reward_item: deal.reward_item,
    benefit_count: deal.benefit_count,
    reward_format: deal.reward_format,
    trigger_key: deal.trigger_key,
    campaign_type: deal.campaign_type,
    activation_mode: deal.activation_mode,
    benefit_category: deal.benefit_category,
    metadata:
      deal.metadata && typeof deal.metadata === "object" && !Array.isArray(deal.metadata)
        ? (deal.metadata as Record<string, unknown>)
        : null,
    public_title: deal.public_title,
    display_title: deal.display_title,
  }
}

function formatNumber(value: number, language: MicrositeContentLanguage) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "de-DE", {
    maximumFractionDigits: 2,
  }).format(value)
}

function formatEuroAmount(value: number, language: MicrositeContentLanguage) {
  return `${formatNumber(value, language)} €`
}

function micrositeHappyHourSchedule(
  deal: Partial<
    Pick<
      Deal,
      | "happy_hour_start"
      | "happy_hour_end"
      | "valid_weekdays"
      | "weekdays"
    >
  >,
  language: MicrositeContentLanguage,
) {
  const start = formatMicrositeTime(deal.happy_hour_start)
  const end = formatMicrositeTime(deal.happy_hour_end)
  const weekdays = resolveMicrositeWeekdays(deal)

  if (!start || !end || !weekdays.length) {
    return ""
  }

  const weekdaySummary = formatMicrositeWeekdaySummary(weekdays, language)
  return weekdaySummary ? `${weekdaySummary} ${start}-${end}` : `${start}-${end}`
}

function resolveMicrositeWeekdays(
  deal: Partial<Pick<Deal, "valid_weekdays" | "weekdays">>,
) {
  const direct = parseMicrositeWeekdays(deal.valid_weekdays)
  return direct.length ? direct : parseMicrositeWeekdays(deal.weekdays)
}

function parseMicrositeWeekdays(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const labels: Record<string, number> = {
    monday: 1,
    mon: 1,
    montag: 1,
    mo: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    dienstag: 2,
    di: 2,
    wednesday: 3,
    wed: 3,
    mittwoch: 3,
    mi: 3,
    thursday: 4,
    thu: 4,
    thurs: 4,
    donnerstag: 4,
    do: 4,
    friday: 5,
    fri: 5,
    freitag: 5,
    fr: 5,
    saturday: 6,
    sat: 6,
    samstag: 6,
    sa: 6,
    sunday: 7,
    sun: 7,
    sonntag: 7,
    so: 7,
  }

  return Array.from(
    new Set(
      value.flatMap((entry) => {
        if (typeof entry === "number" && Number.isInteger(entry)) {
          return entry >= 1 && entry <= 7 ? [entry] : []
        }

        if (typeof entry !== "string") {
          return []
        }

        const normalized = entry.trim().toLowerCase()
        if (/^[1-7]$/.test(normalized)) {
          return [Number(normalized)]
        }

        return labels[normalized] ? [labels[normalized]] : []
      }),
    ),
  ).sort((first, second) => first - second)
}

function formatMicrositeWeekdaySummary(
  weekdays: number[],
  language: MicrositeContentLanguage,
) {
  if (weekdays.length === 5 && weekdays.every((weekday, index) => weekday === index + 1)) {
    return language === "en" ? "Mon-Fri" : "Mo-Fr"
  }

  if (weekdays.length === 2 && weekdays[0] === 6 && weekdays[1] === 7) {
    return language === "en" ? "Sat-Sun" : "Sa-So"
  }

  const labels =
    language === "en"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

  return weekdays.map((weekday) => labels[weekday - 1]).join(", ")
}

function formatMicrositeTime(value: string | null | undefined) {
  const raw = value?.trim() || ""
  const match = /^(\d{1,2}):(\d{2})/.exec(raw)
  if (!match) {
    return raw
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return raw
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function removeHappyHourScheduleTerms(terms: string | undefined) {
  if (!terms) {
    return ""
  }

  return terms
    .replace(
      /(?:\b(?:täglich|jeden\s+tag|every\s+day|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?(?:von|from)?\s*\d{1,2}:\d{2}\s*(?:bis|to|-|–|—)\s*\d{1,2}:\d{2}\s*(?:uhr|hours?)?\s*(?:gültig|valid)/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .replace(/^\s*\.\s*/, "")
    .replace(/^[\s,;:·–—-]+|[\s,;:·–—-]+$/g, "")
    .trim()
}
