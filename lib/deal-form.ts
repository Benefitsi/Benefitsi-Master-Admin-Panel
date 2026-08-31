export const dealRewardItemDiscountTypes = ["item", "2for1"] as const

export type DealFormDraft = {
  dealConcept: string
  discountType: string
  audience: string
  rewardItem: string
  customerDescription: string
  staffInstructions: string
  terms: string
  displayTitle: string
  displaySubtitle: string
  displaySubtitleAuto: boolean
}

export type DealPublicDisplayValues = {
  displayTitle: string | null
  displaySubtitle: string | null
}

export function discountTypeUsesRewardItem(
  discountType: string | null | undefined,
) {
  return (
    typeof discountType === "string" &&
    dealRewardItemDiscountTypes.includes(
      discountType as (typeof dealRewardItemDiscountTypes)[number],
    )
  )
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key)

  return typeof value === "string" ? value.trim() : ""
}

export function readDealPublicDisplayValues(
  formData: FormData,
  prefix = "",
): DealPublicDisplayValues {
  const displayTitle = formString(formData, `${prefix}display_title`) || null
  const displaySubtitleAuto =
    formData.get(`${prefix}display_subtitle_auto`) === "on"

  return {
    displayTitle,
    displaySubtitle:
      displaySubtitleAuto || !formData.has(`${prefix}display_subtitle`)
        ? null
        : formString(formData, `${prefix}display_subtitle`),
  }
}

/**
 * Captures the user-visible deal values that must survive a rejected save.
 * The snapshot intentionally contains text only; files and advanced settings
 * are left in the form controls themselves.
 */
export function readDealFormDraft(formData: FormData): DealFormDraft {
  return {
    dealConcept: formString(formData, "deal_concept") || formString(formData, "type"),
    discountType: formString(formData, "discount_type"),
    audience: formString(formData, "audience"),
    rewardItem: formString(formData, "reward_item"),
    customerDescription: formString(formData, "customer_description"),
    staffInstructions: formString(formData, "staff_instructions"),
    terms: formString(formData, "terms"),
    displayTitle: formString(formData, "display_title"),
    displaySubtitle: formString(formData, "display_subtitle"),
    displaySubtitleAuto: formData.get("display_subtitle_auto") === "on",
  }
}
