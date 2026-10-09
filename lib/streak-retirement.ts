/** Partner visit series are retired; historical records remain in storage. */
export function isRetiredStreakDeal(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const deal = value as Record<string, unknown>
  const key = (v: unknown) => typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : ""
  if ([deal.type, deal.trigger_key, deal.campaign_type, deal.triggerKey, deal.campaignType].some(v => ["streak", "streak_bonus"].includes(key(v)))) return true
  const metadata = deal.metadata
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && key((metadata as Record<string, unknown>).streak_mode) === "calendar_frequency")
}

/** Reconcile the retired stock copy without changing event or chart series. */
export function reconcileRetiredStreakCopy(value: string): string {
  return value.replace(/Zeitbonus,?\s*Streaks?\s*&\s*Aktionen/gi, "Zeitbonus & Aktionen")
}
export function reconcileMicrositeElementText(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith("content.ecosystem.streaks."))
    .map(([key, text]) => [key, reconcileRetiredStreakCopy(text)]))
}
