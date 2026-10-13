import "server-only"
import { getAdminSession } from "./admin"
import { createClient } from "./supabase/server"
import { getFinanceAccess } from "./finance-agent"
import { AgentProfileControlError, agentProfilesEndpoint, executeAgentProfileOperation, type AgentProfileOperation, type ProfileAccess } from "./agent-profile-controls"

const knownErrors = new Set(["unsupported_profile", "invalid_request", "confirmation_required", "access_denied", "native_unavailable", "catalog_unavailable", "unauthenticated_provider", "unavailable_model", "configuration_changed", "model_busy", "starter_not_supported", "persist_failed", "readback_failed", "save_unconfirmed", "invalid_response", "context_invalid_input", "context_profile_forbidden", "context_file_missing", "context_file_forbidden", "context_not_utf8", "context_too_large", "context_symlink", "context_changed", "context_unavailable", "bridge_unavailable"])
const statusFor = (code: string) => ["access_denied", "context_file_forbidden", "context_profile_forbidden"].includes(code) ? 403 : code === "unsupported_profile" || code === "context_file_missing" ? 404 : ["configuration_changed", "model_busy", "starter_not_supported", "unavailable_model", "unauthenticated_provider", "context_changed"].includes(code) ? 409 : ["invalid_request", "confirmation_required", "context_invalid_input"].includes(code) ? 400 : 503

async function profileAccess(profileId: string): Promise<ProfileAccess> {
  const client = await createClient(), session = await getAdminSession(client)
  if (!session?.isAdmin) throw new AgentProfileControlError("access_denied", 403)
  return profileId === "benefitsi-finance" ? getFinanceAccess(client, session) : { isAdmin: true, financeRead: false }
}

async function profileBridge(request: Record<string, unknown>) {
  const base = process.env.M1_BRIDGE_URL?.trim(), secret = process.env.M1_BRIDGE_SECRET?.trim()
  if (!base || !secret) throw new AgentProfileControlError("bridge_unavailable", 503)
  let response: Response
  try {
    response = await fetch(agentProfilesEndpoint(base), {
      method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(request), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(request.action === "model-apply" ? 30_000 : 15_000),
    })
  } catch { throw new AgentProfileControlError("bridge_unavailable", 503) }
  const reader = response.body?.getReader()
  if (!reader) throw new AgentProfileControlError("bridge_unavailable", 503)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 512 * 1024) throw new AgentProfileControlError("invalid_response", 502)
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  let payload: unknown
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { throw new AgentProfileControlError("invalid_response", 502) }
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "bridge_unavailable"
    const safe = knownErrors.has(code) ? code : "bridge_unavailable"
    throw new AgentProfileControlError(safe, statusFor(safe))
  }
  return payload
}

export async function requestAgentProfileOperation(profileId: string, operation: AgentProfileOperation, input: Record<string, unknown> = {}) {
  const access = await profileAccess(profileId)
  return executeAgentProfileOperation(profileId, operation, input, access, profileBridge)
}

export async function profileModelRequestBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin")
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AgentProfileControlError("access_denied", 403)
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new AgentProfileControlError("invalid_request", 400)
  const reader = request.body?.getReader()
  if (!reader) throw new AgentProfileControlError("invalid_request", 400)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) throw new AgentProfileControlError("invalid_request", 400)
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid")
    return value as Record<string, unknown>
  } catch { throw new AgentProfileControlError("invalid_request", 400) }
}

export const profileControlHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }
export function profileControlErrorResponse(error: unknown) {
  const recognized = error instanceof AgentProfileControlError && knownErrors.has(error.code)
  return Response.json({ error: recognized ? error.code : "bridge_unavailable" }, { status: recognized ? error.status : 503, headers: profileControlHeaders })
}
