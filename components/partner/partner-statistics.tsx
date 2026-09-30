import {
  formatBerlin,
  formatBerlinRange,
  metricLabels,
  statusLabels,
  type Dashboard,
  type Metric,
} from '@/lib/partners/analytics'
function valueLabel(key: string, metric: Metric) {
  if (
    !['ok', 'empty'].includes(metric.status) ||
    typeof metric.value !== 'number'
  )
    return '—'
  return new Intl.NumberFormat('de-DE', {
    ...(key === 'return_30d' || key === 'returning_guest_share'
      ? { style: 'percent' as const, maximumFractionDigits: 1 }
      : { maximumFractionDigits: 0 }),
  }).format(metric.value)
}
const feedbackCategoryLabels: Record<string, string> = {
  clear: 'Verständlich', mostly_clear: 'Überwiegend verständlich', unclear: 'Unverständlich',
  none: 'Keine Probleme', deal: 'Problem mit dem Angebot', stamp: 'Problem mit dem Stempel',
  scan: 'Problem beim Scannen', other: 'Sonstiges',
}

export function PartnerStatistics({
  data,
  compact = false,
}: {
  data: Dashboard
  compact?: boolean
}) {
  const keys = compact
    ? ['visits', 'guests', 'redemptions']
    : Object.keys(metricLabels).filter(
        (key) => !['locked', 'unavailable'].includes(data.metrics[key]?.status),
      )
  const deferred = Object.keys(metricLabels).filter((key) =>
    ['locked', 'unavailable'].includes(data.metrics[key]?.status),
  )
  const feedback = data.metrics.feedback
  const scope = feedback?.scope as { from?: string; to?: string } | undefined
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        {formatBerlinRange(data.period.from, data.period.to)} · Europe/Berlin ·
        Stand{' '}
        {new Intl.DateTimeFormat('de-DE', {
          timeZone: 'Europe/Berlin',
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(data.as_of))}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {keys.map((key) => {
          const metric = data.metrics[key]
          if (!metric) return null
          const comparison = data.comparison[key]
          return (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-5"
              key={key}
            >
              <h3 className="text-sm font-medium text-slate-600">
                {metricLabels[key]}
              </h3>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {valueLabel(key, metric)}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {statusLabels[metric.status] ?? 'Status unbekannt'}
                {key === 'open_cards' ? ' · Aktueller Bestand' : ''}
              </p>
              {comparison && (
                <p className="mt-2 text-xs text-slate-600">
                  {typeof comparison.relative_change === 'number'
                    ? `${new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'always' }).format(comparison.relative_change)} zum Vergleichszeitraum`
                    : 'Kein relativer Vergleich möglich'}
                  {typeof comparison.previous === 'number'
                    ? ` · zuvor ${valueLabel(key, { status: 'ok', value: comparison.previous })}`
                    : ''}
                </p>
              )}
              {key === 'return_30d' && (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Nur vollständig gereifte Erstbesuchswochen.
                  {metric.coverage_from && metric.coverage_to
                    ? ` Abdeckung: ${formatBerlinRange(metric.coverage_from, metric.coverage_to)}.`
                    : ''}
                </p>
              )}
            </article>
          )
        })}
      </div>
      {!compact && (
        <p className="text-sm text-slate-500">
          Erstmalige und wiederkehrende Gäste können sich überschneiden. Besuche
          zählen bestätigte Besuche; Einlösungen zählen bestätigte, nicht
          stornierte Vorteile. Es werden keine Umsätze abgeleitet.
        </p>
      )}
      {Object.entries(data.series)
        .filter(([key]) => !compact || key === 'daily')
        .map(([key, series]) => (
          <section
            className="rounded-2xl border border-slate-200 bg-white p-5"
            key={key}
          >
            <h3 className="font-bold">
              Besuchsverlauf ·{' '}
              {(
                {
                  daily: 'Tage',
                  weekly: 'Wochen',
                  monthly: 'Monate',
                } as Record<string, string>
              )[key] ?? key}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {statusLabels[series.status] ?? 'Nicht verfügbar'} · Randzeiträume
              können unvollständig sein.
            </p>
            {series.buckets?.length ? (
              <div
                className="mt-4 max-h-64 overflow-auto focus-visible:outline-2 focus-visible:outline-sky-600"
                tabIndex={0}
                role="region"
                aria-label="Besuchsverlauf scrollen"
              >
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="pb-2">Zeitraum beginnt</th>
                      <th className="pb-2 text-right">Besuche</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.buckets.map((b) => (
                      <tr className="border-t border-slate-100" key={b.start}>
                        <td className="py-2">{formatBerlin(b.start)}</td>
                        <td className="py-2 text-right font-semibold">
                          {b.visits}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ))}
      {!compact && deferred.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold">Weitere Auswertungen</h3>
          {data.metrics.return_30d?.status === 'locked' && (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Kommen neue Gäste innerhalb von 30 Tagen wieder? Pro zeigt dir
              auswertbare Rückkehrquoten, Vergleiche und häufige Besuchszeiten.
              So erkennst du, wann Gäste wiederkommen und welche Zeiten sich für
              Vorteile eignen.
            </p>
          )}
          <ul className="mt-3 space-y-2 text-sm">
            {deferred.map((key) => (
              <li key={key}>
                <span className="font-medium">{metricLabels[key]}</span> ·{' '}
                {statusLabels[data.metrics[key].status]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Für Prämieneinlösungen, Kartenabschlussquote und Angebotskonversion
            fehlen noch belastbare Messgrundlagen. Sie werden auch in Pro nicht
            als null Ereignisse ausgegeben.
          </p>
        </section>
      )}
      {!compact && feedback && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold">
            Gästefeedback · letzte abgeschlossene Kalenderwoche
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Unabhängig vom ausgewählten Statistikzeitraum.
            {scope?.from && scope.to
              ? ` ${formatBerlinRange(scope.from, scope.to)}.`
              : ''}
          </p>
          <p className="mt-4 text-2xl font-bold">
            {feedback.status === 'ok' &&
            typeof feedback.average_rating === 'number'
              ? `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(feedback.average_rating)} / 5`
              : '—'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {statusLabels[feedback.status]}
            {typeof feedback.response_count === 'number'
              ? ` · ${feedback.response_count} Antworten`
              : ''}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Kategorien:{' '}
            {statusLabels[feedback.categories_status ?? 'unavailable'] ??
              'Nicht verfügbar'}
          </p>
          {feedback.categories_status === 'ok' && (
            <dl className="mt-2 text-sm">
              {Object.entries({ ...feedback.clarity, ...feedback.issues }).map(
                ([key, count]) => (
                  <div key={key}>
                    <dt>{Object.hasOwn(feedbackCategoryLabels, key) ? feedbackCategoryLabels[key] : 'Weitere Kategorie'}</dt>
                    <dd>{count}</dd>
                  </div>
                ),
              )}
            </dl>
          )}
        </section>
      )}
      {!compact && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold">Besuchszeiten & Verteilung</h3>
          <p className="mt-2 text-sm text-slate-500">
            Nur vollständig abgeschlossene Kalenderwochen im gewählten Zeitraum.
            Kleine Gruppen werden ausgeblendet.{' '}
            {statusLabels[data.breakdowns.status]}
          </p>
          {data.breakdowns.weeks?.map((week) => (
            <div
              key={week.from}
              className="mt-5 border-t border-slate-100 pt-4"
            >
              <h4 className="text-sm font-semibold">
                {formatBerlinRange(week.from, week.to)}
              </h4>
              {(['peak_times', 'visit_frequency', 'offers'] as const).map(
                (key) => {
                  const dimension = week[key]
                  return (
                    <div className="mt-3" key={key}>
                      <p className="text-sm font-medium">
                        {key === 'peak_times'
                          ? 'Besuchszeiten'
                          : key === 'visit_frequency'
                            ? 'Besuchshäufigkeit'
                            : 'Vorteilseinlösungen'}
                        {key === 'peak_times' && week.peak_times.granularity
                          ? ` · ${({ weekday_hour: 'Wochentag & Stunde', weekday: 'Wochentag', daypart: 'Tagesabschnitt' } as Record<string, string>)[week.peak_times.granularity]}`
                          : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {statusLabels[dimension.status]}
                      </p>
                      {dimension.buckets?.length ? (
                        <ul className="mt-2 space-y-1 text-sm">
                          {dimension.buckets.map((bucket, i) => (
                            <li key={i}>
                              {Object.entries(bucket)
                                .map(
                                  ([label, value]) =>
                                    `${({ weekday: 'Wochentag (1 = Mo)', hour: 'Stunde', daypart: 'Tagesabschnitt', visits: 'Besuche', guests: 'Gäste', sample_size: 'Stichprobe', deal_id: 'Vorteil', redemptions: 'Einlösungen', bin: 'Besuche je Gast' } as Record<string, string>)[label] ?? label}: ${value ?? 'Nicht zugeordnet'}`,
                                )
                                .join(' · ')}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )
                },
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
