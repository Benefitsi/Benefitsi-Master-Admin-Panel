import { createHash } from "node:crypto"

export const BENEFITSI_CONTROL_PROFILES = ["ben", "benefitsi-content", "benefitsi-finance", "benefitsi-seo", "city-annweiler", "benefitsi-menu"] as const
export type ProfileFileId = "soul" | "reference-memory" | "short-memory" | "knowledge"
export type ProfileAccess = { isAdmin: boolean; financeRead: boolean }
type Envelope = { schemaVersion: 1; hostId: "m1-benefitsi"; profileId: string; checkedAt: string }
export type ProfileDocument = { fileId: ProfileFileId; path: string; exists: boolean; byteLength: number | null; modifiedAt: string | null }
export type ProfileDocumentList = Envelope & { documents: ProfileDocument[] }
export type ProfileDocumentContent = Envelope & { fileId: ProfileFileId; path: string; modifiedAt: string; readAt: string; byteLength: number; sha256: string; hashVersion: "sha256-bytes-v1"; content: string }
export type ProfileModel = { provider: string | null; model: string | null }
export type ProfileModelProvider = { id: string; label: string; authenticated: true; models: { id: string; label: string }[]; source: string }
export type ProfileModelState = Envelope & { current: ProfileModel; revision: string; starter: { mode: "profile-default" | "deterministic"; appliesToNewJobs: boolean; limitations: string[] } }
export type ProfileModelOptions = ProfileModelState & { providers: ProfileModelProvider[] }
export type ProfileModelApplied = ProfileModelState & { confirmed: true; readbackVerified: true; effectiveFor: "new-jobs"; changed: boolean }
export type AgentProfileOperation = "context-list" | "context-read" | "model-options" | "model-readback" | "model-apply"
export type ProfileControlBridge = (request: Record<string, unknown>) => Promise<unknown>

const files: Record<string, Partial<Record<ProfileFileId, string>>> = {
  ben: { soul: "SOUL.md", "reference-memory": "MEMORY.md", "short-memory": "memories/MEMORY.md", knowledge: "KNOWLEDGE.md" },
  "benefitsi-content": { soul: "SOUL.md", "short-memory": "memories/MEMORY.md", knowledge: "KNOWLEDGE.md" },
  "benefitsi-finance": { soul: "SOUL.md", knowledge: "KNOWLEDGE.md" },
  "benefitsi-seo": { soul: "SOUL.md", "reference-memory": "MEMORY.md", "short-memory": "memories/MEMORY.md", knowledge: "KNOWLEDGE.md" },
  "city-annweiler": { soul: "SOUL.md", "reference-memory": "MEMORY.md", "short-memory": "memories/MEMORY.md", knowledge: "KNOWLEDGE.md" },
  "benefitsi-menu": { soul: "SOUL.md", knowledge: "KNOWLEDGE.md" },
}

export class AgentProfileControlError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code) }
}
function fail(code = "invalid_response", status = 502): never { throw new AgentProfileControlError(code, status) }
function record(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return fail(); return value as Record<string, unknown> }
function text(value: unknown, maximum = 240): string { if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) return fail(); return value }
function nullableText(value: unknown, maximum = 240) { return value === null ? null : text(value, maximum) }
function timestamp(value: unknown): string { const result = text(value, 80); if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) return fail(); return result }
function nullableTimestamp(value: unknown) { return value === null ? null : timestamp(value) }
function byteLength(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 64 * 1024) return fail(); return value as number }
function boundedList<T>(value: unknown, maximum: number, normalize: (entry: unknown) => T): T[] { if (!Array.isArray(value) || value.length > maximum) return fail(); return value.map(normalize) }
function unique<T>(items: T[], key: (item: T) => string) { if (new Set(items.map(key)).size !== items.length) return fail(); return items }
function envelope(value: unknown, profileId: string): Envelope {
  const r = record(value)
  if (r.schemaVersion !== 1 || r.hostId !== "m1-benefitsi" || r.profileId !== profileId) return fail()
  return { schemaVersion: 1, hostId: "m1-benefitsi", profileId, checkedAt: timestamp(r.checkedAt) }
}
function contextFile(value: unknown, profileId: string) {
  const r = record(value), fileId = text(r.fileId, 32) as ProfileFileId
  const path = files[profileId]?.[fileId]
  if (!path || path !== r.path) return fail()
  return { r, fileId, path }
}
export function normalizeProfileDocumentList(value: unknown, profileId: string): ProfileDocumentList {
  const e = envelope(value, profileId), r = record(value)
  const documents = unique(boundedList(r.documents, 4, raw => {
    const { r: doc, fileId, path } = contextFile(raw, profileId)
    if (typeof doc.exists !== "boolean") return fail()
    const size = doc.byteLength === null ? null : byteLength(doc.byteLength)
    const modifiedAt = nullableTimestamp(doc.modifiedAt)
    if (!doc.exists && (size !== null || modifiedAt !== null)) return fail()
    return { fileId, path, exists: doc.exists, byteLength: size, modifiedAt }
  }), doc => doc.fileId)
  return { ...e, documents }
}
export function normalizeProfileDocumentContent(value: unknown, profileId: string, fileId: ProfileFileId): ProfileDocumentContent {
  const e = envelope(value, profileId), { r, fileId: readId, path } = contextFile(value, profileId)
  if (fileId !== readId || typeof r.content !== "string" || r.hashVersion !== "sha256-bytes-v1") return fail()
  const size = byteLength(r.byteLength), sha256 = text(r.sha256, 64)
  if (!/^[a-f0-9]{64}$/.test(sha256) || Buffer.byteLength(r.content, "utf8") !== size || createHash("sha256").update(r.content, "utf8").digest("hex") !== sha256) return fail()
  return { ...e, fileId, path, modifiedAt: timestamp(r.modifiedAt), readAt: timestamp(r.readAt ?? r.checkedAt), byteLength: size, sha256, hashVersion: "sha256-bytes-v1", content: r.content }
}
function modelState(value: unknown, profileId: string): ProfileModelState {
  const e = envelope(value, profileId), r = record(value), current = record(r.current), starter = record(r.starter)
  if (!["profile-default", "deterministic"].includes(String(starter.mode)) || typeof starter.appliesToNewJobs !== "boolean") return fail()
  return { ...e, current: { provider: nullableText(current.provider, 120), model: nullableText(current.model, 200) }, revision: text(r.revision, 128), starter: { mode: starter.mode as ProfileModelState["starter"]["mode"], appliesToNewJobs: starter.appliesToNewJobs, limitations: boundedList(starter.limitations, 8, value => text(value, 400)) } }
}
export function normalizeProfileModelOptions(value: unknown, profileId: string): ProfileModelOptions {
  const state = modelState(value, profileId), r = record(value)
  const providers = unique(boundedList(r.providers, 64, value => {
    const p = record(value)
    if (p.authenticated !== true) return fail()
    return { id: text(p.id, 120), label: text(p.label, 160), authenticated: true as const, source: text(p.source ?? "hermes", 120), models: unique(boundedList(p.models, 512, raw => { const m = record(raw); return { id: text(m.id, 200), label: text(m.label, 200) } }), m => m.id) }
  }), p => p.id)
  return { ...state, providers }
}

export function agentProfilesEndpoint(base: string) {
  const url = new URL(base)
  if (url.protocol !== "https:" || url.username || url.password) return fail("bridge_unavailable", 503)
  return new URL("/hermes/profiles", url.origin).toString()
}

/** The only authority boundary: six profiles, thirteen context files, six knowledge entries and native catalogued models. */
export async function executeAgentProfileOperation(profileId: string, operation: AgentProfileOperation, input: Record<string, unknown>, access: ProfileAccess, bridge: ProfileControlBridge): Promise<ProfileDocumentList | ProfileDocumentContent | ProfileModelOptions | ProfileModelApplied | ProfileModelState> {
  if (access.isAdmin !== true || (profileId === "benefitsi-finance" && access.financeRead !== true)) return fail("access_denied", 403)
  if (!Object.hasOwn(files, profileId)) return fail("unsupported_profile", 404)
  if (!["context-list", "context-read", "model-options", "model-readback", "model-apply"].includes(operation)) return fail("invalid_request", 400)
  const allowedFields = operation === "context-read" ? ["fileId"] : operation === "model-apply" ? ["provider", "model", "expectedProvider", "expectedModel", "expectedRevision", "confirmed"] : []
  if (Object.keys(input).some(key => !allowedFields.includes(key))) return fail("invalid_request", 400)
  const request: Record<string, unknown> = { schemaVersion: 1, action: operation, profileId }
  if (operation === "context-read") {
    const fileId = input.fileId as ProfileFileId
    if (typeof fileId !== "string" || !Object.hasOwn(files[profileId], fileId)) return fail("context_file_forbidden", 403)
    request.fileId = fileId
    return normalizeProfileDocumentContent(await bridge(request), profileId, fileId)
  }
  if (operation === "context-list") return normalizeProfileDocumentList(await bridge(request), profileId)
  if (operation === "model-options") return normalizeProfileModelOptions(await bridge(request), profileId)
  if (operation === "model-readback") return modelState(await bridge(request), profileId)
  if (input.confirmed !== true) return fail("confirmation_required", 400)
  const provider = text(input.provider, 120), model = text(input.model, 200)
  const expectedProvider = nullableText(input.expectedProvider, 120), expectedModel = nullableText(input.expectedModel, 200), expectedRevision = text(input.expectedRevision, 128)
  const options = normalizeProfileModelOptions(await bridge({ schemaVersion: 1, action: "model-options", profileId }), profileId)
  if (!options.starter.appliesToNewJobs) return fail("starter_not_supported", 409)
  if (options.current.provider !== expectedProvider || options.current.model !== expectedModel || options.revision !== expectedRevision) return fail("configuration_changed", 409)
  if (!options.providers.find(p => p.id === provider)?.models.some(m => m.id === model)) return fail("unavailable_model", 409)
  const raw = record(await bridge({ ...request, provider, model, expectedProvider, expectedModel, expectedRevision, confirmed: true }))
  const applied = modelState(raw, profileId)
  if (raw.confirmed !== true || raw.readbackVerified !== true || raw.effectiveFor !== "new-jobs" || typeof raw.changed !== "boolean" || applied.current.provider !== provider || applied.current.model !== model) return fail("save_unconfirmed", 502)
  return { ...applied, confirmed: true, readbackVerified: true, effectiveFor: "new-jobs", changed: raw.changed }
}
