import type { SupabaseClient } from '@supabase/supabase-js'
export const dashboardTimezone = 'Europe/Berlin'
export type Metric = {
  status: string
  value?: number
  sample_size?: number | null
  reason?: string
  scope?: unknown
  coverage_from?: string
  coverage_to?: string
  average_rating?: number | null
  response_count?: number | null
  categories_status?: string
  clarity?: Record<string, number>
  issues?: Record<string, number>
}
export type Dashboard = {
  definition_version: string
  partner_id: string
  as_of: string
  period: { from: string; to: string }
  metrics: Record<string, Metric>
  comparison: Record<
    string,
    {
      status?: string
      previous?: number
      absolute_change?: number
      relative_change?: number
    }
  >
  series: Record<
    string,
    { status: string; buckets?: { start: string; visits: number }[] }
  >
  breakdowns: {
    status: string
    weeks?: {
      from: string
      to: string
      peak_times: {
        status: string
        granularity?: string
        buckets?: Record<string, string | number>[]
      }
      visit_frequency: {
        status: string
        buckets?: Record<string, string | number>[]
      }
      offers: { status: string; buckets?: Record<string, string | number>[] }
    }[]
  }
}
export type Window = { from: string; to: string }
function berlinParts(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: dashboardTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
}
// Convert a Berlin calendar midnight, never the server/browser local timezone.
export function berlinMidnight(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Ungültiges Datum.')
  const target = Date.parse(`${day}T00:00:00Z`)
  if (
    !Number.isFinite(target) ||
    new Date(target).toISOString().slice(0, 10) !== day
  )
    throw new Error('Ungültiges Datum.')
  let instant = target
  for (let i = 0; i < 3; i++) {
    const p = berlinParts(new Date(instant))
    const local = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    )
    instant += target - local
  }
  return new Date(instant).toISOString()
}
export function dashboardWindow(
  preset: string,
  now = new Date(),
  from?: string,
  to?: string,
): Window {
  const p = berlinParts(now)
  const day = `${p.year}-${p.month}-${p.day}`
  const date = new Date(`${day}T00:00:00Z`)
  if (preset === 'custom') {
    if (!from || !to) throw new Error('Bitte Anfang und Ende wählen.')
    berlinMidnight(to)
    const endDay = new Date(`${to}T00:00:00Z`)
    endDay.setUTCDate(endDay.getUTCDate() + 1)
    return {
      from: berlinMidnight(from),
      to:
        to === day
          ? now.toISOString()
          : berlinMidnight(endDay.toISOString().slice(0, 10)),
    }
  }
  if (preset === 'month') {
    date.setUTCDate(1)
    const end = date.toISOString().slice(0, 10)
    date.setUTCMonth(date.getUTCMonth() - 1)
    return {
      from: berlinMidnight(date.toISOString().slice(0, 10)),
      to: berlinMidnight(end),
    }
  }
  if (!['today', 'last7', 'last30'].includes(preset))
    throw new Error('Ungültiger Zeitraum.')
  date.setUTCDate(
    date.getUTCDate() - ({ today: 0, last7: 6, last30: 29 }[preset] ?? 0),
  )
  return {
    from: berlinMidnight(date.toISOString().slice(0, 10)),
    to: now.toISOString(),
  }
}
export async function readDashboard(
  client: SupabaseClient,
  partnerId: string,
  window: Window,
  exporting = false,
): Promise<Dashboard> {
  const { data, error } = await client.rpc(
    exporting ? 'export_partner_dashboard' : 'get_partner_dashboard',
    {
      p_partner_id: partnerId,
      p_from: window.from,
      p_to: window.to,
      p_timezone: dashboardTimezone,
    },
  )
  if (
    error ||
    !data ||
    data.partner_id !== partnerId ||
    data.definition_version !== 'partner-dashboard-v1'
  )
    throw new Error(error?.message ?? 'Statistik konnte nicht geladen werden.')
  return data
}
export function formatBerlin(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: dashboardTimezone,
    dateStyle: 'medium',
  }).format(new Date(value))
}
export const metricLabels: Record<string, string> = {
  visits: 'Besuche',
  guests: 'Gäste',
  first_time_guests: 'Erstmalige Gäste',
  returning_guests: 'Wiederkehrende Gäste',
  returning_guest_share: 'Wiederkehranteil',
  stamps: 'Stempel',
  redemptions: 'Einlösungen',
  open_cards: 'Offene Stempelkarten',
  return_30d: 'Rückkehr innerhalb von 30 Tagen',
  reward_redemptions: 'Prämieneinlösungen',
  card_completion_rate: 'Kartenabschlussquote',
  offer_conversion: 'Angebotskonversion',
}
export const statusLabels: Record<string, string> = {
  ok: 'Gemessen',
  empty: 'Noch keine Ereignisse',
  no_data: 'Keine Daten',
  suppressed: 'Aus Datenschutzgründen ausgeblendet',
  unavailable: 'Nicht verfügbar',
  locked: 'Im aktuellen Tarif gesperrt',
  not_yet_evaluable: 'Noch nicht auswertbar',
  no_comparison: 'Kein Vergleich möglich',
}

export function formatBerlinRange(from: string, to: string) {
  const end = new Date(to),
    p = berlinParts(end)
  const midnight =
    p.hour === '00' &&
    p.minute === '00' &&
    p.second === '00' &&
    end.getUTCMilliseconds() === 0
  const endLabel = midnight
    ? formatBerlin(new Date(end.getTime() - 1).toISOString())
    : new Intl.DateTimeFormat('de-DE', {
        timeZone: dashboardTimezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(end)
  return `${formatBerlin(from)} – ${endLabel}`
}
