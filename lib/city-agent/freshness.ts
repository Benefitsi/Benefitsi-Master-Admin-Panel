export const cityAgentFreshnessTtls = {
  opening_hours: 7,
  prices: 14,
  phone: 30,
  website: 30,
  event_dates: 1,
  route_status: 1,
  tourist_information: 30,
  service_information: 7,
} as const

export type FreshnessState = "CURRENT" | "DUE" | "STALE" | "UNKNOWN"

export function freshnessState(input: {
  lastVerifiedAt?: string | null
  ttlDays: number
  now?: Date
}): FreshnessState {
  if (!input.lastVerifiedAt) return "UNKNOWN"
  const verified = new Date(input.lastVerifiedAt).getTime()
  if (!Number.isFinite(verified)) return "UNKNOWN"
  const age = (input.now ?? new Date()).getTime() - verified
  const ttl = Math.max(1, input.ttlDays) * 24 * 60 * 60 * 1000
  if (age >= ttl) return "STALE"
  if (age >= ttl * 0.8) return "DUE"
  return "CURRENT"
}

export function freshnessPercent(current: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
}
