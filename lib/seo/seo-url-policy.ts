export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string }

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "0.0.0.0",
  "::",
  "::1",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
  "host.docker.internal",
])

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [first, second] = octets
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
  if (
    PRIVATE_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".local")
  ) {
    return true
  }
  if (normalized.includes(":")) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")
  }
  return isPrivateIpv4(normalized)
}

function validateUrl(value: string): UrlValidationResult {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, reason: "URL is invalid." }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only HTTP and HTTPS URLs are supported." }
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with embedded credentials are not supported." }
  }
  if (!url.hostname || isPrivateHostname(url.hostname)) {
    return { ok: false, reason: "Private, loopback or metadata hosts are not allowed." }
  }
  return { ok: true, url }
}

export function validateSeoFetchUrl(value: string): UrlValidationResult {
  return validateUrl(value)
}

export function validateSeoRedirectTarget(value: string): UrlValidationResult {
  return validateUrl(value)
}
