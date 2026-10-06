import type { CompanyRole } from "@/lib/corporate/companies"
export type InvitationDraft = { companyId: string; invitationId: string; email: string; role: CompanyRole; token: string }
export function newInvitationDraft(companyId: string, email: string, role: CompanyRole): InvitationDraft {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return { companyId, invitationId: crypto.randomUUID(), email: email.trim().toLowerCase(), role, token: Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("") }
}
export function invitationLink(token: string) { return `https://benefitsi.de/firmen/einladung#token=${token}` }
