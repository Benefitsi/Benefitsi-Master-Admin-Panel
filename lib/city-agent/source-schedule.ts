import type { CityAgentSourceRow } from "./contracts"
import type { FetchFailure } from "./fetch-failure"
import { nextSourceCheckAt } from "./sources"

export function sourceUpdateAfterFetchFailure(
  source: Pick<CityAgentSourceRow, "cadence">,
  now: Date,
  failure: FetchFailure,
) {
  if (failure.infrastructure) {
    return {
      advanceSchedule: false as const,
      patch: {
        last_status: "error" as const,
        last_failure_at: now.toISOString(),
        last_failure_category: failure.category,
        updated_at: now.toISOString(),
      },
    }
  }

  return {
    advanceSchedule: true as const,
    patch: {
      last_checked_at: now.toISOString(),
      last_status: "error" as const,
      next_check_at: nextSourceCheckAt(source, now),
      updated_at: now.toISOString(),
    },
  }
}
