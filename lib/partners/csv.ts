import type { Dashboard } from './analytics'
import {
  dashboardDetailRows,
  object,
  released,
  safeNumber,
  safeRating,
  safeStatus,
} from './insights'
// Exactly the native aggregate projection. Export authorization is checked by the RPC.
export function dashboardCsv(data: Dashboard) {
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
  const names = {
    visits: 'Besuche',
    guests: 'Gäste',
    first_time_guests: 'Erstmalige Gäste',
    returning_guests: 'Wiederkehrende Gäste',
    returning_guest_share: 'Wiederkehranteil (0–1)',
    stamps: 'Stempel',
    redemptions: 'Einlösungen',
    open_cards: 'Offene Karten',
    return_30d: 'Rückkehr innerhalb von 30 Tagen (0–1)',
    reward_redemptions: 'Reward-Einlösungen',
    offer_conversion: 'Angebotskonversion',
    card_completion_rate: 'Kartenabschlussquote',
  }
  for (const [key, label] of Object.entries(names)) {
    const m = data.metrics[key],
      allowed = released(m?.status),
      stock = key === 'open_cards',
      cohort = key === 'return_30d'
    rows.push([
      label,
      safeStatus(m?.status),
      allowed ? safeNumber(m?.value) : null,
      allowed ? safeNumber(m?.sample_size) : null,
      stock
        ? 'current_stock'
        : cohort
          ? 'whole_matured_iso_cohort_weeks'
          : 'selected_period',
      stock ? data.as_of : cohort ? m?.coverage_from : data.period.from,
      stock ? data.as_of : cohort ? m?.coverage_to : data.period.to,
      'Europe/Berlin',
    ])
  }
  const feedback = data.metrics.feedback,
    scope = object(feedback?.scope)
  rows.push([
    'Feedback (Bewertung 1–5)',
    safeStatus(feedback?.status),
    feedback?.status === 'ok' ? safeRating(feedback.average_rating) : null,
    released(feedback?.status) ? safeNumber(feedback?.sample_size) : null,
    'latest_completed_iso_week',
    scope.from,
    scope.to,
    'Europe/Berlin',
  ])
  rows.push(
    ...dashboardDetailRows(data).map((r) => [
      r.label,
      r.status,
      r.value,
      r.sample,
      r.scope,
      r.from,
      r.to,
      'Europe/Berlin',
    ]),
  )
  const cell = (value: unknown) => {
    let text =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      Number.isInteger(value)
        ? BigInt(value).toString()
        : String(value ?? '')
    if (typeof value !== 'number' && /^\s*[=+@\-\t\r]/.test(text))
      text = "'" + text
    return `"${text.replaceAll('"', '""')}"`
  }
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
