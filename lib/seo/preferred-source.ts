import { validateSeoFetchUrl } from "./seo-url-policy.ts"

export type PreferredSourceResult =
  | { ok: true; domain: string; deeplink: string }
  | { ok: false; reason: string }

export function preferredSourceForDomain(value: string): PreferredSourceResult {
  const result = validateSeoFetchUrl(value)
  if (!result.ok) {
    return result
  }

  const domain = result.url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "")
  if (!domain || domain.includes(":")) {
    return { ok: false, reason: "Preferred Sources requires a public domain or subdomain." }
  }

  return {
    ok: true,
    domain,
    deeplink: `https://www.google.com/preferences/source?q=${encodeURIComponent(domain)}`,
  }
}
