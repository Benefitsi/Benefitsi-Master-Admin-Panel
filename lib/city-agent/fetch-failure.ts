export type FetchFailure = {
  category: string
  message: string
  infrastructure: boolean
  abortRun: boolean
}

const TLS_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_SIGNATURE_FAILURE",
  "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR",
  "ERR_SSL_WRONG_VERSION_NUMBER",
])

type ErrorLike = {
  name?: unknown
  message?: unknown
  code?: unknown
  cause?: unknown
}

function asError(value: unknown): ErrorLike | null {
  return value && typeof value === "object" ? (value as ErrorLike) : null
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function causeChain(error: unknown) {
  const chain: ErrorLike[] = []
  const seen = new Set<unknown>()
  let current = asError(error)
  while (current && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = asError(current.cause)
  }
  return chain
}

function kindFor(code: string, name: string, detail: string) {
  const haystack = `${code} ${name} ${detail}`
  if (TLS_CODES.has(code) || /certificate|ssl|tls|handshake/i.test(haystack)) return "tls"
  if (
    name === "TimeoutError" ||
    name === "ConnectTimeoutError" ||
    name === "HeadersTimeoutError" ||
    name === "BodyTimeoutError" ||
    /timeout|UND_ERR_(CONNECT|HEADERS|BODY)_TIMEOUT|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(haystack)
  ) {
    return "timeout"
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || /getaddrinfo|enotfound/i.test(haystack)) return "dns"
  if (
    /^(ECONNRESET|ECONNREFUSED|ECONNABORTED|EHOSTUNREACH|ENETUNREACH|EPIPE|EAI_AGAIN)$/.test(code) ||
    code.startsWith("UND_ERR_") ||
    /socket|econnreset|econnrefused|network/i.test(haystack)
  ) {
    return "network"
  }
  if (name === "AbortError") return "timeout"
  return "unknown"
}

function label(kind: string) {
  if (kind === "tls") return "TLS"
  if (kind === "timeout") return "timeout"
  if (kind === "dns") return "DNS"
  if (kind === "network") return "network"
  return "transport"
}

export function describeFetchFailure(error: unknown, scope: "bridge" | "source" = "source"): FetchFailure {
  if (typeof error === "string" && error.trim()) {
    const prefix = scope === "bridge" ? "Bridge unreachable" : "Source fetch failed"
    return {
      category: scope === "bridge" ? "BRIDGE_UNREACHABLE" : "SOURCE_NETWORK",
      message: `${prefix} (transport): ${error.trim()}`.slice(0, 500),
      infrastructure: true,
      abortRun: scope === "bridge",
    }
  }

  const chain = causeChain(error)
  const code = chain.map((item) => text(item.code)).find(Boolean) ?? ""
  const name = chain.map((item) => text(item.name)).find((item) => item && item !== "TypeError" && item !== "Error")
    ?? text(chain[0]?.name)
    ?? "Error"
  const detail = [...chain]
    .reverse()
    .map((item) => text(item.message))
    .find((item) => item && item !== "fetch failed")
    ?? text(chain[0]?.message)
    ?? "unknown fetch error"
  const bareFetchFailed = detail === "fetch failed" || text(chain[0]?.message) === "fetch failed"
  const kind = kindFor(code, name, detail)
  const resolvedKind = kind === "unknown" && bareFetchFailed ? "network" : kind
  const prefix = scope === "bridge" ? "Bridge unreachable" : "Source fetch failed"
  const codeSuffix = code ? ` ${code}` : ""
  const message = bareFetchFailed && kind === "unknown"
    ? `${prefix} (transport, no cause code): the runtime reported only "fetch failed" and attached no TLS, DNS, timeout, or socket code.`
    : `${prefix} (${label(resolvedKind)}${codeSuffix}): ${detail}`

  const infrastructure = scope === "bridge" || resolvedKind !== "unknown"
  const category = scope === "bridge" && resolvedKind === "unknown"
    ? "BRIDGE_UNREACHABLE"
    : `${scope === "bridge" ? "BRIDGE" : "SOURCE"}_${resolvedKind === "unknown" ? "OTHER" : resolvedKind.toUpperCase()}`

  return {
    category,
    message: message.slice(0, 500),
    infrastructure,
    abortRun: scope === "bridge",
  }
}

export function bridgeStatusFailure(status: number): FetchFailure | null {
  if (status !== 502 && status !== 503 && status !== 504) return null
  return {
    category: "BRIDGE_HTTP",
    message: `Bridge unreachable (HTTP ${status}): the Hermes bridge accepted the connection and returned an unavailable status.`,
    infrastructure: true,
    abortRun: true,
  }
}

export class BridgeUnreachableError extends Error {
  readonly failure: FetchFailure

  constructor(failure: FetchFailure) {
    super(failure.message)
    this.name = "BridgeUnreachableError"
    this.failure = failure
  }
}

export function isBridgeUnreachableError(error: unknown): error is BridgeUnreachableError {
  return error instanceof BridgeUnreachableError
}
