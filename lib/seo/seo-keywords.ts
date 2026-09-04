const MAX_INITIAL_KEYWORDS = 12

const STOP_WORDS = new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "und",
  "oder",
  "in",
  "im",
  "am",
  "an",
  "auf",
  "bei",
  "für",
  "von",
  "zu",
])

function normalize(value: string) {
  return decodeURIComponent(value)
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9äöüß]+/gi, " ")
    .trim()
}

/**
 * Creates a bounded, transparent starting set for a target that has no
 * configured keywords yet. The set is intentionally URL-derived and must be
 * reviewed before a production rank provider is enabled.
 */
export function deriveInitialSeoKeywords(canonicalUrl: string): string[] {
  let url: URL
  try {
    url = new URL(canonicalUrl)
  } catch {
    return []
  }

  const pathPart = url.pathname
    .split("/")
    .map(normalize)
    .filter(Boolean)
    .at(-1)
  const hostPart = normalize(url.hostname.replace(/^www\./i, "").split(".")[0] ?? "")
  const phrase = pathPart || hostPart
  const tokens = phrase
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))

  return [...new Set([phrase, ...tokens, pathPart ? "" : hostPart].filter(Boolean))].slice(
    0,
    MAX_INITIAL_KEYWORDS,
  )
}
