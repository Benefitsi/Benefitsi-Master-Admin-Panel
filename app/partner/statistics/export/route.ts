import { dashboardCsv } from '@/lib/partners/csv'
import { createClient } from '@/lib/supabase/server'
import { dashboardWindow, readDashboard } from '@/lib/partners/analytics'
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams,
    partnerId = query.get('partner') ?? ''
  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return new Response('Bitte erneut anmelden.', { status: 401 })
  try {
    const data = await readDashboard(
      client,
      partnerId,
      dashboardWindow(
        query.get('period') ?? 'last30',
        new Date(),
        query.get('from') ?? undefined,
        query.get('to') ?? undefined,
      ),
      true,
    )
    return new Response(dashboardCsv(data), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="benefitsi-statistik.csv"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return new Response(
      'Export nicht verfügbar. Bitte Berechtigung und Zeitraum prüfen.',
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
