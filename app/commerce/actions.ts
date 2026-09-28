'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { uuid } from '@/lib/commerce/requests'

/** This entitlement belongs to Benefitsi admins, not to a partner's menu form. */
export async function setPartnerOrdering(form: FormData) {
  await requireAdmin()
  let failed = false
  try {
    if (process.env.BENEFITSI_COMMERCE_ENABLED !== 'true') throw new Error('disabled')
    const providerId = uuid(form.get('provider_id'))
    const partnerId = uuid(form.get('partner_id'))
    const enabled = form.get('enabled')
    if (enabled !== 'true' && enabled !== 'false') throw new Error('invalid_setting')
    const result = await createAdminClient().from('booking_providers')
      .update({ food_ordering_enabled: enabled === 'true' })
      .eq('id', providerId).eq('partner_id', partnerId).select('id').single()
    if (result.error || !result.data) throw new Error('save_failed')
  } catch { failed = true }
  if (!failed) {
    revalidatePath('/commerce')
    revalidatePath('/partner/commerce')
    revalidatePath('/microsite-preview/[partner]', 'page')
    revalidatePath('/partner/microsite-preview/[partner]', 'page')
    revalidatePath('/microsite-builder/[partner]', 'page')
    revalidatePath('/partner/microsite-builder/[partner]', 'page')
  }
  redirect(failed ? '/commerce?error=save' : '/commerce?success=saved')
}
