'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getPartnerPortalSession } from '@/lib/partner-portal'
import { saveFeedbackSettings, validUuid, type FeedbackSettings } from '@/lib/partners/feedback'

export type FeedbackSettingsResult = {
  ok: boolean
  message: string
  settings?: FeedbackSettings
}

export async function updateFeedbackReward(
  _previous: FeedbackSettingsResult,
  form: FormData,
): Promise<FeedbackSettingsResult> {
  const partnerId = String(form.get('partner_id') ?? '')
  if (!validUuid(partnerId)) return { ok: false, message: 'Bitte einen gültigen Betrieb auswählen.' }
  try {
    const client = await createClient()
    const session = await getPartnerPortalSession(client)
    if (!session || (!session.isAdmin && !session.partnerIds.includes(partnerId)))
      return { ok: false, message: 'Bitte mit einem berechtigten Partnerkonto anmelden.' }
    // Re-read capability and management rights in saveFeedbackSettings on every mutation.
    const settings = await saveFeedbackSettings(client, {
      partnerId,
      enabled: form.get('enabled') === 'on',
      dealId: String(form.get('deal_id') ?? '') || null,
    })
    revalidatePath('/partner')
    return { ok: true, message: settings.enabled ? 'Feedback-Belohnung ist aktiviert.' : 'Feedback-Belohnung ist ausgeschaltet.', settings }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Die Einstellung konnte nicht gespeichert werden. Bitte Berechtigung und Gültigkeit des Vorteils prüfen und erneut versuchen.' }
  }
}
