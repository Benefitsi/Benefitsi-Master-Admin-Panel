import type { Deal, PartnerRewardMilestone } from "./admin-data"
import {
  isMicrositeDealAvailable,
  isMicrositeTopDeal,
} from "./microsite-deals"

export type MicrositeContentLanguage = "de" | "en"

const NON_PUBLIC_TOP_DEAL_TYPES = new Set([
  "welcome",
  "comeback",
  "birthday",
  "streak",
  "challenge",
  "bonus_stamp",
])

const MICROSITE_DEAL_TYPE_LABELS: Record<
  string,
  { de: string; en: string }
> = {
  two_for_one: { de: "2 für 1", en: "2-for-1" },
  happy_hour: { de: "Happy Hour", en: "Happy hour" },
  permanent_discount: { de: "Dauerrabatt", en: "Permanent discount" },
  limited_drop: { de: "Deal Drop", en: "Deal drop" },
  free_item: { de: "Gratisartikel", en: "Free item" },
  discount: { de: "Rabatt", en: "Discount" },
  bonus_stamp: { de: "Bonusstempel", en: "Bonus stamp" },
  streak: { de: "Streak-Bonus", en: "Streak reward" },
  challenge: { de: "Challenge", en: "Challenge" },
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
  deal: Pick<Deal, "type" | "discount_type" | "metadata">,
  language: MicrositeContentLanguage = "de",
) {
  const type = deal.type?.trim().toLowerCase() || ""
  const discountType = deal.discount_type?.trim().toLowerCase() || ""
  const isBonusStamp = discountType === "bonus_stamp" || type === "bonus_stamp"

  if (type === "welcome") {
    return language === "en"
      ? isBonusStamp
        ? "Welcome bonus"
        : "Welcome deal"
      : isBonusStamp
        ? "Willkommensbonus"
        : "Willkommensdeal"
  }

  if (type === "comeback") {
    const mode = micrositeDealMetadataString(deal.metadata, "bonus_mode")

    if (mode === "comeback_inactive") {
      return language === "en"
        ? isBonusStamp
          ? "Comeback bonus"
          : "Comeback deal"
        : isBonusStamp
          ? "Comeback-Bonus"
          : "Comeback-Deal"
    }

    return language === "en" ? "Time bonus" : "Zeitbonus"
  }

  if (type === "birthday") {
    return language === "en"
      ? isBonusStamp
        ? "Birthday bonus"
        : "Birthday deal"
      : isBonusStamp
        ? "Geburtstagsbonus"
        : "Geburtstagsdeal"
  }

  const labels = MICROSITE_DEAL_TYPE_LABELS[type]

  return labels?.[language] || deal.type?.trim() || (language === "en" ? "Benefit" : "Vorteil")
}

function micrositeDealMetadataString(
  metadata: Deal["metadata"],
  key: string,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return ""
  }

  const value = metadata[key]
  return typeof value === "string" ? value.trim() : ""
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
  deal: Pick<
    Deal,
    | "type"
    | "discount_type"
    | "discount_value"
    | "reward_item"
    | "benefit_count"
    | "customer_description"
    | "min_spend"
  > &
    Partial<Pick<Deal, "display_title">>,
  language: MicrositeContentLanguage = "de",
) {
  const explicitTitle = deal.display_title?.trim()
  if (explicitTitle) {
    return explicitTitle
  }

  const dealType = deal.type?.trim().toLowerCase() || ""
  const discountType = deal.discount_type?.trim().toLowerCase() || dealType
  const minimumSpend =
    typeof deal.min_spend === "number" && Number.isFinite(deal.min_spend)
      ? ` ${language === "en" ? "from" : "ab"} ${formatEuroAmount(deal.min_spend, language)} ${language === "en" ? "minimum spend" : "Einkaufswert"}`
      : ""

  if (dealType === "two_for_one" || discountType === "2for1") {
    const rewardItem = deal.reward_item?.trim()
    const prefix = language === "en" ? "2-for-1" : "2 für 1"
    return rewardItem ? `${prefix} ${rewardItem}` : prefix
  }

  if (discountType === "fixed" && isFiniteNumber(deal.discount_value)) {
    return `${formatEuroAmount(deal.discount_value, language)} ${language === "en" ? "discount" : "Rabatt"}${minimumSpend}`
  }

  if (discountType === "percent" && isFiniteNumber(deal.discount_value)) {
    return `${formatNumber(deal.discount_value, language)}% ${language === "en" ? "discount" : "Rabatt"}${minimumSpend}`
  }

  if (discountType === "bonus_stamp") {
    const count = deal.benefit_count ?? 1
    return `${language === "en" ? "+" : "+"}${count} ${language === "en" ? "bonus stamps" : "Bonusstempel"}`
  }

  return (
    deal.reward_item?.trim() ||
    deal.customer_description?.trim() ||
    (language === "en" ? "Partner benefit" : "Partner-Vorteil")
  )
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
    Partial<Pick<Deal, "display_title" | "display_subtitle">>,
  language: MicrositeContentLanguage = "de",
) {
  if (deal.display_subtitle !== null && deal.display_subtitle !== undefined) {
    return deal.display_subtitle.trim()
  }

  return (
    deal.customer_description?.trim() ||
    deal.terms?.trim() ||
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
    details.push(terms)
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
  const explicitTitle = milestone.title?.trim() || milestone.reward_item?.trim()

  if (explicitTitle) {
    return explicitTitle
  }

  const rewardType =
    milestone.reward_type?.trim().toLowerCase() ||
    milestone.discount_type?.trim().toLowerCase() ||
    ""

  if (rewardType === "fixed" && isFiniteNumber(milestone.discount_value)) {
    return `${formatEuroAmount(milestone.discount_value, language)} ${language === "en" ? "discount" : "Rabatt"}`
  }

  if (rewardType === "percent" && isFiniteNumber(milestone.discount_value)) {
    return `${formatNumber(milestone.discount_value, language)}% ${language === "en" ? "discount" : "Rabatt"}`
  }

  if (rewardType === "bonus_stamp" && isFiniteNumber(milestone.discount_value)) {
    return `+${milestone.discount_value} ${language === "en" ? "bonus stamps" : "Bonusstempel"}`
  }

  if (rewardType === "2for1") {
    return language === "en" ? "2-for-1 benefit" : "2 für 1 Vorteil"
  }

  return (
    milestone.customer_description?.trim() ||
    (language === "en" ? "Stamp reward" : "Stempel-Belohnung")
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
