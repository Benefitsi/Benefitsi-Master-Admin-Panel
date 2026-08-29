export type SourceFetchMetrics = {
  attempted: number
  succeeded: number
  failed: number
  successRate: number | null
}

function nonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * Builds the persisted source-fetch counters for one City-Agent run.
 * A run with no source fetch has no meaningful rate, so its rate is null.
 */
export function createSourceFetchMetrics(
  attempted: number,
  succeeded: number,
  failed: number,
): SourceFetchMetrics {
  const safeAttempted = nonNegativeInteger(attempted)
  const safeSucceeded = nonNegativeInteger(succeeded)
  const safeFailed = nonNegativeInteger(failed)

  return {
    attempted: safeAttempted,
    succeeded: safeSucceeded,
    failed: safeFailed,
    successRate: safeAttempted > 0
      ? Number((safeSucceeded / safeAttempted).toFixed(4))
      : null,
  }
}
