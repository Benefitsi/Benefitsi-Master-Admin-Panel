import type { CityAgentSourceRow } from "./contracts"

/** Source-check age only. This never verifies or invalidates an entity's facts. */
export function sourceSnapshotFreshness(
  cadence: CityAgentSourceRow["cadence"],
  fetchedAt: string | null | undefined,
  now: Date,
  lastSuccessfulCheckAt?: string | null,
): "current" | "stale" | "unknown" {
  const hours = { hourly: 1, daily: 24, weekdays: 24, weekly: 168, biweekly: 336, monthly: 720, manual: null }[cadence]
  const checked = Date.parse(lastSuccessfulCheckAt ?? fetchedAt ?? "")
  const age = now.getTime() - checked
  if (hours == null || !Number.isFinite(age) || age < 0) return "unknown"
  return age >= hours * 3_600_000 ? "stale" : "current"
}
