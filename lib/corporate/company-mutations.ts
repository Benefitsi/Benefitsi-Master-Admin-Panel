import { isTimestamp } from "@/lib/corporate/requests"
import { domainFailure, isCompanyRole, isCompanyStatus, isDate, isUuid, mutationFailure, type CompanyMutationState, type CorporateClient } from "@/lib/corporate/companies"

function field(data: FormData, key: string): string | null { const value = data.get(key); return data.getAll(key).length === 1 && typeof value === "string" ? value : null }
function invalid(): CompanyMutationState { return domainFailure("invalid") }
async function mutate(client: CorporateClient, name: string, params: Record<string, string | number | boolean>, success: "created" | "updated" | "issued" | "revoked" | "removed", expectedId?: string): Promise<CompanyMutationState> {
  try {
    const { data, error } = await client.rpc(name, params)
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return mutationFailure
    if (data.status !== success) return domainFailure(data.status)
    switch (success) {
      case "created": return isUuid(data.company_id) && typeof data.replayed === "boolean"
        ? { status: "created", companyId: data.company_id, message: "Firmenkonto vorbereitet. Premium-Zugang ist noch nicht aktiviert." } : mutationFailure
      case "updated": return isTimestamp(data.updated_at) ? { status: "updated", updatedAt: data.updated_at, message: "Firmenstatus und externe Rechnungsreferenz gespeichert." } : mutationFailure
      case "issued": return data.invitation_id === expectedId && isTimestamp(data.expires_at) && typeof data.replayed === "boolean"
        ? { status: "issued", invitationId: data.invitation_id, expiresAt: data.expires_at, message: "Einladung erstellt. Link kopieren und manuell weitergeben." } : mutationFailure
      case "revoked": return { status: "revoked", message: "Einladung zurückgenommen. Der Link ist nicht mehr gültig." }
      case "removed": return { status: "removed", message: "Zuordnung entfernt. Der vereinbarte Jahresbetrag bleibt unverändert." }
    }
  } catch { return mutationFailure }
}
export async function createCompany(client: CorporateClient, data: FormData): Promise<CompanyMutationState> {
  const requestId = field(data, "requestId"), expected = field(data, "expectedUpdatedAt"), seats = field(data, "seats"), startsOn = field(data, "startsOn"), version = field(data, "catalogVersion")
  if (!isUuid(requestId) || !isTimestamp(expected) || !seats || !/^\d{1,5}$/.test(seats) || Number(seats) < 1 || Number(seats) > 10000
    || !isDate(startsOn) || !version || !version.trim() || version.length > 120 || version.includes("\0")) return invalid()
  return mutate(client, "admin_create_corporate_company", { p_request_id: requestId, p_expected_updated_at: expected, p_seats: Number(seats), p_starts_on: startsOn, p_catalog_version: version }, "created")
}
export async function updateCompany(client: CorporateClient, data: FormData): Promise<CompanyMutationState> {
  const id = field(data, "companyId"), expected = field(data, "expectedUpdatedAt"), status = field(data, "status"), reference = field(data, "invoiceReference")
  if (!isUuid(id) || !isTimestamp(expected) || !isCompanyStatus(status) || reference === null || [...reference.trim()].length > 160 || reference.length > 640 || reference.includes("\0")) return invalid()
  return mutate(client, "admin_update_corporate_company", { p_company_id: id, p_expected_updated_at: expected, p_status: status, p_invoice_reference: reference.trim() }, "updated")
}
export async function setCompanyPremium(client: CorporateClient, data: FormData): Promise<CompanyMutationState> {
  const id = field(data, "companyId"), expected = field(data, "expectedUpdatedAt"), enabled = field(data, "enabled"), reference = field(data, "paymentReference")
  if (!isUuid(id) || !isTimestamp(expected) || (enabled !== "true" && enabled !== "false") || reference === null
    || reference.length > 640 || [...reference.trim()].length > 160 || reference.includes("\0")) return invalid()
  if (enabled === "true" ? field(data, "paymentConfirmed") !== "true" || !reference.trim()
    : field(data, "suspensionConfirmed") !== "true" || reference !== "") return invalid()
  const result = await mutate(client, "admin_set_corporate_premium", { p_company_id: id, p_expected_updated_at: expected, p_enabled: enabled === "true", p_payment_reference: reference.trim() }, "updated")
  return result.status === "updated" ? { ...result, message: enabled === "true" ? "Extern geprüfte Zahlung erfasst. Firmen-Premium freigegeben; der aktuelle Zugang richtet sich nach Firmenstatus und Zeitraum." : "Firmen-Premium gesperrt. Private Abos bleiben unverändert." } : result
}
export async function issueInvitation(client: CorporateClient, data: FormData): Promise<CompanyMutationState> {
  const id = field(data, "companyId"), invitationId = field(data, "invitationId"), email = field(data, "email")?.trim().toLowerCase(), role = field(data, "role"), token = field(data, "token")
  if (!isUuid(id) || !isUuid(invitationId) || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isCompanyRole(role) || !token || !/^[0-9a-f]{64}$/.test(token)) return invalid()
  return mutate(client, "issue_corporate_invitation", { p_invitation_id: invitationId, p_company_id: id, p_email: email, p_role: role, p_token: token }, "issued", invitationId)
}
export async function revokeInvitation(client: CorporateClient, data: FormData): Promise<CompanyMutationState> {
  const id = field(data, "invitationId"), companyId = field(data, "companyId"), expected = field(data, "expectedUpdatedAt")
  if (!isUuid(id) || !isUuid(companyId) || !isTimestamp(expected)) return invalid()
  return mutate(client, "revoke_corporate_invitation", { p_invitation_id: id, p_expected_updated_at: expected }, "revoked")
}
export async function removeMember(client: CorporateClient, data: FormData): Promise<CompanyMutationState> {
  const id = field(data, "companyId"), userId = field(data, "userId"), expected = field(data, "expectedUpdatedAt"), role = field(data, "role")
  if (!isUuid(id) || !isUuid(userId) || !isTimestamp(expected) || !isCompanyRole(role)) return invalid()
  return mutate(client, "remove_corporate_member", { p_company_id: id, p_user_id: userId, p_role: role, p_expected_updated_at: expected }, "removed")
}
