export type DisplayDeal = {
  id?: string; type?: string | null; campaign_type?: string | null;
  reward_format?: string | null; discount_type?: string | null;
  display_order?: number | null; active?: boolean | null;
  starts_at?: string | null; ends_at?: string | null; valid_from?: string | null; valid_until?: string | null;
  stock_total?: number | null; stock_remaining?: number | null; created_at?: string | null;
}

export function isActiveDisplayDrop(deal: DisplayDeal, now = new Date()) {
  if (!(deal.campaign_type === "deal_drop" || ["limited_drop", "deal_drop"].includes(deal.type || "")) || !deal.active) return false
  if (deal.stock_remaining != null && deal.stock_remaining <= 0) return false
  const start = deal.valid_from || deal.starts_at
  const end = deal.valid_until || deal.ends_at
  if (start && (!Number.isFinite(Date.parse(start)) || Date.parse(start) > now.getTime())) return false
  if (end && (!Number.isFinite(Date.parse(end)) || Date.parse(end) <= now.getTime())) return false
  return true
}

export function sortDealsForDisplay<T extends DisplayDeal>(deals: readonly T[], now = new Date()): T[] {
  const rank = (deal: T) => Number.isInteger(deal.display_order) && deal.display_order! >= 0 ? deal.display_order! : Infinity
  const two = (deal: T) => ["two_for_one", "2for1"].includes(deal.reward_format || "") || ["two_for_one", "2for1", "twoforone"].includes(deal.type || "") || ["2for1", "twoforone", "two_for_one"].includes(deal.discount_type || "")
  return [...deals].sort((a, b) => {
    const pinned = Number(isActiveDisplayDrop(b, now)) - Number(isActiveDisplayDrop(a, now))
    if (pinned) return pinned
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (rank(a) === Infinity && two(a) !== two(b)) return Number(two(b)) - Number(two(a))
    return (a.id || "").localeCompare(b.id || "")
  })
}
