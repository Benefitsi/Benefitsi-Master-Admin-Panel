import { requireAdmin } from '@/lib/admin'
import { comparisonStore } from '@/lib/seo/seo-comparison-data'
import {
  comparisonDate,
  comparisonToday,
  readComparisonConfig,
  compareRankBatches,
  comparisonCsv,
} from '@/lib/seo/seo-comparison'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const { supabase } = await requireAdmin()
  const url = new URL(request.url),
    id = url.searchParams.get('target') ?? ''
  const store = comparisonStore(supabase),
    target = await store.getTarget(id)
  const config = target?.partner_id
    ? readComparisonConfig(target.provider_config.comparison)
    : null
  if (!target || !config)
    return new Response('Vergleich nicht gefunden', { status: 404 })
  let asOf = comparisonToday()
  try {
    if (url.searchParams.get('asof'))
      asOf = comparisonDate(url.searchParams.get('asof'))
  } catch {
    return new Response('Ungültiger Stichtag', { status: 400 })
  }
  const batches = await store.getBatches(id, config)
  return new Response(
    comparisonCsv(
      config,
      config.baseline,
      compareRankBatches(config, config.baseline, batches, asOf),
    ),
    {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="partnervergleich-${asOf}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}
