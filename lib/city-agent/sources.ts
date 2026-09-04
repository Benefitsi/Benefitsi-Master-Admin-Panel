import { createHash } from "node:crypto"
import { inflateRawSync, inflateSync } from "node:zlib"
import {
  cityAgentContentTypes,
  type CityAgentDiff,
  type CityAgentContentType,
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
  "pfalz.de",
  "outdooractive.com",
  "openstreetmap.org",
  "mapcarta.com",
  "bibkat.de",
  "waldgalerie-annweiler.de",
  "wikipedia.org",
  "wikimedia.org",
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
  /** Baselines must be deterministic and must not wait on an optional LLM bridge. */
  forceDirect?: boolean
  retryAttempts?: number
  retryBaseDelayMs?: number
  sleepImpl?: (milliseconds: number) => Promise<void>
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
  const configured = (process.env.CITY_AGENT_APPROVED_SOURCE_HOSTS || process.env.BENEFITSI_APPROVED_CITY_SOURCE_DOMAINS)
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  // The environment value extends the reviewed built-in registry. This keeps
  // older deployments from silently blocking newly registered, vetted city
  // sources while still requiring any additional host to be explicitly
  // configured or added to this reviewed list.
  return [...new Set([...DEFAULT_APPROVED_HOSTS, ...(configured ?? [])])]
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

/**
 * Build a stable representation for change detection. Source pages commonly
 * contain retrieval clocks, generated ids, tracking parameters and repeated
 * navigation/footer fragments. Those are useful for debugging but are not a
 * semantic city-content change and must not create a proposal.
 */
export function canonicalizeSemanticText(value: string) {
  const normalized = decodeEntities(value)
    .normalize("NFKC")
    .replace(/\b(?:zuletzt\s+aktualisiert|aktualisiert\s+am|last\s+updated|updated\s+at|abgerufen\s+am|retrieved\s+at|generated\s+at)\s+(?:\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})(?:[\s,]+\d{1,2}:\d{2}(?::\d{2})?)?/gi, " ")
    .replace(/\b(?:utm_[a-z_]+|fbclid|gclid)=[^\s&]+/gi, "")
    .replace(/\b(?:session|request|trace|build|deployment)[-_]?[a-z0-9]{8,}\b/gi, "")
    .replace(/\b\d{10,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()

  // Sorting bounded sentence-like blocks removes harmless CMS reordering
  // while retaining the words that carry local meaning.
  return normalized
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .map((part) => part.trim().toLocaleLowerCase("de-DE"))
    .filter(Boolean)
    .sort()
    .join(" ")
}

function canonicalList(values: string[]) {
  return [...new Set(values.map((value) => canonicalizeSemanticText(value)).filter(Boolean))].sort()
}

export function canonicalSourceHash(input: {
  title: string
  headings: string[]
  readableText?: string
  textPreview?: string
  dateMentions: string[]
}) {
  const canonicalPayload = JSON.stringify({
    version: "v2",
    title: canonicalizeSemanticText(input.title),
    headings: canonicalList(input.headings),
    semanticText: canonicalizeSemanticText(input.readableText ?? input.textPreview ?? ""),
    dateMentions: [...new Set(input.dateMentions)].sort(),
  })
  return createHash("sha256").update(canonicalPayload).digest("hex")
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
  const contentHash = canonicalSourceHash({ title, headings, readableText, dateMentions })

  return {
    ...metadata,
    title,
    headings,
    textPreview: readableText.slice(0, 4_000),
    dateMentions,
    contentHash,
    extractionMethod: "html",
  }
}

async function readBoundedBody(response: Response, maxBytes: number) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    const bounded = bytes.slice(0, maxBytes)
    return {
      bytes: bounded,
      text: new TextDecoder().decode(bounded),
      truncated: bytes.length > maxBytes,
    }
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
    bytes: Uint8Array.from(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))),
    text: new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))),
    truncated,
  }
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([\\()])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
}

function decodePdfHex(value: string) {
  const hex = value.replace(/\s+/g, "")
  let decoded = ""
  for (let index = 0; index < hex.length; index += 2) {
    const pair = hex.slice(index, index + 2)
    if (/^[0-9a-f]{2}$/i.test(pair)) decoded += String.fromCharCode(parseInt(pair, 16))
  }
  return decoded
}

function skipPdfWhitespace(value: string, start: number) {
  let index = start
  while (index < value.length && /\s/.test(value[index] ?? "")) index += 1
  return index
}

function readPdfDelimited(value: string, start: number, open: string, close: string) {
  let depth = 0
  let escaped = false
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === "\\") {
      escaped = true
      continue
    }
    if (character === open) depth += 1
    if (character === close) {
      depth -= 1
      if (depth === 0) return { raw: value.slice(start + 1, index), end: index + 1 }
    }
  }
  return null
}

function stringsInsidePdfArray(value: string) {
  const strings: string[] = []
  for (let index = 0; index < value.length;) {
    const character = value[index]
    if (character === "(") {
      const token = readPdfDelimited(value, index, "(", ")")
      if (token) {
        strings.push(decodePdfLiteral(token.raw))
        index = token.end
        continue
      }
    }
    if (character === "<" && value[index + 1] !== "<") {
      const token = readPdfDelimited(value, index, "<", ">")
      if (token) {
        strings.push(decodePdfHex(token.raw))
        index = token.end
        continue
      }
    }
    index += 1
  }
  return strings
}

function decodePdfContentStreams(binary: string) {
  const decodedStreams: string[] = []
  let cursor = 0
  while (cursor < binary.length) {
    const streamStart = binary.indexOf("stream", cursor)
    if (streamStart < 0) break
    const dataStart = skipPdfWhitespace(binary, streamStart + "stream".length)
    const streamEnd = binary.indexOf("endstream", dataStart)
    if (streamEnd < 0) break

    const raw = Buffer.from(binary.slice(dataStart, streamEnd), "latin1")
    let decoded: Buffer | null = null
    try {
      decoded = inflateSync(raw)
    } catch {
      try {
        decoded = inflateRawSync(raw)
      } catch {
        decoded = null
      }
    }

    const candidate = decoded?.toString("latin1") ?? raw.toString("latin1")
    // Keep page content streams only. Font/image streams can also be
    // Flate-compressed, but do not contain PDF text operators and would add
    // noise to the bounded source facts.
    if (/\bBT\b/.test(candidate) && /\bT(?:j|J)\b/.test(candidate)) {
      decodedStreams.push(candidate)
    }
    cursor = streamEnd + "endstream".length
  }
  return decodedStreams
}

function extractPdfOperatorStrings(value: string) {
  const literals: string[] = []
  for (let index = 0; index < value.length;) {
    const character = value[index]
    if (character === "[") {
      const array = readPdfDelimited(value, index, "[", "]")
      if (array) {
        const operatorStart = skipPdfWhitespace(value, array.end)
        if (value.slice(operatorStart, operatorStart + 2) === "TJ") literals.push(...stringsInsidePdfArray(array.raw))
        index = array.end
        continue
      }
    }
    if (character === "(" || (character === "<" && value[index + 1] !== "<")) {
      const close = character === "(" ? ")" : ">"
      const token = readPdfDelimited(value, index, character, close)
      if (token) {
        const operatorStart = skipPdfWhitespace(value, token.end)
        const operator = value.slice(operatorStart, operatorStart + 2)
        if (operator === "Tj" || operator === "TJ") {
          literals.push(character === "(" ? decodePdfLiteral(token.raw) : decodePdfHex(token.raw))
        }
        index = token.end
        continue
      }
    }
    index += 1
  }
  return literals
}

/**
 * Extracts text from text-based PDFs without OCR. This deliberately keeps
 * only bounded text and page provenance; image-only PDFs remain a manual
 * source review rather than being guessed by the agent.
 */
export function extractPdfText(bytes: Uint8Array) {
  // Keep a one-byte representation for compressed streams. `TextDecoder("latin1")`
  // follows the WHATWG Windows-1252 mapping, so bytes such as 0x9c can be
  // re-encoded differently and make an otherwise valid Flate stream fail.
  const binary = Buffer.from(bytes).toString("latin1")
  const pages = Math.max(1, (binary.match(/\/Type\s*\/Page(?:\s|\/|>)/g) ?? []).length)
  const decodedStreams = decodePdfContentStreams(binary)
  const literals = decodedStreams.length > 0
    ? decodedStreams.flatMap((stream) => extractPdfOperatorStrings(stream))
    : extractPdfOperatorStrings(binary)
  const text = literals.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ").slice(0, MAX_SOURCE_CHARS)
  return { text, pageCount: pages, extractable: text.length > 0 }
}

function extractPdfFacts(
  bytes: Uint8Array,
  metadata: Pick<CityAgentSourceFacts, "retrievedAt" | "finalUrl" | "httpStatus" | "contentType" | "truncated">,
  maxChars = MAX_SOURCE_CHARS,
): CityAgentSourceFacts {
  const extracted = extractPdfText(bytes)
  const textPreview = extracted.text.slice(0, Math.min(maxChars, 4_000))
  const dateMentions = [...extracted.text.matchAll(/\b(?:\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/g)]
    .map((match) => match[0])
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 30)
  const title = textPreview.split(/[.!?]\s+/)[0]?.slice(0, 500) ?? "PDF-Quelle"
  return {
    ...metadata,
    title,
    headings: [],
    textPreview,
    dateMentions,
    contentHash: canonicalSourceHash({ title, headings: [], readableText: extracted.text, dateMentions }),
    extractionMethod: "pdf-text",
    pageCount: extracted.pageCount,
    provenance: Array.from({ length: Math.min(extracted.pageCount, 20) }, (_, index) => ({ page: index + 1 })),
  }
}

async function pause(milliseconds: number, sleepImpl?: SourceFetchOptions["sleepImpl"]) {
  if (sleepImpl) return sleepImpl(milliseconds)
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function fetchCitySource(
  source: CityAgentSourceRow,
  options: SourceFetchOptions = {},
): Promise<CityAgentSourceFacts> {
  const url = validateApprovedSourceUrl(source.url)
  const fetcher = options.fetchImpl ?? fetch
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 12_000, 30_000))
  const maxBytes = Math.max(32_000, Math.min(options.maxBytes ?? MAX_SOURCE_BYTES, MAX_SOURCE_BYTES))
  const attempts = Math.max(1, Math.min(Math.trunc(options.retryAttempts ?? 3), 3))
  let lastError: unknown = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.8",
          "user-agent": "BenefitsiCityAgent/1.1 (+https://benefitsi.de)",
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        await pause(Math.min(2_000, (options.retryBaseDelayMs ?? 250) * 2 ** attempt), options.sleepImpl)
        continue
      }
      if (!response.ok) throw new Error(`Quelle antwortet mit HTTP ${response.status}.`)

      const finalUrl = validateApprovedSourceUrl(response.url || url.toString()).toString()
      const contentType = response.headers.get("content-type") ?? ""
      const body = await readBoundedBody(response, maxBytes)
      const metadata = {
        retrievedAt: (options.now ?? new Date()).toISOString(),
        finalUrl,
        httpStatus: response.status,
        contentType,
        truncated: body.truncated,
      }
      if (/application\/pdf/i.test(contentType) || /\.pdf(?:$|[?#])/i.test(finalUrl)) {
        const facts = extractPdfFacts(body.bytes, metadata, Math.max(2_000, Math.min(options.maxChars ?? MAX_SOURCE_CHARS, MAX_SOURCE_CHARS)))
        if (!facts.textPreview) throw new Error("PDF enthält keinen extrahierbaren Text; manuelle Prüfung erforderlich.")
        return facts
      }
      if (!/text\/html|application\/xhtml\+xml|text\/plain|application\/json/i.test(contentType)) {
        throw new Error(`Nicht unterstützter Content-Type: ${contentType.slice(0, 120)}`)
      }
      return extractSourceFacts(
        body.text,
        metadata,
        Math.max(2_000, Math.min(options.maxChars ?? MAX_SOURCE_CHARS, MAX_SOURCE_CHARS)),
      )
    } catch (error) {
      lastError = error
      if (attempt >= attempts - 1) break
      await pause(Math.min(2_000, (options.retryBaseDelayMs ?? 250) * 2 ** attempt), options.sleepImpl)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Quellenabruf fehlgeschlagen.")
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
  return {
    title,
    headings,
    textPreview,
    dateMentions,
    contentHash: canonicalSourceHash({ title, headings, textPreview, dateMentions }),
    retrievedAt: now.toISOString(),
    finalUrl: source.url,
    httpStatus: 200,
    contentType: "application/json",
    truncated: false,
    extractionMethod: "hermes",
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
  if (options.forceDirect) {
    return { name: "direct", fetchSource: (source) => fetchCitySource(source, options) }
  }
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
    return {}
  }

  const diff: CityAgentDiff = {}
  for (const field of ["title", "headings", "textPreview", "dateMentions"] as const) {
    const normalize = (value: unknown) => {
      if (field === "textPreview" || field === "title") return canonicalizeSemanticText(typeof value === "string" ? value : "")
      if (Array.isArray(value)) return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => canonicalizeSemanticText(item)).filter(Boolean))].sort()
      return value ?? null
    }
    const before = normalize(previous[field])
    const after = normalize(current[field])
    if (JSON.stringify(before) !== JSON.stringify(after)) {
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

export function sourceContentType(source: Pick<CityAgentSourceRow, "parser_config">): CityAgentContentType {
  const candidate = source.parser_config.contentType
  return typeof candidate === "string" && cityAgentContentTypes.includes(candidate as (typeof cityAgentContentTypes)[number])
    ? candidate as CityAgentContentType
    : "city_guide"
}
