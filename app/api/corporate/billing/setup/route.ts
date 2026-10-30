import { corporateRuntime } from '@/lib/corporate/billing-runtime'
import { ownerBillingRequest, billingResponse } from '@/lib/corporate/billing-http'
export const runtime = 'nodejs'
export const maxDuration = 120
export async function POST(request: Request) {
  try { const runtime = corporateRuntime(); return await ownerBillingRequest(request, 'setup', runtime.ownerDeps) }
  catch { return billingResponse({ status: 'unavailable' }, 503) }
}
