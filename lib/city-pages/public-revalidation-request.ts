export type PublicRefreshResult = "ok" | "not_configured" | "failed"

/** Transport is injectable for offline contract tests; callers supply server configuration only. */
export async function requestPublicCityRevalidation(
  input: { citySlug: string; cityId: string },
  options: {
    secret?: string
    endpoint?: string
    vercelEnv?: string
    protectionBypassSecret?: string
    fetcher?: typeof fetch
  },
): Promise<PublicRefreshResult> {
  const secret = options.secret?.trim()
  const endpoint = options.endpoint?.trim()
  if (!secret || secret.length < 32 || !endpoint) return "not_configured"
  if (input.citySlug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.citySlug)) return "failed"
  try {
    const target = new URL(endpoint)
    if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash || target.pathname !== "/api/revalidate") return "failed"
    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }
    const bypass = options.protectionBypassSecret?.trim()
    if (options.vercelEnv === "preview" && target.hostname.endsWith(".vercel.app") && bypass) {
      headers["x-vercel-protection-bypass"] = bypass
    }
    const response = await (options.fetcher ?? fetch)(target.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ resource: "city", citySlug: input.citySlug }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
      redirect: "error",
    })
    if (!response.ok) return "failed"
    const result = await response.json() as { ok?: unknown }
    return result.ok === true ? "ok" : "failed"
  } catch {
    return "failed"
  }
}
