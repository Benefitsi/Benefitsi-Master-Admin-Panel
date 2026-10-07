import { createHash, randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

type DealRecord = Record<string, unknown>
type CreateDecision = {
  id: string
  fingerprint: string
  metadata: DealRecord
  replayed?: boolean
  error?: string
}

function record(value: unknown): DealRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DealRecord : {}
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
  }
  return value
}

function happyHourSignature(deal: DealRecord) {
  const number = (key: string, fallback: number | null = null) => deal[key] == null ? fallback : Number(deal[key])
  const text = (key: string, fallback: string | null = null) => String(deal[key] ?? "").trim() || fallback
  const time = (key: string) => {
    const value = text(key)
    return value?.length === 5 ? `${value}:00` : value
  }
  const timestamp = (value: unknown) => {
    if (!value) return null
    const parsed = Date.parse(String(value))
    return Number.isNaN(parsed) ? value : parsed
  }
  const values: DealRecord = {
    partner_id: deal.partner_id,
    discount_type: deal.discount_type,
    discount_value: number("discount_value"),
    reward_item: text("reward_item"),
    benefit_count: deal.discount_type === "bonus_stamp" ? number("benefit_count", 1) : null,
    estimated_savings: number("estimated_savings", 0),
    reward_track_target: text("reward_track_target", "base"),
    happy_hour_start: time("happy_hour_start"), happy_hour_end: time("happy_hour_end"),
    timezone: text("timezone", "Europe/Berlin")!.toLowerCase(),
    starts_at: timestamp(deal.valid_from ?? deal.starts_at), ends_at: timestamp(deal.valid_until ?? deal.ends_at),
    audience: text("audience", "both"), premium_only: deal.premium_only ?? false,
    benefit_category: deal.benefit_category ?? null,
    trigger_key: [null, "visit", "visit_window"].includes(text("trigger_key")) ? "visit_window" : text("trigger_key"),
    trigger_value: number("trigger_value"),
    max_redemptions_per_user: number("max_redemptions_per_user"), max_redemptions_global: number("max_redemptions_global"),
    cooldown_hours: number("cooldown_hours", 0), stock_total: number("stock_total"),
    twoforone_usage_limit: number("twoforone_usage_limit"), twoforone_trial_limit: number("twoforone_trial_limit"),
    allow_free_trial: deal.allow_free_trial ?? false, min_spend: number("min_spend"), max_discount_amount: number("max_discount_amount"),
    expiry_days: number("expiry_days"), selection_expires_minutes: number("selection_expires_minutes", 30),
    reserve_on_selection: deal.reserve_on_selection ?? false, terms: text("terms"),
    metadata: { ...record(deal.metadata) },
  }
  delete (values.metadata as DealRecord).admin_create_receipt
  const rawDays = Array.isArray(deal.weekdays) && deal.weekdays.length ? deal.weekdays : deal.valid_weekdays
  const days = Array.isArray(rawDays) ? [...new Set(rawDays.map(Number).filter(day => day >= 1 && day <= 7))].sort() : []
  values.valid_weekdays = days.length ? days : [1, 2, 3, 4, 5, 6, 7]
  return JSON.stringify(canonical(values))
}

export async function recoverDealCreate(client: SupabaseClient, id: string, partnerId: string, fingerprint: string, editorId: string) {
  const result = await client.from("deals").select("id,partner_id,metadata").eq("id", id).maybeSingle()
  if (result.error || !result.data || result.data.partner_id !== partnerId) return false
  const receipt = record(record(result.data.metadata).admin_create_receipt)
  return receipt.fingerprint === fingerprint && receipt.editor_id === editorId
}

export async function prepareDealCreate(client: SupabaseClient, payload: DealRecord, requestId: string, editorId: string, mediaIntent?: Record<string, unknown>): Promise<CreateDecision> {
  const id = requestId || randomUUID()
  const metadata = { ...record(payload.metadata) }
  delete metadata.admin_create_receipt
  const fingerprint = createHash("sha256").update(JSON.stringify(canonical({ ...payload, metadata, ...(mediaIntent ? { mediaIntent } : {}) }))).digest("hex")
  const decision: CreateDecision = { id, fingerprint, metadata: { ...metadata, admin_create_receipt: { editor_id: editorId, fingerprint } } }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { ...decision, error: "Die Speicheranfrage ist ungültig. Bitte öffne das Formular erneut." }
  }
  const previous = await client.from("deals").select("id,partner_id,metadata").eq("id", id).maybeSingle()
  if (previous.error) return { ...decision, error: previous.error.message }
  if (previous.data) {
    const receipt = record(record(previous.data.metadata).admin_create_receipt)
    return previous.data.partner_id === payload.partner_id && receipt.fingerprint === fingerprint && receipt.editor_id === editorId
      ? { ...decision, replayed: true }
      : { ...decision, error: "Diese Anfrage wurde bereits gespeichert. Bitte prüfe den vorhandenen Vorteil, bevor du ihn bearbeitest." }
  }
  if (payload.type === "happy_hour" && payload.active === true) {
    const existing = await client.from("deals").select("*").eq("partner_id", payload.partner_id).eq("type", "happy_hour").eq("active", true)
    if (existing.error) return { ...decision, error: existing.error.message }
    if ((existing.data ?? []).some(deal => {
      const receipt = record(record(deal.metadata).admin_create_receipt)
      return deal.id === id && receipt.editor_id === editorId && receipt.fingerprint === fingerprint
    })) return { ...decision, replayed: true }
    if ((existing.data ?? []).some(deal => happyHourSignature(deal) === happyHourSignature(payload))) {
      if (await recoverDealCreate(client, id, String(payload.partner_id), fingerprint, editorId)) return { ...decision, replayed: true }
      return { ...decision, error: "Eine identische Happy Hour ist bereits vorhanden. Bearbeite den bestehenden Vorteil." }
    }
  }
  return decision
}
