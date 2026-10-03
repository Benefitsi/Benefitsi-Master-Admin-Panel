import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

type MilestoneRecord = Record<string, unknown>
const fields = ["partner_id", "required_stamps", "reward_type", "reward_item", "discount_type", "discount_value", "estimated_savings", "title", "customer_description", "staff_instructions", "terms", "audience", "active", "reward_track_target"] as const
const numbers = new Set<string>(["required_stamps", "discount_value", "estimated_savings"])
function matches(row: MilestoneRecord, payload: MilestoneRecord) {
  return fields.every(field => {
    const stored = row[field] ?? null, submitted = payload[field] ?? null
    return numbers.has(field) && stored !== null && submitted !== null ? Number(stored) === Number(submitted) : stored === submitted
  })
}
export async function recoverMilestoneCreate(client: SupabaseClient, id: string, payload: MilestoneRecord) {
  const { data, error } = await client.from("partner_reward_milestones").select("*").eq("id", id).maybeSingle()
  return !error && Boolean(data && matches(data, payload))
}
export async function prepareMilestoneCreate(client: SupabaseClient, payload: MilestoneRecord, requestId: string) {
  const id = requestId || randomUUID()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return { id, error: "Die Speicheranfrage ist ungültig. Bitte öffne das Formular erneut.", replayed: false }
  const { data, error } = await client.from("partner_reward_milestones").select("*").eq("id", id).maybeSingle()
  if (error) return { id, error: "Der Speicherstatus konnte nicht geprüft werden. Bitte versuche es erneut.", replayed: false }
  if (data && !matches(data, payload)) return { id, error: "Diese Anfrage wurde bereits gespeichert. Bitte prüfe die vorhandene Stempelbelohnung, bevor du sie bearbeitest.", replayed: false }
  return { id, replayed: Boolean(data), error: undefined }
}
