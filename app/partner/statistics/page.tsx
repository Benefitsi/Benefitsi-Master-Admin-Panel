import { PartnerDashboard } from '@/components/partner/partner-dashboard'
import { PartnerStatistics } from '@/components/partner/partner-statistics'
import { partnerPageContext } from '@/lib/partners/page-context'
import { dashboardWindow, readDashboard } from '@/lib/partners/analytics'
export const dynamic = 'force-dynamic'
export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const query = await searchParams,
    ctx = await partnerPageContext(query.partner),
    preset = query.period ?? 'last30'
  let data,
    failed = false
  try {
    data = await readDashboard(
      ctx.client,
      ctx.partnerId,
      dashboardWindow(preset, new Date(), query.from, query.to),
      preset === 'month',
    )
  } catch {
    failed = true
  }
  const advanced = ctx.rights.features['analytics.advanced'] === true,
    exportable = ctx.rights.features['analytics.export'] === true
  const exportQuery = new URLSearchParams({
    partner: ctx.partnerId,
    period: preset,
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
  })
  return (
    <PartnerDashboard {...ctx} active="statistics">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <form className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="partner" value={ctx.partnerId} />
          <label className="text-sm font-medium">
            Zeitraum
            <select
              name="period"
              defaultValue={preset}
              className="mt-1 block rounded-lg border border-slate-300 p-2.5"
            >
              <option value="today">Heute</option>
              <option value="last7">Letzte 7 Tage</option>
              <option value="last30">Letzte 30 Tage</option>
              {advanced && (
                <option value="custom">Freie Auswahl (bis 365 Tage)</option>
              )}
              {exportable && (
                <option value="month">
                  Monatsbericht · letzter abgeschlossener Monat
                </option>
              )}
            </select>
          </label>
          {advanced && (
            <>
              <label className="text-sm">
                Von (Berlin)
                <input
                  type="date"
                  name="from"
                  defaultValue={query.from}
                  className="mt-1 block rounded-lg border border-slate-300 p-2.5"
                />
              </label>
              <label className="text-sm">
                Bis einschließlich (Berlin)
                <input
                  type="date"
                  name="to"
                  defaultValue={query.to}
                  className="mt-1 block rounded-lg border border-slate-300 p-2.5"
                />
              </label>
            </>
          )}
          <button className="rounded-lg bg-[#087cd9] px-4 py-2.5 text-sm font-bold text-white">
            Anwenden
          </button>
        </form>
        {exportable && (
          <a
            href={`/partner/statistics/export?${exportQuery}`}
            className="mt-4 inline-block text-sm font-semibold text-sky-700 underline"
          >
            Aggregierte Daten als CSV herunterladen
          </a>
        )}
        {!advanced && (
          <p className="mt-3 text-sm text-slate-500">
            Free enthält Tagesverlauf und Heute / 7 / 30 Tage. Freie Auswahl,
            Vergleiche, Monatsbericht und Export erfordern Pro.
          </p>
        )}
      </div>
      {preset === 'month' && (
        <p className="mb-4 text-sm font-semibold">
          Monatsbericht im Dashboard · letzter abgeschlossener Berliner
          Kalendermonat. Keine automatische E-Mail.
        </p>
      )}
      {failed ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          Die Statistik konnte für diesen Zeitraum nicht geladen werden. Bitte
          prüfe deinen Tarif und den Zeitraum oder versuche es erneut.{' '}
          <a
            href={`/partner/statistics?partner=${ctx.partnerId}`}
            className="underline"
          >
            Zurück zu 30 Tagen
          </a>
        </div>
      ) : (
        data && <PartnerStatistics data={data} />
      )}
    </PartnerDashboard>
  )
}
