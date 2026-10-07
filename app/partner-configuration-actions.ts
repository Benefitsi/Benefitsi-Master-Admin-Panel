"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin"
import { createClient } from "@/lib/supabase/server"
import { canManagePartner, getPartnerPortalSession } from "@/lib/partner-portal"
import { editableBadgeFields, type ConfigurationChange, type ConfigurationResult, type InternalContact, type PartnerBadge } from "@/lib/partner-configuration"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function failure(message: string) { return { ok: false as const, message } }
function rpcMessage(message: string) {
  if (/conflict/.test(message)) return "Der gespeicherte Stand wurde inzwischen geändert. Bitte neu laden und deine Änderungen vergleichen."
  if (/admin_required|access_denied/.test(message)) return "Für diese Änderung fehlt die Berechtigung."
  if (/not_found/.test(message)) return "Der gespeicherte Eintrag wurde nicht gefunden. Bitte neu laden."
  return "Die Änderung konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten. Bitte versuche es erneut."
}
async function adminRead<T>(partnerId: string, name: string, extras = {}): Promise<ConfigurationResult<T>> {
  try {
    const { supabase } = await requireAdmin()
    if (!uuid.test(partnerId)) return failure("Ungültiger Betrieb.")
    const { data, error } = await supabase.rpc(name, { p_partner_id: partnerId, ...extras })
    return error || data == null ? failure(rpcMessage(error?.message || "")) : { ok: true, message: "", data: data as T }
  } catch { return failure("Der interne Bereich konnte nicht geladen werden. Bitte prüfe deine Anmeldung.") }
}
export async function loadInternalContact(partnerId: string) {
  return adminRead<InternalContact>(partnerId, "get_partner_internal_contact")
}
export async function loadPartnerBadges(partnerId: string) {
  return adminRead<PartnerBadge[]>(partnerId, "get_partner_badges")
}
export async function loadConfigurationHistory(partnerId: string) {
  return adminRead<ConfigurationChange[]>(partnerId, "get_partner_configuration_history", { p_limit: 30 })
}
export async function saveInternalContact(partnerId: string, input: Pick<InternalContact, "email" | "mobile" | "updated_at">): Promise<ConfigurationResult<InternalContact>> {
  try {
    const { supabase } = await requireAdmin()
    if (!uuid.test(partnerId)) return failure("Ungültiger Betrieb.")
    const email = input.email?.trim() || null, mobile = input.mobile?.trim() || null
    if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return failure("Bitte eine gültige E-Mail-Adresse eingeben.")
    if (mobile && (mobile.length > 80 || /[\u0000-\u001f\u007f]/.test(mobile))) return failure("Bitte eine gültige Mobilnummer eingeben.")
    const { data, error } = await supabase.rpc("save_partner_internal_contact", { p_partner_id: partnerId, p_email: email, p_mobile: mobile, p_expected_updated_at: input.updated_at || null })
    if (error || data?.partner_id !== partnerId || !data?.updated_at) return failure(rpcMessage(error?.message || ""))
    return { ok: true, data: data as InternalContact, message: "Interner Kontakt gespeichert." }
  } catch { return failure("Der interne Kontakt konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.") }
}
export async function savePartnerBadge(partnerId: string, badgeId: string, input: Record<string, unknown>, expectedUpdatedAt: string): Promise<ConfigurationResult<PartnerBadge>> {
  try {
    const { supabase } = await requireAdmin()
    if (!uuid.test(partnerId) || !uuid.test(badgeId) || !expectedUpdatedAt || !input || Array.isArray(input) || Object.keys(input).some(key => !(editableBadgeFields as readonly string[]).includes(key))) return failure("Die Abzeichen-Konfiguration ist ungültig.")
    const { data, error } = await supabase.rpc("save_partner_badge", { p_partner_id: partnerId, p_badge_id: badgeId, p_input: input, p_expected_updated_at: expectedUpdatedAt })
    if (error || data?.id !== badgeId || data?.partner_id !== partnerId || !data?.updated_at) return failure(rpcMessage(error?.message || ""))
    revalidatePath("/")
    return { ok: true, data: data as PartnerBadge, message: "Abzeichen gespeichert." }
  } catch { return failure("Das Abzeichen konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.") }
}
export async function reorderPartnerDeals(partnerId: string, dealIds: string[]): Promise<ConfigurationResult<Array<{ id: string; display_order: number }>>> {
  try {
    const supabase = await createClient(), session = await getPartnerPortalSession(supabase)
    if (!session || !canManagePartner(session, partnerId)) return failure("Für diesen Betrieb fehlt die Bearbeitungsberechtigung.")
    if (!uuid.test(partnerId) || !Array.isArray(dealIds) || dealIds.some(id => !uuid.test(id)) || new Set(dealIds).size !== dealIds.length) return failure("Die Reihenfolge ist ungültig. Bitte neu laden.")
    const { data, error } = await supabase.rpc("reorder_partner_deals", { p_partner_id: partnerId, p_deal_ids: dealIds })
    if (error) return failure(rpcMessage(error.message))
    if (!Array.isArray(data) || data.length !== dealIds.length || dealIds.some((id, index) => !data.some(row => row.id === id && row.display_order === index))) return failure("Die Reihenfolge wurde nicht vollständig bestätigt. Bitte neu laden.")
    revalidatePath("/"); revalidatePath("/partner")
    return { ok: true, data, message: "Reihenfolge gespeichert." }
  } catch { return failure("Die Reihenfolge konnte nicht gespeichert werden. Der bisherige Stand bleibt erhalten.") }
}
