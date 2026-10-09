import { isRetiredStreakDeal } from "@/lib/streak-retirement"
// Explicit, aggregate-only projection shared with the native dashboard.
import { chartBuckets } from '@/lib/partners/chart-data'
import type { Dashboard } from '@/lib/partners/analytics'
export const insightVersion = 'partner-dashboard-insights-v1'
export const insightNames: Record<string, string> = {
  customer_levels: 'Gäste-Level',
  guest_badges: 'Gastabzeichen',
  period_aggregates: 'Zeitraumkennzahlen',
  loyalty: 'Stammgäste',
  visit_frequency: 'Besuchshäufigkeit',
  stamp_program: 'Stempelprogramm',
  consumer_premium: 'Consumer-Premium',
  offers: 'Angebote',
  measurement_gaps: 'Messgrenzen',
}
export const insightMetricNames: Record<string, string> = {
  mean_visits_per_calendar_day: 'Besuche je Kalendertag',
  visits_with_offer: 'Besuche mit Einlösung',
  redemptions_per_visit: 'Einlösungen je Besuch',
  mean_visit_gap_days: 'Tage zwischen Besuchen',
  active_regular_guests: 'Aktive Stammgäste',
  four_visits_in_30_days: 'Mindestens 4 Besuche in 30 Tagen',
  card_stock: 'Kartenbestand',
  open_cards: 'Offene Karten',
  completed_lifetime_cycles: 'Abgeschlossene Kartenzyklen insgesamt',
  near_goal_cards: 'Karten nahe am Ziel',
  average_remaining_stamps: 'Fehlende Stempel je offener Karte',
  premium_visits: 'Premium-Besuche',
  premium_visit_share: 'Premium-Anteil an Besuchen (0–1)',
  premium_redemptions: 'Premium-Einlösungen',
  premium_redemptions_per_visit: 'Premium-Einlösungen je Besuch',
  reward_redemptions: 'Prämieneinlösungen',
  card_completion_rate: 'Kartenabschlussquote',
  offer_conversion: 'Angebotskonversion',
  roi: 'ROI',
  weak_demand_recommendation: 'Nachfrageempfehlung',
  binding_duration_by_offer: 'Kausale Bindungsdauer',
  crm_campaign_success: 'Kampagnenerfolg',
}
export const bucketNames: Record<string, string> = {
  B: 'Bronze',
  S: 'Silber',
  G: 'Gold',
  P: 'Platin',
  D: 'Diamant',
  B4: 'Bronze IV',
  B3: 'Bronze III',
  B2: 'Bronze II',
  B1: 'Bronze I',
  S3: 'Silber III',
  S2: 'Silber II',
  S1: 'Silber I',
  G3: 'Gold III',
  G2: 'Gold II',
  G1: 'Gold I',
  P3: 'Platin III',
  P2: 'Platin II',
  P1: 'Platin I',
  first_visit: 'Erster Besuch',
  regular_guest: 'Stammgast',
  zero: 'Ohne aktuellen Fortschritt',
  below_40_percent: 'Unter 40 %',
  '40_to_below_80_percent': '40 bis unter 80 %',
  '80_to_below_100_percent': '80 bis unter 100 %',
  '1': '1 Besuch',
  '2-3': '2–3 Besuche',
  '4-6': '4–6 Besuche',
  '7-10': '7–10 Besuche',
  '11-20': '11–20 Besuche',
  '>20': 'Über 20 Besuche',
  '4+': '4+ Besuche',
}
export const seriesUnits: Record<string, string> = {
  days: 'Tage',
  weeks: 'Wochen',
  months: 'Monate',
  quarters: 'Quartale',
}
export const offerTypeNames: Record<string, string> = {
  welcome: 'Willkommensangebot',
  happy_hour: 'Happy Hour',
  discount: 'Rabatt',
  '2for1': '2 für 1',
  two_for_one: '2 für 1',
  premium_reward: 'Premium-Prämie',
  stamp_card: 'Stempelprogramm',
  limited_drop: 'Deal Drop',
  deal_drop: 'Deal Drop',
  birthday: 'Geburtstag',
  comeback: 'Comeback',
  challenge: 'Challenge',
  free_item: 'Gratisartikel',
  bonus_stamp: 'Bonusstempel',
  permanent_discount: 'Dauerrabatt',
  unknown: 'Unbekannter Angebotstyp',
}
export type Json = Record<string, unknown>
export type AggregateRow = {
  section: string
  label: string
  status: string
  value: number | null
  sample: number | null
  scope: string
  from: unknown
  to: unknown
}
export const object = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {}
export const objects = (value: unknown): Json[] =>
  Array.isArray(value)
    ? value.filter(
        (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
      )
    : []
export const released = (status: unknown) =>
  status === 'ok' || status === 'empty'
export const safeNumber = (value: unknown, signed = false): number | null =>
  typeof value === 'number' && Number.isFinite(value) && (signed || value >= 0)
    ? value
    : null
export const safeRating = (value: unknown) => {
  const n = safeNumber(value)
  return n !== null && n >= 1 && n <= 5 ? n : null
}
export const safeStatus = (value: unknown): string =>
  typeof value === 'string' &&
  [
    'ok',
    'empty',
    'no_data',
    'suppressed',
    'unavailable',
    'locked',
    'not_yet_evaluable',
    'no_comparison',
  ].includes(value)
    ? value
    : 'unavailable'
export const childStatus = (child: Json, parent: unknown = 'ok') =>
  safeStatus(Object.hasOwn(child, 'status') ? child.status : parent)
export function safeDimension(raw: Json): Json {
  const status = safeStatus(raw.status)
  return released(status)
    ? raw
    : {
        status,
        from: raw.from,
        to: raw.to,
        reason: raw.reason,
        scope: raw.scope,
        unit: raw.unit,
        target: raw.target,
      }
}
function activeInsightDimension(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter(item => {
    const row = object(item)
    return row.code !== "series" && !isRetiredStreakDeal({ ...row, type: row.type ?? row.code })
  }).map(activeInsightDimension)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, activeInsightDimension(child)]))
  return value
}
export function insight(data: Dashboard, key: string): Json {
  const root = object(data.insights),
    section = object(activeInsightDimension(object(root.sections)[key]))
  if (
    root.definition_version !== insightVersion ||
    section.definition_version !== insightVersion
  )
    return { status: 'unavailable', reason: 'unsupported_or_missing_insights' }
  return {
    ...safeDimension(section),
    scope: section.scope,
    as_of: section.as_of,
    period: section.period,
    coverage: released(section.status) ? section.coverage : undefined,
  }
}
export function safeBuckets(section: Json, key = 'buckets'): Json[] {
  if (!released(section.status)) return []
  return objects(section[key]).map((b) => {
    const status = b.code === 'B4' ? 'unavailable' : childStatus(b)
    if (!released(status)) return { code: b.code, status, reason: b.reason }
    const share = safeNumber(b.share)
    return {
      ...b,
      status,
      count: safeNumber(b.count),
      share: share !== null && share <= 1 ? share : null,
    }
  })
}
export function knownLabel(
  labels: Record<string, string>,
  key: unknown,
  fallback: string,
) {
  const code = String(key)
  return Object.hasOwn(labels, code) ? labels[code] : fallback
}
export function offerName(b: Json) {
  return b.name_status === 'ok' && typeof b.name === 'string' && b.name.trim()
    ? b.name
    : 'Angebotsname nicht verfügbar'
}
export function peakLabel(b: Json) {
  return [
    Number.isInteger(b.weekday) &&
    Number(b.weekday) >= 1 &&
    Number(b.weekday) <= 7
      ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][Number(b.weekday) - 1]
      : '',
    Number.isInteger(b.hour) ? `${b.hour} Uhr` : '',
    b.daypart != null
      ? ({
          night_00_06: 'Nacht 00–06 Uhr',
          morning_06_12: 'Vormittag 06–12 Uhr',
          afternoon_12_18: 'Nachmittag 12–18 Uhr',
          evening_18_24: 'Abend 18–24 Uhr',
        }[String(b.daypart)] ?? 'Tagesabschnitt')
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
export function dashboardDetailRows(data: Dashboard): AggregateRow[] {
  const raw = data as unknown as Json,
    rows: AggregateRow[] = [],
    period = object(raw.period)
  const row = (
    section: string,
    label: string,
    status: unknown,
    value: unknown,
    sample: unknown,
    scope: string,
    from: unknown,
    to: unknown,
    signed = false,
  ) => {
    const state = safeStatus(status),
      allowed = released(state) || (signed && state === 'no_comparison')
    rows.push({
      section,
      label,
      status: state,
      value: allowed ? safeNumber(value, signed) : null,
      sample: allowed ? safeNumber(sample) : null,
      scope,
      from,
      to,
    })
  }
  for (const key of ['daily', 'weekly', 'monthly']) {
    const series = data.series[key],
      label = {
        daily: 'Besuche je Tag',
        weekly: 'Besuche je Woche',
        monthly: 'Besuche je Monat',
      }[key]!
    const buckets = chartBuckets(series)
    if (!buckets.length)
      row(
        'series',
        label,
        series?.status,
        null,
        null,
        'selected_period',
        period.from,
        period.to,
      )
    for (const b of buckets)
      row(
        'series',
        label,
        'ok',
        b.visits,
        null,
        'selected_period',
        b.start,
        null,
      )
  }
  for (const key of [
    'visits',
    'guests',
    'stamps',
    'redemptions',
    'first_time_guests',
    'returning_guests',
  ]) {
    const c = object(object(raw.comparison)[key]),
      p = object(raw.comparison_period),
      label = {
        visits: 'Besuche',
        guests: 'Gäste',
        stamps: 'Stempel',
        redemptions: 'Einlösungen',
        first_time_guests: 'Erstmalige Gäste',
        returning_guests: 'Wiederkehrende Gäste',
      }[key]!
    for (const field of ['previous', 'absolute_change', 'relative_change'])
      row(
        'comparison',
        `${label} · ${{ previous: 'Vorher', absolute_change: 'Absolute Änderung', relative_change: 'Relative Änderung (0–1)' }[field]}`,
        c.status,
        field === 'relative_change' && c.status === 'no_comparison'
          ? null
          : c[field],
        null,
        'comparison_period',
        p.from,
        p.to,
        true,
      )
  }
  const breakdown = object(raw.breakdowns)
  if (released(breakdown.status))
    for (const week of objects(breakdown.weeks)) {
      if (!released(childStatus(week))) {
        row(
          'breakdowns',
          'Wochenverteilungen',
          week.status,
          null,
          null,
          'whole_completed_iso_weeks',
          week.from,
          week.to,
        )
        continue
      }
      for (const key of ['peak_times', 'visit_frequency']) {
        const dim = object(week[key]),
          title =
            key === 'peak_times'
              ? 'Besuchszeiten'
              : 'Wöchentliche Besuchshäufigkeit'
        if (!released(dim.status)) {
          row(
            key,
            title,
            dim.status,
            null,
            null,
            'whole_completed_iso_weeks',
            week.from,
            week.to,
          )
          continue
        }
        for (const b of objects(dim.buckets))
          row(
            key,
            `${title} · ${key === 'peak_times' ? peakLabel(b) : knownLabel(bucketNames, b.visits_per_guest, 'Unbekannte Häufigkeit')}`,
            childStatus(b, dim.status),
            b[key === 'peak_times' ? 'visits' : 'guests'],
            b.sample_size,
            'whole_completed_iso_weeks',
            week.from,
            week.to,
          )
      }
    }
  for (const key of Object.keys(insightNames)) {
    const s = insight(data, key),
      scope = typeof s.scope === 'string' && s.scope ? s.scope : 'unavailable',
      p = object(s.period),
      from = p.from ?? s.as_of,
      to = p.to ?? s.as_of
    if (!released(s.status)) {
      row(key, insightNames[key], s.status, null, null, scope, from, to)
      continue
    }
    const metrics = object(s.metrics)
    for (const mk of Object.keys(insightMetricNames).filter((k) =>
      Object.hasOwn(metrics, k),
    )) {
      const m = object(metrics[mk])
      row(
        key,
        insightMetricNames[mk],
        m.status,
        m.value,
        m.sample_size,
        typeof m.scope === 'string'
          ? m.scope
          : mk === 'completed_lifetime_cycles'
            ? 'lifetime_snapshot'
            : scope,
        m.coverage_from ?? from,
        m.coverage_to ?? to,
      )
    }
    for (const bk of ['group_buckets', 'buckets'])
      for (const b of safeBuckets(s, bk)) {
        const label = `${insightNames[key]} · ${knownLabel(bucketNames, b.code, 'Unbekannte Gruppe')}`
        row(
          key,
          label,
          b.status,
          b.count,
          b.sample_size ?? s.sample_size,
          scope,
          from,
          to,
        )
        if (released(b.status) && b.share != null)
          row(
            key,
            `${label} · Anteil (0–1)`,
            b.status,
            b.share,
            b.sample_size ?? s.sample_size,
            scope,
            from,
            to,
          )
      }
    for (const week of objects(s.weeks).map(safeDimension)) {
      if (!released(week.status)) {
        row(
          key,
          insightNames[key],
          week.status,
          null,
          null,
          scope,
          week.from,
          week.to,
        )
        continue
      }
      if (key === 'consumer_premium')
        for (const mk of [
          'premium_visits',
          'premium_visit_share',
          'premium_redemptions',
          'premium_redemptions_per_visit',
        ]) {
          const m = object(object(week.metrics)[mk])
          row(
            key,
            insightMetricNames[mk],
            m.status,
            m.value,
            m.sample_size,
            scope,
            week.from,
            week.to,
          )
        }
      if (key === 'offers')
        for (const kind of ['offers', 'types']) {
          const dim =
            kind === 'offers' ? week : safeDimension(object(week.types))
          if (!released(dim.status)) {
            row(
              key,
              'Angebotstypen',
              dim.status,
              null,
              null,
              scope,
              week.from,
              week.to,
            )
            continue
          }
          for (const b of objects(dim.buckets)) {
            const bs = childStatus(b)
            if (!released(bs)) {
              row(
                key,
                kind === 'offers' ? 'Angebot' : 'Angebotstyp',
                bs,
                null,
                null,
                scope,
                week.from,
                week.to,
              )
              continue
            }
            const label =
              kind === 'offers'
                ? offerName(b)
                : knownLabel(offerTypeNames, b.code, 'Unbekannter Angebotstyp')
            for (const field of ['redemptions', 'distinct_redeemers'])
              row(
                key,
                `${label} · ${field === 'redemptions' ? 'Einlösungen' : 'Einlösende Gäste'}`,
                'ok',
                b[field],
                b.sample_size,
                scope,
                week.from,
                week.to,
              )
            for (const field of [
              'first_time_redeemers',
              'returning_redeemers',
              'mean_lifetime_visits',
            ]) {
              const m = object(b[field]),
                labelWithMetric = `${label} · ${{ first_time_redeemers: 'Erstmalig einlösende Gäste', returning_redeemers: 'Wiederkehrend einlösende Gäste', mean_lifetime_visits: 'Durchschnittliche Lifetime-Besuche' }[field]}`
              row(
                key,
                labelWithMetric,
                m.status,
                m.value,
                m.sample_size,
                scope,
                week.from,
                week.to,
              )
              if (field !== 'mean_lifetime_visits')
                row(
                  key,
                  `${labelWithMetric} · Anteil (0–1)`,
                  m.status,
                  m.share,
                  m.sample_size,
                  scope,
                  week.from,
                  week.to,
                )
            }
          }
        }
    }
  }
  const feedback = data.metrics.feedback,
    fs = object(feedback?.scope)
  if (feedback?.status === 'ok' && feedback.categories_status === 'ok')
    for (const dimension of ['clarity', 'issues'] as const) {
      for (const code of dimension === 'clarity'
        ? ['clear', 'mostly_clear', 'unclear']
        : ['none', 'deal', 'stamp', 'scan', 'other']) {
        const values = object(feedback[dimension])
        if (Object.hasOwn(values, code))
          row(
            'feedback',
            `Feedback · ${dimension} · ${code}`,
            'ok',
            values[code],
            feedback.sample_size,
            'latest_completed_iso_week',
            fs.from,
            fs.to,
          )
      }
    }
  return rows
}
