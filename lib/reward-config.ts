export const dealTypeOptions = [
  { value: "two_for_one", label: "2-for-1" },
  { value: "welcome", label: "Welcome reward" },
  { value: "comeback", label: "Duration / Comeback bonus" },
  { value: "happy_hour", label: "Happy Hour deal" },
  { value: "permanent_discount", label: "Permanent fallback discount" },
  { value: "limited_drop", label: "Limited Deal Drop" },
  { value: "birthday", label: "Birthday reward" },
  { value: "free_item", label: "Free item deal" },
  { value: "discount", label: "Selectable discount" },
  { value: "bonus_stamp", label: "Automatic bonus stamp" },
  { value: "streak", label: "Streak reward" },
  { value: "challenge", label: "Challenge reward" },
] as const

export const discountTypeOptions = [
  { value: "none", label: "No direct reward" },
  { value: "fixed", label: "Fixed EUR discount" },
  { value: "percent", label: "Percentage discount" },
  { value: "item", label: "Free item" },
  { value: "bonus_stamp", label: "Bonus stamp" },
  { value: "2for1", label: "2-for-1" },
] as const

export const dealDropDiscountTypeOptions = [
  { value: "item", label: "Free item" },
  { value: "fixed", label: "Fixed EUR discount" },
  { value: "percent", label: "Percentage discount" },
  { value: "2for1", label: "2-for-1" },
] as const

export const benefitCategoryOptions = [
  {
    value: "direct_selectable",
    label: "User selects before visit",
    hint: "User must choose this before the QR scan. Only one direct deal can be redeemed per visit.",
  },
  {
    value: "automatic_background",
    label: "Applies automatically during scan",
    hint: "No activation button. The system applies this automatically during scan if eligible.",
  },
  {
    value: "automatic_fallback",
    label: "Applies only if no selected deal",
    hint: "Applies automatically only if the user has not selected another direct deal.",
  },
] as const

export const audienceOptions = [
  { value: "free", label: "Free users" },
  { value: "premium", label: "Premium users" },
  { value: "both", label: "Free + Premium" },
  { value: "free_trial_only", label: "Free trial only" },
] as const

export const milestoneAudienceOptions = audienceOptions.filter(
  (option) => option.value !== "free_trial_only",
)

export const rewardTypeOptions = [
  { value: "item", label: "Item" },
  { value: "fixed", label: "Fixed amount" },
  { value: "percent", label: "Percent" },
  { value: "2for1", label: "2-for-1" },
  { value: "bonus_stamp", label: "Bonus stamp" },
] as const

export const partnerStaffRoleOptions = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
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
