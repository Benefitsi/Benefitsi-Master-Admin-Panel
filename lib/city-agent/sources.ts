import { createHash } from "node:crypto"
import {
  cityAgentContentTypes,
  type CityAgentDiff,
  type CityAgentDraftReference,
  type CityAgentReviewDecision,
  type CityAgentSourceFacts,
  type CityAgentSourceRow,
} from "./contracts"

const DEFAULT_APPROVED_HOSTS = [
  "annweiler.de",
  "vg-annweiler.de",
  "suedlicheweinstrasse.de",
  "trifelsland.de",
  "gdke.rlp.de",
]

export const MAX_SOURCE_BYTES = 600_000
export const MAX_SOURCE_CHARS = 30_000

export type SourceFetchOptions = {
  now?: Date
  timeoutMs?: number
  maxBytes?: number
  maxChars?: number
  hermesTimeoutMs?: number
  fetchImpl?: typeof fetch
  citySlug?: string
  cityProfile?: string
  orchestratorProfile?: string
}

export type CityAgentResearchProvider = {
  name: "direct" | "hermes_city_agent" | "hermes_then_direct" | "hermes_required"
  fetchSource: (source: CityAgentSourceRow) => Promise<CityAgentSourceFacts>
}

export type CityAgentReviewResult = {
  decisions: CityAgentReviewDecision[]
  summary: string
}

export function approvedSourceHosts() {
  const configured = process.env.CITY_AGENT_APPROVED_SOURCE_HOSTS
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return configured?.length ? configured : DEFAULT_APPROVED_HOSTS
}

export function validateApprovedSourceUrl(raw: string, hosts = approvedSourceHosts()) {
  const url = new URL(raw)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("City-Agent-Quelle muss eine HTTPS-URL ohne Zugangsdaten sein.")
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    throw new Error("City-Agent-Quelle liegt nicht auf der freigegebenen Domain-Allowlist.")
  }
  return url
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
}

function cleanText(value: string) {
  return decodeEntities(value)
    .replace(/\s+/g, " ")
    .trim()
}

function stripMarkup(html: string) {
  return cleanText(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
}

function matches(html: string, expression: RegExp) {
  // `String.prototype.matchAll` requires the global flag. Callers may pass a
  // focused expression (for example the title matcher with only `i`), so add
  // `g` without mutating the caller's RegExp instance.
  const globalExpression = expression.global
    ? expression
    : new RegExp(expression.source, `${expression.flags}g`)
  return [...html.matchAll(globalExpression)]
    .map((match) => cleanText(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 24)
}

export function extractSourceFacts(
  html: string,
  metadata: Pick<CityAgentSourceFacts, "retrievedAt" | "finalUrl" | "httpStatus" | "contentType" | "truncated">,
  maxChars = MAX_SOURCE_CHARS,
): CityAgentSourceFacts {
  const title = matches(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i)[0] ?? ""
  const headings = matches(html, /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)
  const readableText = stripMarkup(html).slice(0, maxChars)
  const dateMentions = [...readableText.matchAll(/\b(?:\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/g)]
    .map((match) => match[0])
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 30)
  const canonicalPayload = JSON.stringify({ title, headings, readableText, dateMentions })
  const contentHash = createHash("sha256").update(canonicalPayload).digest("hex")

  return {
    ...metadata,
    title,
    headings,
    textPreview: readableText.slice(0, 4_000),
    dateMentions,
    contentHash,
  }
}

async function readBoundedBody(response: Response, maxBytes: number) {
  if (!response.body) {
    const text = await response.text()
    return { text: text.slice(0, maxBytes), truncated: text.length > maxBytes }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  while (true) {
    const next = await reader.read()
    if (next.done) break
    const remaining = maxBytes - total
    if (remaining <= 0) {
      truncated = true
      await reader.cancel()
      break
    }
    const chunk = next.value.slice(0, remaining)
    chunks.push(chunk)
    total += chunk.length
    if (chunk.length < next.value.length) {
      truncated = true
      await reader.cancel()
      break
    }
  }
  return {
    text: new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))),
    truncated,
  }
}

export async function fetchCitySource(
  source: CityAgentSourceRow,
  options: SourceFetchOptions = {},
): Promise<CityAgentSourceFacts> {
  const url = validateApprovedSourceUrl(source.url)
  const fetcher = options.fetchImpl ?? fetch
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 12_000, 30_000))
  const maxBytes = Math.max(32_000, Math.min(options.maxBytes ?? MAX_SOURCE_BYTES, MAX_SOURCE_BYTES))
  const response = await fetcher(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      "user-agent": "BenefitsiCityAgent/1.0 (+https://benefitsi.de)",
    },
    signal: AbortSignal.timeout(timeoutMs),
  })

  const finalUrl = validateApprovedSourceUrl(response.url || url.toString()).toString()
  const contentType = response.headers.get("content-type") ?? ""
  if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
    throw new Error(`Nicht unterstützter Content-Type: ${contentType.slice(0, 120)}`)
  }
  const body = await readBoundedBody(response, maxBytes)
  return extractSourceFacts(
    body.text,
    {
      retrievedAt: (options.now ?? new Date()).toISOString(),
      finalUrl,
      httpStatus: response.status,
      contentType,
      truncated: body.truncated,
    },
    Math.max(2_000, Math.min(options.maxChars ?? MAX_SOURCE_CHARS, MAX_SOURCE_CHARS)),
  )
}

function hermesFacts(value: unknown, source: CityAgentSourceRow, now: Date): CityAgentSourceFacts {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const sourceUrl = typeof payload.sourceUrl === "string" ? payload.sourceUrl : typeof payload.url === "string" ? payload.url : ""
  if (sourceUrl !== source.url) {
    throw new Error("Hermes-Fakten enthalten nicht exakt die angeforderte Quellen-URL.")
  }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 500) : ""
  const headings = Array.isArray(payload.headings) ? payload.headings.filter((item): item is string => typeof item === "string").slice(0, 24) : []
  const textPreview = typeof payload.textPreview === "string" ? payload.textPreview.slice(0, 4_000) : ""
  const dateMentions = Array.isArray(payload.dateMentions) ? payload.dateMentions.filter((item): item is string => typeof item === "string").slice(0, 30) : []
  const drafts: CityAgentDraftReference[] = Array.isArray(payload.drafts)
    ? payload.drafts
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .slice(0, 10)
      .flatMap((item) => {
        const contentType = typeof item.contentType === "string" && cityAgentContentTypes.includes(item.contentType as (typeof cityAgentContentTypes)[number])
          ? item.contentType as CityAgentDraftReference["contentType"]
          : null
        const draftId = typeof item.draftId === "string" && /^[0-9a-f-]{36}$/i.test(item.draftId) ? item.draftId : null
        const operation = typeof item.operation === "string" && ["create", "update", "expire", "verify"].includes(item.operation)
          ? item.operation as CityAgentDraftReference["operation"]
          : null
        if (!contentType || !draftId || !operation) return []
        return [{
          contentType,
          draftId,
          operation,
          summary: typeof item.summary === "string" ? item.summary.slice(0, 500) : "",
        }]
      })
    : []
  const issues = Array.isArray(payload.issues)
    ? payload.issues.filter((item): item is string => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 500))
    : []
  if (!title && !textPreview && headings.length === 0) {
    throw new Error("Hermes-Fakten enthalten keine verwertbaren, belegten Inhalte.")
  }
  const canonicalPayload = JSON.stringify({ title, headings, textPreview, dateMentions })
  return {
    title,
    headings,
    textPreview,
    dateMentions,
    contentHash: createHash("sha256").update(canonicalPayload).digest("hex"),
    retrievedAt: now.toISOString(),
    finalUrl: source.url,
    httpStatus: 200,
    contentType: "application/json",
    truncated: false,
    drafts,
    issues,
  }
}

async function fetchCitySourceThroughHermes(
  source: CityAgentSourceRow,
  options: SourceFetchOptions,
): Promise<CityAgentSourceFacts> {
  const bridgeUrl = process.env.M1_BRIDGE_URL?.trim()
  const bridgeSecret = process.env.M1_BRIDGE_SECRET?.trim()
  if (!bridgeUrl || !bridgeSecret) throw new Error("Hermes/M1-Bridge ist nicht konfiguriert.")
  const endpoint = new URL("/hermes", bridgeUrl)
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
    throw new Error("Hermes/M1-Bridge muss HTTPS verwenden.")
  }
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bridgeSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "city-source",
      orchestratorProfile: options.orchestratorProfile?.trim() || "ben",
      cityProfile: options.cityProfile?.trim() || process.env.CITY_AGENT_HERMES_PROFILE?.trim() || "city-annweiler",
      citySlug: options.citySlug?.trim() || source.slug.split("-")[0] || "annweiler",
      sourceUrl: source.url,
      contentScope: source.content_scope,
    }),
    signal: AbortSignal.timeout(Math.max(5_000, Math.min(options.hermesTimeoutMs ?? 120_000, 240_000))),
  })
  if (!response.ok) throw new Error(`Hermes/M1-Bridge antwortet mit HTTP ${response.status}.`)
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const raw = typeof body?.response === "string" ? body.response : ""
  const jsonBlock = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonBlock) throw new Error("Hermes hat kein parsebares Fakten-JSON geliefert.")
  return hermesFacts(JSON.parse(jsonBlock), source, options.now ?? new Date())
}

function parseHermesJson(raw: string) {
  const jsonBlock = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonBlock) throw new Error("Hermes hat kein parsebares JSON geliefert.")
  return JSON.parse(jsonBlock) as unknown
}

export async function reviewCityAgentProposalsThroughHermes(
  options: SourceFetchOptions & { proposals: Array<Record<string, unknown>>; autoPublishAllowed?: boolean },
): Promise<CityAgentReviewResult> {
  const bridgeUrl = process.env.M1_BRIDGE_URL?.trim()
  const bridgeSecret = process.env.M1_BRIDGE_SECRET?.trim()
  if (!bridgeUrl || !bridgeSecret) throw new Error("Hermes/M1-Bridge ist nicht konfiguriert.")
  const endpoint = new URL("/hermes", bridgeUrl)
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
    throw new Error("Hermes/M1-Bridge muss HTTPS verwenden.")
  }
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bridgeSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "city-review",
      orchestratorProfile: options.orchestratorProfile?.trim() || "ben",
      cityProfile: options.cityProfile?.trim() || process.env.CITY_AGENT_HERMES_PROFILE?.trim() || "city-annweiler",
      citySlug: options.citySlug?.trim() || "annweiler",
      autoPublishAllowed: options.autoPublishAllowed === true,
      proposals: options.proposals.slice(0, 30),
    }),
    signal: AbortSignal.timeout(Math.max(5_000, Math.min(options.timeoutMs ?? 120_000, 240_000))),
  })
  if (!response.ok) throw new Error(`Hermes/M1-Bridge antwortet mit HTTP ${response.status}.`)
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const raw = typeof body?.response === "string" ? body.response : ""
  const payload = parseHermesJson(raw) as Record<string, unknown>
  const decisions: CityAgentReviewDecision[] = Array.isArray(payload.decisions)
    ? payload.decisions.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return []
      const value = item as Record<string, unknown>
      const proposalId = typeof value.proposalId === "string" && /^[0-9a-f-]{36}$/i.test(value.proposalId) ? value.proposalId : null
      const decision = ["auto_published", "approved", "needs_review", "reject"].includes(String(value.decision))
        ? value.decision as CityAgentReviewDecision["decision"]
        : null
      const risk = ["low", "medium", "high", "critical"].includes(String(value.risk))
        ? value.risk as CityAgentReviewDecision["risk"]
        : null
      if (!proposalId || !decision || !risk) return []
      const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? Math.max(0, Math.min(1, value.confidence))
        : 0
      const publishedDraftIds = Array.isArray(value.publishedDraftIds)
        ? value.publishedDraftIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 10)
        : []
      return [{
        proposalId,
        decision,
        confidence,
        risk,
        reason: typeof value.reason === "string" ? value.reason.slice(0, 500) : "",
        publishedDraftIds,
      }]
    })
    : []
  if (!decisions.length) throw new Error("Ben hat keine validen City-Review-Entscheidungen geliefert.")
  return {
    decisions,
    summary: typeof payload.summary === "string" ? payload.summary.slice(0, 1_000) : "",
  }
}

export function createSourceResearchProvider(options: SourceFetchOptions = {}): CityAgentResearchProvider {
  const hasBridge = Boolean(process.env.M1_BRIDGE_URL?.trim() && process.env.M1_BRIDGE_SECRET?.trim())
  if (!hasBridge) {
    return { name: "direct", fetchSource: (source) => fetchCitySource(source, options) }
  }

  const required = process.env.CITY_AGENT_HERMES_REQUIRED === "true"
  return {
    name: required ? "hermes_required" : "hermes_city_agent",
    fetchSource: async (source) => {
      try {
        return await fetchCitySourceThroughHermes(source, options)
      } catch (error) {
        if (required) throw error
        return fetchCitySource(source, options)
      }
    },
  }
}

export function diffSourceFacts(
  previous: Partial<CityAgentSourceFacts> | null,
  current: CityAgentSourceFacts,
): CityAgentDiff {
  if (!previous) {
    return {
      baseline: { before: null, after: current.contentHash },
      title: { before: null, after: current.title },
    }
  }

  const diff: CityAgentDiff = {}
  for (const field of ["title", "headings", "dateMentions", "contentHash"] as const) {
    if (JSON.stringify(previous[field]) !== JSON.stringify(current[field])) {
      diff[field] = { before: previous[field] ?? null, after: current[field] }
    }
  }
  return diff
}

export function nextSourceCheckAt(source: Pick<CityAgentSourceRow, "cadence">, now = new Date()) {
  const hours = {
    hourly: 1,
    daily: 24,
    weekdays: 24,
    weekly: 24 * 7,
    biweekly: 24 * 14,
    monthly: 24 * 30,
    manual: 24 * 365,
  }[source.cadence]
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString()
}

export function sourceContentType(source: Pick<CityAgentSourceRow, "parser_config">) {
  const candidate = source.parser_config.contentType
  return typeof candidate === "string" && cityAgentContentTypes.includes(candidate as (typeof cityAgentContentTypes)[number]) ? candidate : "city_guide"
}
