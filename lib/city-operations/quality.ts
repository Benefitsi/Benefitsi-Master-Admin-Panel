export type QualityRow = Record<string, unknown>
export type PlaceQualityIssue = "address" | "phone" | "source" | "opening" | "never_verified" | "stale_verification"
export type SourceQualityIssue = "missing_check" | "stale_check" | "source_failed" | "source_changed" | "stale_fields" | "unknown_fields"
export type SourceSchedule = "due" | "current" | "disabled" | "external" | "excluded" | "unknown"

const WINDOW_MS = 72 * 60 * 60 * 1000
const PLACE_REVIEW_MS = 30 * 24 * 60 * 60 * 1000
const DISPLAY_LIMIT = 30
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const object = (value: unknown): QualityRow => value && typeof value === "object" && !Array.isArray(value) ? value as QualityRow : {}
const timestamp = (value: unknown) => Date.parse(text(value))
const iso = (value: number) => Number.isFinite(value) ? new Date(value).toISOString() : null
const windowStart = (value: number) => Math.floor(value / WINDOW_MS) * WINDOW_MS
const fields = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())))].sort() : []

// PostgreSQL revisions have microsecond precision; Date.parse alone would make
// two different revisions within the same millisecond compare equal.
function timestampKey(value: unknown) {
  const raw = text(value)
  const match = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/)
  const date = iso(timestamp(raw))
  return match && date ? `${date.slice(0, 19)}.${(match[1] ?? "").padEnd(6, "0")}Z` : null
}

export function safeQualityUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value))
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null
  } catch { return null }
}

function editorHref(slug: unknown, type: string, id: unknown) {
  return text(slug) && text(id) ? `/city-pages/${encodeURIComponent(text(slug))}/content/${type}/${encodeURIComponent(text(id))}` : null
}

function hasOpeningInformation(place: QualityRow) {
  if (text(place.opening_hours_note)) return true
  return Array.isArray(place.opening_hours) && place.opening_hours.some((value) => {
    const row = object(value)
    return Number.isInteger(row.weekday) && Number(row.weekday) >= 1 && Number(row.weekday) <= 7 &&
      (row.closed === true || (/^\d{2}:\d{2}/.test(text(row.opens)) && /^\d{2}:\d{2}/.test(text(row.closes))))
  })
}

function sourceSchedule(source: QualityRow): SourceSchedule {
  const config = object(source.parser_config)
  if (source.active !== true || source.enabled !== true || source.cadence === "manual" || source.city_mode === "DISABLED") return "disabled"
  if (config.cadence_owner !== "m1_city_freshness") return "external"
  if (!text(source.city_mode)) return "unknown"
  if (config.auto_publish !== false || config.interval_seconds !== 259200 ||
      !["BUSINESS", "PLACE", "BENEFIT", "LINK"].includes(text(object(source.content_scope).entity_type))) return "excluded"
  return "due"
}

export function buildDirectoryQuality(places: QualityRow[], sources: QualityRow[], checks: QualityRow[], now = new Date()) {
  const nowMs = now.getTime()
  const nowKey = timestampKey(now.toISOString())!
  const placeTasks = places.map((place) => {
    const issues: PlaceQualityIssue[] = []
    if (!text(place.address)) issues.push("address")
    if (!text(place.contact_phone)) issues.push("phone")
    if (!safeQualityUrl(place.source_url)) issues.push("source")
    if (!hasOpeningInformation(place)) issues.push("opening")
    const verifiedAt = timestamp(place.last_verified_at)
    const expiresAt = timestamp(place.expires_at)
    if (!Number.isFinite(verifiedAt) || verifiedAt > nowMs) issues.push("never_verified")
    if ((Number.isFinite(verifiedAt) && nowMs - verifiedAt >= PLACE_REVIEW_MS) || expiresAt <= nowMs) issues.push("stale_verification")
    return {
      id: text(place.id), title: text(place.name) || "Ohne Namen", cityName: text(place.city_name),
      issues, sourceUrl: safeQualityUrl(place.source_url), editorHref: editorHref(place.city_slug, "places", place.id),
      lastVerifiedAt: verifiedAt <= nowMs ? iso(verifiedAt) : null,
      dueAt: verifiedAt <= nowMs ? iso(Math.min(verifiedAt + PLACE_REVIEW_MS, Number.isFinite(expiresAt) ? expiresAt : Infinity)) : null,
    }
  }).filter((place) => place.issues.length > 0)
  placeTasks.sort((a, b) => b.issues.length - a.issues.length || a.id.localeCompare(b.id))

  const checksBySource = new Map<string, QualityRow[]>()
  for (const check of checks) {
    const id = text(check.source_id)
    const list = checksBySource.get(id) ?? []
    list.push(check)
    checksBySource.set(id, list)
  }
  const sourceTasks = sources.map((source) => {
    const revision = timestampKey(source.updated_at)
    const matching = (checksBySource.get(text(source.id)) ?? []).filter((check) => {
      const checkedAt = timestamp(check.checked_at)
      const checkedKey = timestampKey(check.checked_at)
      const slot = timestamp(check.window_start)
      // The database binds the window to attempted_at, but writes checked_at
      // later. A receipt may cross the boundary during its permitted 1h write lag.
      const validWindow = Number.isFinite(slot) && windowStart(slot) === slot &&
        slot <= checkedAt + 5000 && checkedAt - 3_600_000 < slot + WINDOW_MS
      return check.city_id === source.city_id && check.source_url === source.url &&
        Boolean(safeQualityUrl(check.source_url)) && revision !== null && timestampKey(check.source_revision) === revision &&
        checkedKey !== null && checkedKey >= revision && checkedKey <= nowKey && validWindow
    }).sort((a, b) => (timestampKey(b.checked_at) ?? "").localeCompare(timestampKey(a.checked_at) ?? "") || text(b.id).localeCompare(text(a.id)))
    const receipt = matching[0]
    let schedule = sourceSchedule(source)
    const monitored = schedule === "due"
    const dueAt = monitored ? iso(receipt ? timestamp(receipt.window_start) + WINDOW_MS : windowStart(nowMs)) : null
    if (monitored && receipt && timestamp(receipt.window_start) === windowStart(nowMs)) schedule = "current"
    const issues: SourceQualityIssue[] = []
    if (monitored && !receipt) issues.push("missing_check")
    if (monitored && receipt && schedule === "due") issues.push("stale_check")
    if (receipt?.fetch_status === "failed") issues.push("source_failed")
    if (receipt?.comparison === "changed") issues.push("source_changed")
    if (fields(receipt?.stale_fields).length) issues.push("stale_fields")
    if (fields(receipt?.unknown_fields).length) issues.push("unknown_fields")
    const config = object(source.parser_config)
    const scope = object(source.content_scope)
    const type = scope.entity_type === "PLACE" ? "places" : scope.entity_type === "BENEFIT" ? "benefits" : null
    return {
      id: text(source.id), title: text(source.slug), cityName: text(source.city_name),
      owner: text(source.owner_name) || "Zuständigkeit fehlt",
      cadenceOwner: text(config.cadence_owner) || text(config.visitor_adapter) || text(config.discovery_role) || "city_agent",
      sourceUrl: safeQualityUrl(source.url), schedule, dueAt, issues,
      editorHref: type ? editorHref(source.city_slug, type, scope.entity_id) : null,
      reviewHref: `/automation?city=${encodeURIComponent(text(source.city_id))}&status=needs_human`,
      latestCheck: receipt ? {
        id: text(receipt.id), checkedAt: iso(timestamp(receipt.checked_at)), comparison: text(receipt.comparison),
        fetchStatus: text(receipt.fetch_status), httpStatus: typeof receipt.http_status === "number" ? receipt.http_status : null,
        sha256: /^[a-f0-9]{64}$/.test(text(receipt.source_sha256)) ? text(receipt.source_sha256) : null,
        errorCode: text(receipt.error_code), staleFields: fields(receipt.stale_fields), unknownFields: fields(receipt.unknown_fields),
        reviewJobId: text(receipt.review_job_id) || null,
      } : null,
    }
  })
  sourceTasks.sort((a, b) => b.issues.length - a.issues.length || a.id.localeCompare(b.id))

  return {
    counts: {
      totalPlaces: places.length, placesNeedingAttention: placeTasks.length,
      missingFields: placeTasks.reduce((sum, place) => sum + place.issues.filter((issue) => ["address", "phone", "source", "opening"].includes(issue)).length, 0),
      stalePlaces: placeTasks.filter((place) => place.issues.includes("stale_verification")).length,
      unverifiedPlaces: placeTasks.filter((place) => place.issues.includes("never_verified")).length,
      totalSources: sources.length, sourcesNeedingAttention: sourceTasks.filter((source) => source.issues.length > 0).length,
      dueSources: sourceTasks.filter((source) => source.schedule === "due").length,
      disabledSources: sourceTasks.filter((source) => source.schedule === "disabled").length,
    },
    places: placeTasks.slice(0, DISPLAY_LIMIT), sources: sourceTasks.slice(0, DISPLAY_LIMIT),
    omittedPlaces: Math.max(0, placeTasks.length - DISPLAY_LIMIT), omittedSources: Math.max(0, sourceTasks.length - DISPLAY_LIMIT),
  }
}

export type DirectoryQuality = ReturnType<typeof buildDirectoryQuality>
