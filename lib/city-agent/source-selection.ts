import type { CityAgentSourceRow } from "./contracts"

export const AUTOMATIC_SOURCE_OWNER_FILTER =
  "parser_config->>cadence_owner.is.null"

export function selectDueAutomaticSources(
  sources: CityAgentSourceRow[],
  now: Date,
  maxSources: number,
) {
  return sources
    .filter(
      (source) =>
        source.active === true &&
        source.enabled === true &&
        source.cadence !== "manual" &&
        source.parser_config?.cadence_owner == null &&
        (!source.next_check_at ||
          new Date(source.next_check_at).getTime() <= now.getTime()),
    )
    .slice(0, maxSources)
}
