const socialHosts: Record<string, string[]> = {
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com"],
}

export function parsePartnerSocialProfile(platform: string, input: string) {
  const value = input.trim()
  const hosts = socialHosts[platform]
  if (!value || !hosts) return null

  const looksLikeUrl = /^[a-z][a-z\d+.-]*:/i.test(value) || /^(?:www\.|m\.)?[a-z\d-]+\.[a-z]{2,}\//i.test(value)
  if (looksLikeUrl) {
    try {
      const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`)
      const host = url.hostname.replace(/^(www|m)\./, "")
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || !hosts.includes(host)) return null
      const segments = url.pathname.split("/").filter(Boolean)
      const handle = url.searchParams.get("id") || (platform === "youtube" && ["channel", "c", "user"].includes(segments[0]) ? segments[1] : segments[0])
      if (!handle) return null
      return { handle: decodeURIComponent(handle).replace(/^@+/, ""), url: url.toString() }
    } catch {
      return null
    }
  }

  const handle = value.replace(/^@+/, "").replace(/^\/+|\/+$/g, "")
  if (!handle || /[\s/?#\\]/.test(handle)) return null
  const prefix = platform === "youtube" || platform === "tiktok" ? "@" : ""
  const host = platform === "x" ? "x.com" : `www.${hosts[0]}`
  return { handle, url: `https://${host}/${prefix}${encodeURIComponent(handle)}` }
}
