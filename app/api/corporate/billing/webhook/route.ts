import { corporateRuntime } from '@/lib/corporate/billing-runtime'
import { corporateWebhook, billingResponse } from '@/lib/corporate/billing-http'
export const runtime = 'nodejs'
export const maxDuration = 120
export async function POST(request: Request) {
  try { const runtime = corporateRuntime(); return await corporateWebhook(request, runtime.webhook) }
  catch { return billingResponse({ status: 'unavailable' }, 503) }
}
