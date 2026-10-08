import type { ReactNode } from 'react'
import {
  VisitChart,
  ReturningRing,
  DistributionBar,
} from '@/components/partner/partner-charts'
import { Users, UserRound, History, Ticket } from 'lucide-react'
import { metricNumber } from '@/lib/partners/chart-data'
import {
  formatBerlinRange,
  formatBerlin,
  metricLabels,
  statusLabels,
  type Dashboard,
  type Metric,
} from '@/lib/partners/analytics'
import {
  dashboardDetailRows,
  insightVersion,
  insight,
  safeBuckets,
  object,
  objects,
  released,
  safeNumber,
  safeStatus,
  knownLabel,
  safeRating,
  childStatus,
  bucketNames,
  peakLabel,
  type AggregateRow,
  type Json,
} from '@/lib/partners/insights'
const number = (value: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)
const percent = (value: number) =>
  new Intl.NumberFormat('de-DE', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
const status = (value: unknown) =>
  statusLabels[safeStatus(value)] ?? 'Nicht verfügbar'
function valueLabel(key: string, metric?: Metric) {
  const value = metricNumber(metric)
  return value === null ||
    (['return_30d', 'returning_guest_share'].includes(key) && value > 1)
    ? '—'
    : ['return_30d', 'returning_guest_share'].includes(key)
      ? percent(value)
      : number(value)
}
const panel = 'min-w-0 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6'
export const statisticsTopics = [
  ['visits', 'Besuche'],
  ['guests', 'Gäste'],
  ['levels', 'Gäste-Level'],
  ['offers', 'Angebote'],
  ['loyalty', 'Treue'],
  ['growth', 'Wachstum'],
  ['feedback', 'Feedback'],
] as const
function Topic({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 space-y-5"
      aria-labelledby={`${id}-heading`}
    >
      <h2 id={`${id}-heading`} className="text-xl font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  )
}
// The v1 aggregate has counts but no publishable catalogue names. Keep this
// UI-only fallback separate from the shared additive CSV projection.
function LegacyOffers({ data }: { data: Dashboard }) {
  const root = object(data.breakdowns)
  const rootStatus =
    data.definition_version === 'partner-dashboard-v1'
      ? safeStatus(root.status)
      : 'unavailable'
  const weeks = released(rootStatus) ? objects(root.weeks) : []
  const rows = weeks.flatMap((week) => {
    if (!released(childStatus(week, rootStatus))) return []
    const dimension = object(week.offers)
    if (!released(dimension.status)) return []
    return objects(dimension.buckets).flatMap((bucket) => {
      if (!released(childStatus(bucket, dimension.status))) return []
      const count = safeNumber(bucket.redemptions)
      if (count === null || !Number.isInteger(count)) return []
      const sample = safeNumber(bucket.sample_size)
      const range =
        typeof week.from === 'string' &&
        typeof week.to === 'string' &&
        Number.isFinite(Date.parse(week.from)) &&
        Number.isFinite(Date.parse(week.to))
          ? formatBerlinRange(week.from, week.to)
          : 'Bezugszeitraum nicht verfügbar'
      return [
        {
          count,
          sample: sample !== null && Number.isInteger(sample) ? sample : null,
          range,
        },
      ]
    })
  })
  return (
    <div className={panel}>
      <h3 className="font-bold">Einlösungen je Angebot</h3>
      <p className="mt-2 text-sm text-slate-500">
        Freigegebene Wochenwerte. Angebotsnamen und weitere Angebotsdetails sind
        in dieser Datengrundlage nicht verfügbar.
      </p>
      {rows.map((row, index) => (
        <div key={index} className="mt-4">
          <p className="text-xs text-slate-500">{row.range}</p>
          <DistributionBar
            label="Name nicht verfügbar"
            value={row.count}
            max={Math.max(1, ...rows.map((entry) => entry.count))}
          />
          {row.sample !== null && (
            <p className="mt-1 text-xs text-slate-500">
              Datengrundlage: {number(row.sample)}
            </p>
          )}
        </div>
      ))}
      {!rows.length && (
        <p className="mt-3 text-sm text-slate-500">
          {released(rootStatus)
            ? 'Keine freigegebenen Angebotswerte verfügbar.'
            : status(rootStatus)}
        </p>
      )}
    </div>
  )
}
function Scope({ section }: { section: Json }) {
  const p = object(section.period)
  const validDate = (value: unknown): value is string =>
    typeof value === 'string' && Number.isFinite(Date.parse(value))
  const date = validDate(section.as_of) ? formatBerlin(section.as_of) : null
  let caption = 'Bezugszeitraum nicht verfügbar'
  switch (section.scope) {
    case 'selected_period':
      if (
        validDate(p.from) &&
        validDate(p.to) &&
        Date.parse(p.from) < Date.parse(p.to)
      ) {
        caption = formatBerlinRange(p.from, p.to)
      }
      break
    case 'whole_completed_iso_weeks':
      caption = `Abgeschlossene Wochen · Stand ${date ?? 'nicht verfügbar'}`
      break
    case 'current_stock':
      caption = date
        ? `Bestand am ${date}`
        : 'Aktueller Bestand · Stichtag nicht verfügbar'
      break
    case 'recorded_current_stock':
      caption = `Gespeicherter Bestand · Stand ${date ?? 'nicht verfügbar'}`
      break
  }
  return <p className="mt-1 text-sm text-slate-500">{caption}</p>
}

function Rows({
  rows,
  title = 'Kennzahlen & Datengrundlage',
  open = false,
}: {
  rows: AggregateRow[]
  title?: string
  open?: boolean
}) {
  if (!rows.length)
    return (
      <p className="mt-3 text-sm text-slate-500">
        Keine freigegebenen Werte verfügbar.
      </p>
    )
  return (
    <details open={open} className="mt-4 text-sm">
      <summary className="cursor-pointer font-semibold text-[#0874d1]">
        {title}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Kennzahlen mit Status, Stichprobe und Bezugszeitraum
          </caption>
          <thead>
            <tr>
              {['Kennzahl', 'Wert', 'Status', 'Stichprobe', 'Bezug'].map(
                (t) => (
                  <th
                    key={t}
                    className="border-b border-slate-200 p-2 font-semibold"
                  >
                    {t}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th className="min-w-40 border-b border-slate-100 p-2 font-medium">
                  {r.label}
                </th>
                <td className="border-b border-slate-100 p-2 tabular-nums">
                  {r.value === null ? '—' : number(r.value)}
                </td>
                <td className="border-b border-slate-100 p-2">
                  {status(r.status)}
                </td>
                <td className="border-b border-slate-100 p-2">
                  {r.sample === null ? '—' : number(r.sample)}
                </td>
                <td className="min-w-48 border-b border-slate-100 p-2">
                  {scopeLabel(r.scope)}
                  {typeof r.from === 'string' && typeof r.to === 'string' ? (
                    <small className="block">
                      {r.from === r.to
                        ? formatBerlin(r.from)
                        : formatBerlinRange(r.from, r.to)}
                    </small>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
function scopeLabel(scope: string) {
  return (
    (
      {
        selected_period: 'Gewählter Zeitraum',
        current_stock: 'Aktueller Bestand',
        recorded_current_stock: 'Gespeicherter Bestand',
        lifetime_snapshot: 'Gespeicherte Gesamtzyklen',
        whole_completed_iso_weeks: 'Vollständig abgeschlossene Kalenderwochen',
        comparison_period: 'Vergleichszeitraum',
        not_instrumented: 'Messgrundlage fehlt',
      } as Record<string, string>
    )[scope] ?? 'Quelle nicht verfügbar'
  )
}
function CoreMetrics({ data, keys }: { data: Dashboard; keys: string[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {keys.map((key) => (
        <div key={key} className="rounded-2xl bg-slate-50 p-4">
          <dt className="text-sm text-slate-600">{metricLabels[key]}</dt>
          <dd className="mt-2 text-2xl font-bold">
            {valueLabel(key, data.metrics[key])}
          </dd>
          <p className="mt-1 text-xs text-slate-500">
            {status(data.metrics[key]?.status)}
            {key === 'open_cards' ? ' · Aktueller Bestand' : ''}
          </p>
        </div>
      ))}
    </dl>
  )
}
function InsightMetrics({
  data,
  sectionKey,
  rows,
  note,
}: {
  data: Dashboard
  sectionKey: string
  rows: AggregateRow[]
  note?: string
}) {
  const section = insight(data, sectionKey),
    metricRows = rows.filter((r) => r.section === sectionKey),
    weekly = sectionKey === 'consumer_premium',
    tableFirst =
      weekly || sectionKey === 'offers'
  return (
    <div className={panel}>
      <h3 className="font-bold">
        {
          (
            {
              period_aggregates: 'Besuche im Zeitraum',
              loyalty: 'Stammgäste heute',
              stamp_program: 'Stempelprogramm',
              consumer_premium: 'Consumer-Premium',
              offers: 'Angebote im Vergleich',
              measurement_gaps: 'Messgrenzen',
            } as Record<string, string>
          )[sectionKey]
        }
      </h3>
      <Scope section={section} />
      {note && <p className="mt-3 text-sm leading-6 text-slate-600">{note}</p>}
      {!released(section.status) ? (
        <p className="mt-4 text-sm">{status(section.status)}</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metricRows
              .filter(
                (r) =>
                  !weekly &&
                  !r.label.includes(' · ') &&
                  !r.label.includes('Anteil (0–1)'),
              )
              .map((r, i) => (
                <div key={i} className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-sm text-slate-600">{r.label}</dt>
                  <dd className="mt-1 text-2xl font-bold">
                    {r.value === null ? '—' : number(r.value)}
                  </dd>
                  <p className="mt-1 text-xs text-slate-500">
                    {status(r.status)} · {scopeLabel(r.scope)}
                  </p>
                </div>
              ))}
          </dl>
          {sectionKey === 'stamp_program' && (
            <p className="mt-4 text-sm">
              Stempelziel:{' '}
              {safeNumber(section.stamp_target) ?? 'Nicht verfügbar'} ·
              Kartenzyklen sind keine Prämieneinlösungen.
            </p>
          )}
          <Rows rows={metricRows} open={tableFirst} />
        </>
      )}
    </div>
  )
}
function Buckets({
  section,
  keyName = 'buckets',
}: {
  section: Json
  keyName?: string
}) {
  const buckets = safeBuckets(section, keyName),
    max = Math.max(1, ...buckets.map((b) => safeNumber(b.count) ?? 0))
  if (!released(section.status))
    return <p className="mt-4 text-sm">{status(section.status)}</p>
  if (!buckets.length)
    return (
      <p className="mt-4 text-sm">
        Keine freigegebenen Gruppenwerte verfügbar.
      </p>
    )
  return (
    <div className="mt-4 space-y-3">
      {buckets.map((b, i) => (
        <div key={i}>
          <div className="flex items-start justify-between gap-3 text-sm">
            <span>{knownLabel(bucketNames, b.code, 'Unbekannte Gruppe')}</span>
            <strong className="tabular-nums">
              {released(b.status) && safeNumber(b.count) !== null
                ? number(Number(b.count))
                : '—'}
              {released(b.status) && safeNumber(b.share) !== null ? (
                <small className="ml-2 font-normal text-slate-500">
                  {percent(Number(b.share))}
                </small>
              ) : null}
            </strong>
          </div>
          {released(b.status) && safeNumber(b.count) !== null ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#118cff]"
                style={{
                  width: `${safeNumber(b.share) !== null ? Number(b.share) * 100 : (Number(b.count) / max) * 100}%`,
                }}
              />
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{status(b.status)}</p>
          )}
        </div>
      ))}
    </div>
  )
}
function Peaks({ data }: { data: Dashboard }) {
  const breakdown = data.breakdowns
  return (
    <div className={panel}>
      <h3 className="font-bold">Besuchszeiten & Verteilung</h3>
      <p className="mt-2 text-sm text-slate-500">
        Nur vollständig abgeschlossene Kalenderwochen. Kleine Gruppen werden
        ausgeblendet. Öffnungszeiten sind keine Messgrundlage für schwache
        Nachfrage.
      </p>
      {!released(breakdown.status) ? (
        <p className="mt-4">{status(breakdown.status)}</p>
      ) : (
        objects(breakdown.weeks).map((week, i) => {
          const dim = object(week.peak_times),
            buckets =
              released(childStatus(week)) && released(dim.status)
                ? objects(dim.buckets).filter(
                    (b) =>
                      released(childStatus(b)) && safeNumber(b.visits) !== null,
                  )
                : [],
            max = Math.max(1, ...buckets.map((b) => Number(b.visits)))
          return (
            <details key={i} className="mt-4 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-sm font-semibold">
                {formatBerlinRange(String(week.from), String(week.to))} ·{' '}
                {(
                  {
                    weekday_hour: 'Wochentag & Stunde',
                    weekday: 'Wochentag',
                    daypart: 'Tagesabschnitt',
                  } as Record<string, string>
                )[String(dim.granularity)] ?? 'Besuchszeiten'}
              </summary>
              {buckets.length ? (
                <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
                  {buckets.map((b, j) => (
                    <DistributionBar
                      key={j}
                      label={peakLabel(b)}
                      value={b.visits}
                      max={max}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  {released(childStatus(week)) &&
                  dim.status === 'empty' &&
                  Array.isArray(dim.buckets) &&
                  dim.buckets.length === 0
                    ? 'Keine Besuche in dieser abgeschlossenen Woche.'
                    : 'Keine freigegebenen Besuchszeitwerte verfügbar.'}
                </p>
              )}
            </details>
          )
        })
      )}
    </div>
  )
}
export function PartnerStatistics({
  data,
  compact = false,
}: {
  data: Dashboard
  compact?: boolean
}) {
  const keys = ['visits', 'guests', 'returning_guest_share', 'redemptions'],
    icons = [Users, UserRound, History, Ticket],
    rows = compact ? [] : dashboardDetailRows(data)
  const insightsRoot = object(data.insights)
  const offersVersionSupported =
    insightsRoot.definition_version === insightVersion &&
    object(object(insightsRoot.sections).offers).definition_version ===
      insightVersion
  const levels = insight(data, 'customer_levels'),
    badges = insight(data, 'guest_badges'),
    feedback = data.metrics.feedback,
    feedbackScope = object(feedback?.scope)
  return (
    <div className="space-y-7">
      <p className="text-sm text-slate-500">
        {compact ? 'Letzte 7 Tage · ' : ''}
        {formatBerlinRange(data.period.from, data.period.to)}
      </p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {keys.map((key, index) => {
          const Icon = icons[index],
            metric = data.metrics[key],
            c = data.comparison[key],
            validComparison =
              c && (released(c.status) || c.status === 'no_comparison')
          return (
            <article key={key} className={`${panel} [overflow-wrap:anywhere]`}>
              <Icon size={24} className="mb-4 text-[#118cff]" />
              <h3 className="text-sm font-medium text-slate-600">
                {metricLabels[key]}
              </h3>
              <p className="mt-2 text-3xl font-bold tracking-tight xl:text-4xl">
                {valueLabel(key, metric)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {status(metric?.status)}
              </p>
              {c && (
                <p className="mt-2 text-xs text-slate-600">
                  {validComparison &&
                  metricNumber(metric) !== null &&
                  c.status !== 'no_comparison' &&
                  safeNumber(c.relative_change, true) !== null
                    ? `${percent(c.relative_change!)} zum Vergleichszeitraum`
                    : 'Kein relativer Vergleich möglich'}
                  {validComparison &&
                  metricNumber(metric) !== null &&
                  safeNumber(c.previous) !== null
                    ? ` · zuvor ${valueLabel(key, { status: 'ok', value: c.previous })}`
                    : ''}
                </p>
              )}
            </article>
          )
        })}
      </div>
      {!compact && (
        <nav aria-label="Statistikbereiche" className="flex flex-wrap gap-2">
          {statisticsTopics.map(([id, label]) => (
            <a
              className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#0874d1] hover:border-[#118cff]"
              href={`#${id}`}
              key={id}
            >
              {label}
            </a>
          ))}
        </nav>
      )}
      <Topic id="visits" title={compact ? 'Besuchsverlauf' : 'Besuche'}>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className={panel}>
            <h3 className="font-bold">Besuchsverlauf</h3>
            <p className="mt-1 text-sm text-slate-500">
              Bestätigte Besuche inklusive Nulltage · Randzeiträume können
              unvollständig sein.
            </p>
            {data.series.daily && <VisitChart series={data.series.daily} />}{' '}
            {!compact && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-semibold text-[#0874d1]">
                  Wochen & Monate
                </summary>
                {['weekly', 'monthly'].map(
                  (key) =>
                    data.series[key] && (
                      <div key={key} className="mt-5">
                        <h4 className="font-semibold">
                          {key === 'weekly'
                            ? 'Besuche je Woche'
                            : 'Besuche je Monat'}
                        </h4>
                        <VisitChart series={data.series[key]} />
                      </div>
                    ),
                )}
              </details>
            )}
          </section>
          <ReturningRing metric={data.metrics.returning_guest_share} />
        </div>
        {!compact && (
          <>
            <InsightMetrics
              data={data}
              sectionKey="period_aggregates"
              rows={rows}
              note="Besuche je Kalendertag berücksichtigen Nulltage. Einlösungen je Besuch sind keine Conversion. Besuchsabstände sind tatsächliche Zeitintervalle in 24-Stunden-Tagen; nur vollständig freigegebene Wochen fließen ein."
            />
            <Peaks data={data} />
          </>
        )}
      </Topic>
      {!compact && (
        <>
          <Topic id="guests" title="Gäste">
            <div className={panel}>
              <CoreMetrics
                data={data}
                keys={[
                  'guests',
                  'first_time_guests',
                  'returning_guests',
                  'returning_guest_share',
                  'return_30d',
                ]}
              />
              <p className="mt-4 text-sm text-slate-500">
                Erstmalige und wiederkehrende Gäste können sich überschneiden.
                Nur vollständig gereifte Erstbesuchswochen fließen in die
                Rückkehr innerhalb von 30 Tagen ein.
                {data.metrics.return_30d?.coverage_from &&
                data.metrics.return_30d?.coverage_to
                  ? ` Abdeckung: ${formatBerlinRange(data.metrics.return_30d.coverage_from, data.metrics.return_30d.coverage_to)}.`
                  : ''}
              </p>
            </div>
            <InsightMetrics
              data={data}
              sectionKey="loyalty"
              rows={rows}
              note="Aktive Stammgäste: mindestens vier Lifetime-Besuche und letzter Besuch in 30 Tagen. Vier Besuche in 30 Tagen zählt dagegen tatsächliche Besuche im festen 720-Stunden-Fenster."
            />
            <div className={panel}>
              <h3 className="font-bold">Besuchshäufigkeit</h3>
              <Scope section={insight(data, 'visit_frequency')} />
              <p className="mt-2 text-sm text-slate-500">
                Lifetime-Besuche bisheriger Gäste, unabhängig vom ausgewählten
                Zeitraum.
              </p>
              <Buckets section={insight(data, 'visit_frequency')} />
              <Rows
                rows={rows.filter((r) => r.section === 'visit_frequency')}
              />
            </div>
            <InsightMetrics
              data={data}
              sectionKey="consumer_premium"
              rows={rows}
              note="Premium-Status beim Besuch einschließlich Consumer-Testphase. Das ist kein Partner-Pro-Tarif. Fehlende Ereignissnapshots bleiben unbekannt; nur vollständige Wochen sind auswertbar."
            />
          </Topic>
          <Topic id="levels" title="Gäste-Level">
            <div className="grid items-start gap-5 lg:grid-cols-2">
              <div className={panel}>
                <h3 className="font-bold">Deine Gäste nach Treuestufe</h3>
                <Scope section={levels} />
                <Buckets section={levels} keyName="group_buckets" />
                <details className="mt-5 text-sm">
                  <summary className="cursor-pointer font-semibold text-[#0874d1]">
                    Alle 14 Unterstufen
                  </summary>
                  <Buckets section={levels} />
                </details>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Bronze IV vor dem ersten Besuch ist nicht auswertbar: Eine
                  bestätigte Interessentenpopulation fehlt. Ein erster Besuch
                  ohne Stempel zählt bereits. Stufen bleiben bei Inaktivität
                  erhalten.
                </p>
              </div>
              <div className={panel}>
                <h3 className="font-bold">Gastabzeichen</h3>
                <Scope section={badges} />
                <Buckets section={badges} />
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  Erster Besuch: mindestens ein bestätigter Besuch. Stammgast:
                  mindestens zehn Lifetime-Besuche. Diese beiden
                  Gruppen überlappen sich.
                </p>
              </div>
            </div>
            <div className={panel}>
              <Rows
                rows={rows.filter((r) =>
                  ['customer_levels', 'guest_badges'].includes(r.section),
                )}
                title="Stufen, Abzeichen & Datengrundlage"
              />
            </div>
          </Topic>
          <Topic id="offers" title="Angebote">
            <div className={panel}>
              <CoreMetrics
                data={data}
                keys={['redemptions', 'offer_conversion']}
              />
              <p className="mt-3 text-sm text-slate-500">
                Einlösungen zählen bestätigte, nicht stornierte Vorteile.
                Auswahl ist keine Einlösung; eine Wirkung wird daraus nicht
                abgeleitet.
              </p>
            </div>
            {!offersVersionSupported ? (
              <LegacyOffers data={data} />
            ) : (
              <>
                <InsightMetrics
                  data={data}
                  sectionKey="offers"
                  rows={rows}
                  note="Konkrete Angebote und Angebotstypen werden getrennt ausgewertet. Eindeutige Gäste nicht über Angebote aufsummieren; Erst- und Wiederkehrgäste können sich überschneiden. Katalognamen entsprechen dem aktuellen öffentlichen Stand."
                />
                <div className={panel}>
                  <h3 className="font-bold">
                    Einlösungen je Angebot und Angebotstyp
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Separat gemessene Angebote und Typen; nicht addieren. Jede
                    Zeile zeigt ihre vollständige Woche.
                  </p>
                  {rows
                    .filter(
                      (r) =>
                        r.section === 'offers' &&
                        r.label.endsWith(' · Einlösungen'),
                    )
                    .map((r, i) => (
                      <div key={i} className="mt-3">
                        <p className="text-xs text-slate-500">
                          {typeof r.from === 'string' &&
                          typeof r.to === 'string'
                            ? formatBerlinRange(r.from, r.to)
                            : ''}
                        </p>
                        {r.value === null ? (
                          <p className="text-sm">
                            {r.label} · {status(r.status)}
                          </p>
                        ) : (
                          <DistributionBar
                            label={r.label}
                            value={r.value}
                            max={Math.max(
                              1,
                              ...rows
                                .filter(
                                  (v) =>
                                    v.section === 'offers' &&
                                    v.label.endsWith(' · Einlösungen'),
                                )
                                .map((v) => v.value ?? 0),
                            )}
                          />
                        )}
                      </div>
                    ))}
                  {!rows.some(
                    (r) =>
                      r.section === 'offers' &&
                      r.label.endsWith(' · Einlösungen'),
                  ) && (
                    <p className="mt-3 text-sm text-slate-500">
                      Keine freigegebenen Angebotswerte verfügbar.
                    </p>
                  )}
                </div>
              </>
            )}
          </Topic>
          <Topic id="loyalty" title="Treue">
            <div className={panel}>
              <CoreMetrics
                data={data}
                keys={[
                  'stamps',
                  'open_cards',
                  'reward_redemptions',
                  'card_completion_rate',
                ]}
              />
            </div>
            <InsightMetrics
              data={data}
              sectionKey="stamp_program"
              rows={rows}
              note="Aktueller Kartenbestand und Fortschritt relativ zum tatsächlich hinterlegten Stempelziel. Abgeschlossene Zyklen sind gespeicherte Gesamtwerte und keine ausgegebenen Prämien."
            />
            <div className={panel}>
              <h3 className="font-bold">Kartenfortschritt zum echten Ziel</h3>
              <Buckets section={insight(data, 'stamp_program')} />
            </div>
          </Topic>
          <Topic id="growth" title="Wachstum">
            <div className={panel}>
              <h3 className="font-bold">Vergleich zum vorherigen Zeitraum</h3>
              {data.comparison_period?.from && data.comparison_period?.to && (
                <p className="mt-2 text-sm text-slate-500">
                  Vorher:{' '}
                  {formatBerlinRange(
                    data.comparison_period.from,
                    data.comparison_period.to,
                  )}{' '}
                  · Aktuell:{' '}
                  {formatBerlinRange(data.period.from, data.period.to)}
                </p>
              )}
              <p className="mt-3 text-sm text-slate-500">
                Relative Änderungen sind Anteile; ein Vorwert von null erzeugt
                keinen erfundenen Prozentzuwachs.
              </p>
              <Rows
                rows={rows.filter((r) => r.section === 'comparison')}
                title="Alle sechs Kennzahlen vergleichen"
                open
              />
            </div>
          </Topic>
          <Topic id="feedback" title="Feedback">
            <div className={panel}>
              <h3 className="font-bold">
                Gästefeedback · letzte abgeschlossene Kalenderwoche
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Unabhängig vom ausgewählten Statistikzeitraum. Mindestens fünf
                Antworten erforderlich.
                {typeof feedbackScope.from === 'string' &&
                typeof feedbackScope.to === 'string'
                  ? ` ${formatBerlinRange(feedbackScope.from, feedbackScope.to)}.`
                  : ''}
              </p>
              <p className="mt-4 text-4xl font-bold">
                {feedback?.status === 'ok' &&
                safeRating(feedback.average_rating) !== null
                  ? `${number(feedback.average_rating!)} / 5`
                  : '—'}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {feedback?.reason === 'feedback_pro_required'
                  ? 'Besuchsfeedback ist eine Pro-Leistung.'
                  : status(feedback?.status)}
                {released(feedback?.status) &&
                safeNumber(feedback?.response_count) !== null
                  ? ` · ${number(feedback.response_count!)} Antworten`
                  : ''}
              </p>
              {feedback?.status === 'ok' &&
                feedback.categories_status === 'ok' && (
                  <div className="mt-4">
                    {Object.entries({
                      ...feedback.clarity,
                      ...feedback.issues,
                    }).map(([key, count]) => (
                      <DistributionBar
                        key={key}
                        label={
                          (
                            {
                              clear: 'Verständlich',
                              mostly_clear: 'Überwiegend verständlich',
                              unclear: 'Unverständlich',
                              none: 'Keine Probleme',
                              deal: 'Problem mit dem Angebot',
                              stamp: 'Problem mit dem Stempel',
                              scan: 'Problem beim Scannen',
                              other: 'Sonstiges',
                            } as Record<string, string>
                          )[
                            Object.hasOwn(
                              {
                                clear: 1,
                                mostly_clear: 1,
                                unclear: 1,
                                none: 1,
                                deal: 1,
                                stamp: 1,
                                scan: 1,
                                other: 1,
                              },
                              key,
                            )
                              ? key
                              : '__unknown__'
                          ] ?? 'Weitere Kategorie'
                        }
                        value={count}
                        max={feedback.response_count ?? 0}
                      />
                    ))}
                  </div>
                )}
            </div>
          </Topic>
          <details className={panel}>
            <summary className="cursor-pointer font-semibold">
              Daten & Definitionen
            </summary>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Bestand, gewählter Zeitraum, vollständige Wochen und gereifte
              Kohorten sind verschiedene Populationen. Geschützte, gesperrte und
              fehlende Werte bleiben getrennt von gemessener null. ROI,
              Angebotskonversion, echte Prämieneinlösungen, Kartenabschlussquote
              und Kampagnenerfolg benötigen weitere belastbare Quellen. CRM
              zeigt Entwürfe und Zielgruppenvorschauen; Versand ist noch nicht
              verfügbar.
            </p>
            <Rows rows={rows.filter((r) => r.section === 'measurement_gaps')} />
          </details>
        </>
      )}
    </div>
  )
}
