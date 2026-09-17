import type { CityAgentSourceRow } from "./contracts"

const M1_CADENCE_OWNER = "m1_daily_preflight"

export const AUTOMATIC_SOURCE_OWNER_FILTER =
  `parser_config->>cadence_owner.is.null,parser_config->>cadence_owner.neq.${M1_CADENCE_OWNER}`

export function selectDueAutomaticSources(
  sources: CityAgentSourceRow[],
  now: Date,
  maxSources: number,
) {
  return sources
    .filter(
      (source) =>
        source.parser_config?.cadence_owner !== M1_CADENCE_OWNER &&
        (!source.next_check_at ||
          new Date(source.next_check_at).getTime() <= now.getTime()),
    )
    .slice(0, maxSources)
}
