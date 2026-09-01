export const dealTypeOptions = [
  { value: "two_for_one", label: "2 für 1" },
  { value: "welcome", label: "Willkommen" },
  { value: "comeback", label: "Zeitbonus" },
  { value: "happy_hour", label: "Happy Hour" },
  { value: "permanent_discount", label: "Dauerrabatt" },
  { value: "limited_drop", label: "Deal Drop" },
  { value: "birthday", label: "Geburtstag" },
  { value: "free_item", label: "Gratisartikel" },
  { value: "discount", label: "Rabatt" },
  { value: "bonus_stamp", label: "Bonusstempel" },
  { value: "streak", label: "Streak-Bonus" },
  { value: "challenge", label: "Challenge-Bonus" },
] as const

export const discountTypeOptions = [
  { value: "none", label: "Kein direkter Vorteil" },
  { value: "fixed", label: "Fester €-Rabatt" },
  { value: "percent", label: "Prozentualer Rabatt" },
  { value: "item", label: "Gratisartikel" },
  { value: "bonus_stamp", label: "Bonusstempel" },
  { value: "2for1", label: "2 für 1" },
] as const

export const dealDropDiscountTypeOptions = [
  { value: "item", label: "Gratisartikel" },
  { value: "fixed", label: "Fester €-Rabatt" },
  { value: "percent", label: "Prozentualer Rabatt" },
  { value: "2for1", label: "2 für 1" },
] as const

export const benefitCategoryOptions = [
  {
    value: "direct_selectable",
    label: "Vor dem Besuch auswählen",
    hint: "Nutzer wählen diesen Vorteil vor dem QR-Scan aus. Pro Besuch ist nur ein direkter Vorteil einlösbar.",
  },
  {
    value: "automatic_background",
    label: "Automatisch beim Scan",
    hint: "Keinen Aktivierungsbutton anzeigen. Das System wendet den Vorteil beim Scan automatisch an, wenn die Person berechtigt ist.",
  },
  {
    value: "automatic_fallback",
    label: "Automatisch als Fallback",
    hint: "Gilt automatisch nur, wenn kein anderer direkter Vorteil ausgewählt wurde.",
  },
] as const

export const audienceOptions = [
  { value: "free", label: "Free" },
  { value: "premium", label: "Premium" },
  { value: "both", label: "Free und Premium" },
] as const

export const milestoneAudienceOptions = audienceOptions

export const rewardTypeOptions = [
  { value: "item", label: "Artikel" },
  { value: "fixed", label: "Fester Betrag" },
  { value: "percent", label: "Prozent" },
  { value: "2for1", label: "2 für 1" },
  { value: "bonus_stamp", label: "Bonusstempel" },
] as const

export const partnerStaffRoleOptions = [
  { value: "admin", label: "Admin" },
  { value: "scanner", label: "Scanner" },
] as const

export const weekdayOptions = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
] as const

export const dealDropWeekdayOptions = [
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
  { value: 6, label: "Sat", fullLabel: "Saturday" },
  { value: 7, label: "Sun", fullLabel: "Sunday" },
] as const

export const rewardTrackTargetOptions = [
  { value: "base", label: "Base" },
  { value: "premium", label: "Premium" },
  { value: "all", label: "All" },
] as const

export type DealType = (typeof dealTypeOptions)[number]["value"]
export type DiscountType = (typeof discountTypeOptions)[number]["value"]
export type BenefitCategory = (typeof benefitCategoryOptions)[number]["value"]
export type Audience = (typeof audienceOptions)[number]["value"]
export type MilestoneAudience = (typeof milestoneAudienceOptions)[number]["value"]
export type RewardType = (typeof rewardTypeOptions)[number]["value"]
export type PartnerStaffRole = (typeof partnerStaffRoleOptions)[number]["value"]
export type DealDropWeekday = (typeof dealDropWeekdayOptions)[number]["value"]

export const DEFAULT_AUDIENCE: Audience = "both"
export const DEFAULT_REWARD_TRACK_TARGET = "base"
export const DEFAULT_TIMEZONE = "Europe/Berlin"
export const DEFAULT_SELECTION_EXPIRES_MINUTES = 30
export const MAX_STAMP_CARD_STAMPS = 10
export const DEFAULT_DEAL_DROP_PRIORITY = 100
export const DEFAULT_DEAL_DROP_WEEKDAYS: DealDropWeekday[] = [1, 2, 3, 4, 5, 6, 7]

export function activationRequiredForCategory(category: string) {
  return category === "direct_selectable"
}

export function inferBenefitCategory(
  type: string,
  discountType: string,
): BenefitCategory {
  if (type === "permanent_discount") {
    return "automatic_fallback"
  }

  if (discountType === "bonus_stamp" || type === "bonus_stamp") {
    return "automatic_background"
  }

  if (type === "happy_hour" || type === "limited_drop") {
    return "direct_selectable"
  }

  if (
    type === "welcome" ||
    type === "comeback" ||
    type === "birthday" ||
    type === "streak" ||
    type === "challenge"
  ) {
    return discountType === "bonus_stamp"
      ? "automatic_background"
      : "direct_selectable"
  }

  return "direct_selectable"
}

export function normalizeBenefitCategory(
  type: string,
  discountType: string,
  category: string,
): BenefitCategory {
  const inferred = inferBenefitCategory(type, discountType)

  if (
    type === "permanent_discount" ||
    type === "happy_hour" ||
    type === "limited_drop" ||
    type === "bonus_stamp" ||
    type === "two_for_one" ||
    type === "free_item" ||
    type === "discount" ||
    type === "welcome" ||
    type === "comeback" ||
    type === "birthday" ||
    type === "streak" ||
    type === "challenge" ||
    discountType === "bonus_stamp"
  ) {
    return inferred
  }

  return isBenefitCategory(category) ? category : inferred
}

export function isDealType(value: string): value is DealType {
  return dealTypeOptions.some((option) => option.value === value)
}

export function isDiscountType(value: string): value is DiscountType {
  return discountTypeOptions.some((option) => option.value === value)
}

export function isBenefitCategory(value: string): value is BenefitCategory {
  return benefitCategoryOptions.some((option) => option.value === value)
}

export function isAudience(value: string): value is Audience {
  return audienceOptions.some((option) => option.value === value)
}

export function isMilestoneAudience(value: string): value is MilestoneAudience {
  return milestoneAudienceOptions.some((option) => option.value === value)
}

export function isRewardType(value: string): value is RewardType {
  return rewardTypeOptions.some((option) => option.value === value)
}

export function isPartnerStaffRole(value: string): value is PartnerStaffRole {
  return partnerStaffRoleOptions.some((option) => option.value === value)
}
