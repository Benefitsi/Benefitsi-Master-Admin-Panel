export type AgentScope = "benefitsi" | "general" | "other" | "unknown"
export type AgentAutomation = "scheduled" | "manual" | "unknown"
export type RuntimeSource = "hermes" | "launchd"
export type RuntimeFreshness = "fresh" | "stale" | "invalid"

export type AgentContextFile = {
  path: string
  exists: boolean
  chars: number | null
  limit: number | null
  sha256: string | null
  modifiedAt: string | null
  loadedBy: "system" | "reference" | "unknown"
}

export type AgentSchedule = {
  id: string
  source: RuntimeSource
  enabled: boolean | null
  cadence: string | null
  lastRunAt: string | null
  lastStatus: string | null
}

export type AgentProfile = {
  id: string
  scope: AgentScope
  purpose: string
  provider: string | null
  model: string | null
  citySlug: string | null
  automation: AgentAutomation
  contextFiles: AgentContextFile[]
  schedules: AgentSchedule[]
  contextHealth: "ok" | "missing" | "over_limit" | "unknown"
  runtimeHealth: "ok" | "failed" | "unknown"
}

export type RuntimeSnapshot = {
  schemaVersion: 1
  hostId: "m1-benefitsi"
  observedAt: string
  collectorVersion: string
  profiles: AgentProfile[]
}

export type RuntimeNormalization = {
  state: RuntimeFreshness
  snapshot: RuntimeSnapshot | null
}

const MAX_SNAPSHOT_BYTES = 128 * 1024
const MAX_PROFILES = 64
const MAX_CONTEXT_FILES = 16
const MAX_SCHEDULES = 16
const MAX_FUTURE_MS = 5 * 60 * 1000
const STALE_AFTER_MS = 90 * 60 * 1000
const CONTEXT_PATHS = new Set([
  "AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "memories/MEMORY.md",
])

const ANNWEILER_ID = "b9e684e4-54b3-41ff-8f97-4426423893c2"

export function cityDisplayName(cityId: string) {
  return cityId === ANNWEILER_ID ? "Annweiler am Trifels" : null
}

export function contractTimestampMs(value: unknown): number | null {
  if (typeof value !== "string") return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText)
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText)
  const offsetHour = offsetHourText ? Number(offsetHourText) : 0
  const offsetMinute = offsetMinuteText ? Number(offsetMinuteText) : 0
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeRuntimeSnapshot(input: unknown, now = new Date()): RuntimeNormalization {
  if (!isRecord(input) || serializedSize(input) > MAX_SNAPSHOT_BYTES) return invalid()
  if (input.schemaVersion !== 1 || input.hostId !== "m1-benefitsi") return invalid()
  const observedAt = dateString(input.observedAt)
  const collectorVersion = shortString(input.collectorVersion, 80)
  if (!observedAt || !collectorVersion || !Array.isArray(input.profiles) || input.profiles.length > MAX_PROFILES) return invalid()

  const nowMs = now.getTime()
  const observedMs = Date.parse(observedAt)
  if (!Number.isFinite(nowMs) || observedMs > nowMs + MAX_FUTURE_MS) return invalid()

  const profiles: AgentProfile[] = []
  const profileIds = new Set<string>()
  for (const raw of input.profiles) {
    const profile = normalizeProfile(raw, nowMs)
    if (!profile || profileIds.has(profile.id)) return invalid()
    profileIds.add(profile.id)
    profiles.push(profile)
  }

  return {
    state: nowMs - observedMs > STALE_AFTER_MS ? "stale" : "fresh",
    snapshot: { schemaVersion: 1, hostId: "m1-benefitsi", observedAt, collectorVersion, profiles },
  }
}

function normalizeProfile(input: unknown, nowMs: number): AgentProfile | null {
  if (!isRecord(input) || !Array.isArray(input.contextFiles) || !Array.isArray(input.schedules)) return null
  if (input.contextFiles.length > MAX_CONTEXT_FILES || input.schedules.length > MAX_SCHEDULES) return null
  const id = identifier(input.id, 80)
  const purpose = shortString(input.purpose, 500)
  const scope = enumValue(input.scope, ["benefitsi", "general", "other", "unknown"] as const)
  const automation = enumValue(input.automation, ["scheduled", "manual", "unknown"] as const)
  const provider = nullableString(input.provider, 120)
  const model = nullableString(input.model, 120)
  const citySlug = input.citySlug === null ? null : identifier(input.citySlug, 100)
  if (!id || !purpose || !scope || !automation || provider === undefined || model === undefined || citySlug === undefined) return null

  const contextFiles: AgentContextFile[] = []
  const contextPaths = new Set<string>()
  for (const raw of input.contextFiles) {
    const file = normalizeContextFile(raw)
    if (!file || contextPaths.has(file.path)) return null
    contextPaths.add(file.path)
    contextFiles.push(file)
  }
  const schedules: AgentSchedule[] = []
  const scheduleIds = new Set<string>()
  for (const raw of input.schedules) {
    const schedule = normalizeSchedule(raw)
    const scheduleId = schedule ? `${schedule.source}\0${schedule.id}` : ""
    if (!schedule || scheduleIds.has(scheduleId)) return null
    scheduleIds.add(scheduleId)
    schedules.push(schedule)
  }
  return {
    id, scope, purpose, provider, model, citySlug, automation, contextFiles, schedules,
    contextHealth: contextHealth(contextFiles), runtimeHealth: runtimeHealth(schedules, nowMs),
  }
}

function normalizeContextFile(input: unknown): AgentContextFile | null {
  if (!isRecord(input) || typeof input.exists !== "boolean") return null
  const path = typeof input.path === "string" && CONTEXT_PATHS.has(input.path) ? input.path : null
  const chars = nullableNonNegativeInteger(input.chars)
  const limit = nullableNonNegativeInteger(input.limit)
  const sha256 = input.sha256 === null ? null : typeof input.sha256 === "string" && /^[a-f0-9]{64}$/i.test(input.sha256) ? input.sha256.toLowerCase() : undefined
  const modifiedAt = input.modifiedAt === null ? null : dateString(input.modifiedAt) ?? undefined
  const loadedBy = enumValue(input.loadedBy, ["system", "reference", "unknown"] as const)
  if (!path || chars === undefined || limit === undefined || sha256 === undefined || modifiedAt === undefined || !loadedBy) return null
  if (!input.exists && (chars !== null || sha256 !== null || modifiedAt !== null)) return null
  return { path, exists: input.exists, chars, limit, sha256, modifiedAt, loadedBy }
}

function normalizeSchedule(input: unknown): AgentSchedule | null {
  if (!isRecord(input)) return null
  const id = identifier(input.id, 120)
  const source = enumValue(input.source, ["hermes", "launchd"] as const)
  const enabled = input.enabled === null || typeof input.enabled === "boolean" ? input.enabled : undefined
  const cadence = nullableString(input.cadence, 200)
  const lastRunAt = input.lastRunAt === null ? null : dateString(input.lastRunAt) ?? undefined
  const lastStatus = nullableString(input.lastStatus, 160)
  if (!id || !source || enabled === undefined || cadence === undefined || lastRunAt === undefined || lastStatus === undefined) return null
  return { id, source, enabled, cadence, lastRunAt, lastStatus }
}

function contextHealth(files: AgentContextFile[]): AgentProfile["contextHealth"] {
  if (files.length === 0) return "unknown"
  if (files.some(file => file.exists && file.chars !== null && file.limit !== null && file.chars > file.limit)) return "over_limit"
  if (files.some(file => file.loadedBy === "system" && !file.exists)) return "missing"
  if (files.some(file => file.exists && (file.chars === null || file.sha256 === null))) return "unknown"
  return "ok"
}

function runtimeHealth(schedules: AgentSchedule[], nowMs: number): AgentProfile["runtimeHealth"] {
  const enabled = schedules.filter(item => item.enabled === true)
  const statuses = enabled.map(item => item.lastStatus?.toLowerCase() ?? null)
  if (statuses.some(status => status === "error" || status === "failed")) return "failed"
  const hasRecentSuccess = enabled.length > 0 && enabled.every(item => {
    const status = item.lastStatus?.toLowerCase()
    const runMs = contractTimestampMs(item.lastRunAt)
    if (runMs === null || !["ok", "succeeded", "queue_empty"].includes(status ?? "")) return false
    const age = nowMs - runMs
    return age >= -MAX_FUTURE_MS && age <= 48 * 60 * 60 * 1000
  })
  if (hasRecentSuccess) return "ok"
  return "unknown"
}

function invalid(): RuntimeNormalization { return { state: "invalid", snapshot: null } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function serializedSize(value: unknown) { try { return new TextEncoder().encode(JSON.stringify(value)).byteLength } catch { return Number.POSITIVE_INFINITY } }
function shortString(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null }
function identifier(value: unknown, max: number) { const text = shortString(value, max); return text && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(text) ? text : null }
function nullableString(value: unknown, max: number): string | null | undefined { return value === null ? null : shortString(value, max) ?? undefined }
function nullableNonNegativeInteger(value: unknown): number | null | undefined { return value === null ? null : Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined }
function dateString(value: unknown): string | null { return typeof value === "string" && contractTimestampMs(value) !== null ? value : null }
function enumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] | null { return typeof value === "string" && values.includes(value) ? value as T[number] : null }
