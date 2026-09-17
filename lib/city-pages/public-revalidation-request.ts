export type PublicRefreshResult = "ok" | "not_configured" | "failed"

/** Transport is injectable for offline contract tests; callers supply server configuration only. */
export async function requestPublicCityRevalidation(
  input: { citySlug: string; cityId: string },
  options: { secret?: string; baseUrl?: string; fetcher?: typeof fetch },
): Promise<PublicRefreshResult> {
  const secret = options.secret?.trim()
  if (!secret) return "not_configured"
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.citySlug)) return "failed"
  try {
    const base = new URL(options.baseUrl?.trim() || "https://benefitsi.de")
    if (base.protocol !== "https:" || base.username || base.password) return "failed"
    const response = await (options.fetcher ?? fetch)(new URL("/api/revalidate", base).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ resource: "city", citySlug: input.citySlug, cityId: input.cityId }),
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
