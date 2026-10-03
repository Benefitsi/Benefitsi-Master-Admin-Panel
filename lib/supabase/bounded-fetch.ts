const QUERY_TIMEOUT_MS = 25_000
const UPLOAD_TIMEOUT_MS = 120_000

/** Bound server transports while retaining Supabase/route cancellation. */
export function createBoundedSupabaseFetch(fetcher: typeof fetch = fetch, timeoutMs = QUERY_TIMEOUT_MS): typeof fetch {
  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const timeout = AbortSignal.timeout(url.includes("/storage/v1/") ? Math.max(timeoutMs, UPLOAD_TIMEOUT_MS) : timeoutMs)
    const originalSignal = init?.signal ?? (input instanceof Request ? input.signal : null)
    return fetcher(input, {
      ...init,
      signal: originalSignal ? AbortSignal.any([originalSignal, timeout]) : timeout,
    })
  }
}
