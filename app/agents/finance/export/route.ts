import { requestFinance } from '@/lib/finance-agent-server'
import type { FinanceExport } from '@/lib/finance-agent'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  try {
    const result = await requestFinance('export', { runId: url.searchParams.get('runId'), format: url.searchParams.get('format') }) as FinanceExport
    return new Response(result.content, { headers: {
      'content-type': result.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="benefitsi-finance-${result.runId}.${result.format}"`,
      'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
    } })
  } catch {
    return Response.json({ error: 'Kein berechtigter oder bestätigter Prüfexport verfügbar.' }, { status: 403, headers: { 'cache-control': 'private, no-store' } })
  }
}
