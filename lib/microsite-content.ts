import type { Deal, PartnerRewardMilestone } from "./admin-data"
import { isMicrositeDealAvailable } from "./microsite-deals"

export type MicrositeContentLanguage = "de" | "en"

const NON_PUBLIC_TOP_DEAL_TYPES = new Set([
  "welcome",
  "comeback",
  "birthday",
  "streak",
  "challenge",
  "bonus_stamp",
])

export function getMicrositePublicDeals(
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
      !NON_PUBLIC_TOP_DEAL_TYPES.has(dealType) &&
      discountType !== "bonus_stamp"
    )
  })
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
  >,
  language: MicrositeContentLanguage = "de",
) {
  const dealType = deal.type?.trim().toLowerCase() || ""
  const discountType = deal.discount_type?.trim().toLowerCase() || dealType
  const minimumSpend =
    typeof deal.min_spend === "number" && Number.isFinite(deal.min_spend)
      ? ` ${language === "en" ? "from" : "ab"} ${formatEuroAmount(deal.min_spend, language)} ${language === "en" ? "minimum spend" : "Einkaufswert"}`
      : ""

  if (dealType === "two_for_one" || discountType === "2for1") {
    return deal.reward_item?.trim() ||
      (language === "en" ? "2-for-1 benefit" : "2 für 1 Vorteil")
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
  deal: Pick<Deal, "customer_description" | "terms" | "type" | "discount_type" | "discount_value" | "reward_item" | "benefit_count" | "min_spend">,
  language: MicrositeContentLanguage = "de",
) {
  return (
    deal.customer_description?.trim() ||
    deal.terms?.trim() ||
    micrositeDealTitle(deal, language)
  )
}

export function micrositeDealDetails(
  deal: Pick<Deal, "terms" | "min_spend">,
  language: MicrositeContentLanguage = "de",
) {
  const details = [deal.terms?.trim()]

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
  return (
    milestone.customer_description?.trim() ||
    milestone.terms?.trim() ||
    micrositeStampRewardTitle(milestone, language)
  )
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
