import 'server-only'
import { publicCatalog } from './service'
import { webOrigin } from './http'
import { micrositeCommerceActions } from './microsite-actions'

export async function loadMicrositeCommerceActions(partnerId: string | null | undefined) {
  if (!partnerId || process.env.BENEFITSI_COMMERCE_ENABLED !== 'true') return []
  try {
    return micrositeCommerceActions(await publicCatalog(partnerId), partnerId, webOrigin())
  } catch {
    // An optional booking service must never take down the full microsite.
    return []
  }
}
