import { metricLabels, type Dashboard } from './analytics'
// Rendering only: every value and privacy status comes from the export RPC.
export function dashboardCsv(data: Dashboard) {
  const cell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const rows: unknown[][] = [
    [
      'Kennzahl',
      'Status',
      'Wert',
      'Stichprobe',
      'Bezug',
      'Von',
      'Bis',
      'Zeitzone',
    ],
  ]
  for (const [key, label] of Object.entries(metricLabels)) {
    const m = data.metrics[key]
    rows.push([
      label,
      m?.status,
      ['ok', 'empty'].includes(m?.status) ? m?.value : null,
      m?.sample_size,
      key === 'open_cards'
        ? 'Aktueller Bestand'
        : key === 'return_30d'
          ? 'Vollständig gereifte Erstbesuchswochen'
          : key === 'returning_guest_share'
            ? 'Gewählter Zeitraum; Anteil 0–1'
            : 'Gewählter Zeitraum',
      key === 'open_cards'
        ? data.as_of
        : key === 'return_30d'
          ? m?.coverage_from
          : data.period.from,
      key === 'open_cards'
        ? data.as_of
        : key === 'return_30d'
          ? m?.coverage_to
          : data.period.to,
      'Europe/Berlin',
    ])
  }
  const feedback = data.metrics.feedback,
    scope = feedback?.scope as { from?: string; to?: string } | undefined
  if (feedback)
    rows.push([
      'Gästefeedback (Bewertung 1–5)',
      feedback.status,
      feedback.status === 'ok' ? feedback.average_rating : null,
      feedback.sample_size,
      'Letzte abgeschlossene Kalenderwoche',
      scope?.from,
      scope?.to,
      'Europe/Berlin',
    ])
  return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n')
}
