import { corporateRuntime } from '@/lib/corporate/billing-runtime'
import { corporateDispatch, billingResponse } from '@/lib/corporate/billing-http'
export const runtime = 'nodejs'
export const maxDuration = 120
export async function POST(request: Request) {
  try { const runtime = corporateRuntime(); return await corporateDispatch(request, runtime.workerSecret, runtime.tick) }
  catch { return billingResponse({ status: 'unavailable' }, 503) }
}
