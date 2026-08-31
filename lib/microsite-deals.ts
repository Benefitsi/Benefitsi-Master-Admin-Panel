import type { Deal } from "./admin-data"

export function isMicrositeDealAvailable(
  deal: Deal,
  now = Date.now(),
) {
  if (deal.active !== true || deal.stock_remaining === 0) return false

  const startsAt = Date.parse(deal.valid_from || deal.starts_at || "")
  const endsAt = Date.parse(deal.valid_until || deal.ends_at || "")

  if (Number.isFinite(startsAt) && startsAt > now) return false
  if (Number.isFinite(endsAt) && endsAt < now) return false

  return true
}

export function isMicrositeTwoForOneDeal(deal: Deal) {
  if (!isMicrositeDealAvailable(deal)) return false

  const searchable = [
    deal.type,
    deal.discount_type,
    deal.benefit_category,
    deal.reward_item,
    deal.customer_description,
    deal.terms,
    JSON.stringify(deal.metadata || {}),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
  const explicitTwoForOne =
    /(?:2\s*(?:f\u00fcr|fur|for|x|:)\s*1|two\s+for\s+one|buy\s+one\s+get\s+one|\bbogo\b)/i.test(
      searchable,
    )
  const structuredBuyGet =
    /buy\s*(?:x|one)?\s*get\s*(?:y|one)?/.test(searchable) &&
    (deal.trigger_value === 1 || deal.benefit_count === 1)

  return explicitTwoForOne || structuredBuyGet
}
