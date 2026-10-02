import type { SupabaseClient } from '@supabase/supabase-js'

export type FeedbackRewardDeal = {
  id: string
  title: string
  description: string
  terms: string
  expires_at: string | null
}

export type FeedbackSettings = {
  partner_id: string
  enabled: boolean
  deal_id: string | null
  available_deals: FeedbackRewardDeal[]
  reward_valid_days?: number
}

export type FeedbackSettingsRead = {
  available: boolean
  settings: FeedbackSettings | null
}

export async function readFeedbackSettings(
  client: SupabaseClient,
  partnerId: string,
): Promise<FeedbackSettingsRead> {
  if (!validUuid(partnerId)) throw new Error('Bitte einen gültigen Betrieb auswählen.')
  const { data, error } = await client.rpc('get_partner_feedback_settings', {
    p_partner_id: partnerId,
  })
  if (error && ['PGRST202', '42883'].includes(error.code))
    return { available: false, settings: null }
  if (error) throw new Error('Feedback-Einstellungen konnten nicht geladen werden. Bitte Berechtigung prüfen.')
  return { available: true, settings: normalizeSettings(data, partnerId) }
}

export async function saveFeedbackSettings(
  client: SupabaseClient,
  input: { partnerId: string; enabled: boolean; dealId: string | null },
): Promise<FeedbackSettings> {
  if (!validUuid(input.partnerId)) throw new Error('Bitte einen gültigen Betrieb auswählen.')
  if (typeof input.enabled !== 'boolean') throw new Error('Bitte eine gültige Einstellung auswählen.')
  if (input.enabled && !validUuid(input.dealId ?? ''))
    throw new Error('Bitte einen geeigneten Vorteil für die Belohnung auswählen.')
  const { data, error } = await client.rpc('set_partner_feedback_reward', {
    p_partner_id: input.partnerId,
    p_enabled: input.enabled,
    p_deal_id: input.enabled ? input.dealId : null,
  })
  if (error) throw new Error('Die Einstellung konnte nicht gespeichert werden. Bitte Zugriff und Gültigkeit des Vorteils prüfen.')
  return normalizeSettings(data, input.partnerId)
}

export function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function normalizeSettings(value: unknown, partnerId: string): FeedbackSettings {
  if (!value || typeof value !== 'object') throw new Error('Feedback-Einstellungen konnten nicht geladen werden.')
  const row = value as Record<string, unknown>
  if (row.partner_id !== partnerId || typeof row.enabled !== 'boolean' ||
      !Array.isArray(row.available_deals) ||
      (row.deal_id !== null && !validUuid(String(row.deal_id))) ||
      (row.enabled && !row.deal_id))
    throw new Error('Feedback-Einstellungen konnten nicht geladen werden.')
  const available = row.available_deals.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Feedback-Einstellungen konnten nicht geladen werden.')
    const deal = item as Record<string, unknown>
    if (!validUuid(String(deal.id)) || typeof deal.title !== 'string' || !deal.title.trim())
      throw new Error('Feedback-Einstellungen konnten nicht geladen werden.')
    const expires = deal.expires_at
    if (expires !== null && expires !== undefined &&
        (typeof expires !== 'string' || !Number.isFinite(Date.parse(expires))))
      throw new Error('Feedback-Einstellungen konnten nicht geladen werden.')
    return {
      id: String(deal.id), title: deal.title,
      description: typeof deal.description === 'string' ? deal.description : '',
      terms: typeof deal.terms === 'string' ? deal.terms : '',
      expires_at: typeof expires === 'string' ? expires : null,
    }
  })
  return {
    partner_id: partnerId, enabled: row.enabled,
    deal_id: row.deal_id === null ? null : String(row.deal_id),
    available_deals: available,
    reward_valid_days: typeof row.reward_valid_days === 'number' ? row.reward_valid_days : 30,
  }
}
