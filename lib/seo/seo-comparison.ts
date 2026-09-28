import { validateSeoFetchUrl } from './seo-url-policy'

export const COMPARISON_METHOD = 'benefitsi-partner-rank-import-v1'
export const COMPARISON_EVENT_METHOD = 'benefitsi-partner-seo-event-v1'
export type RankResult = {
  keyword: string
  state: 'ranked' | 'outside' | 'unknown'
  position: number | null
  rankingUrl: string | null
}
export type RankBatch = {
  id: string
  observedOn: string
  provider: string
  method: string
  depth: number | null
  reference: string
  source: 'import' | 'tracker'
  recordedAt: string
  results: RankResult[]
}
export type ComparisonConfig = {
  version: 1
  channel: 'organic' | 'maps'
  subjectUrl: string
  keywords: string[]
  location: string
  locale: string
  device: 'mobile' | 'desktop'
  latitude: number | null
  longitude: number | null
  partnerSince: string | null
  packageStartedOn: string | null
  baseline: RankBatch | null
}
export type RankComparison = ReturnType<typeof compareRankBatches>

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('invalid_comparison')
  return value as Record<string, unknown>
}
function text(value: unknown, max = 200) {
  if (typeof value !== 'string') throw Error('invalid_comparison')
  const result = value.trim().replace(/\s+/g, ' ')
  if (
    !result ||
    result.length > max ||
    /[\u0000-\u0008\u000e-\u001f]/.test(result)
  )
    throw Error('invalid_comparison')
  return result
}
const key = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
export function comparisonToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
export function comparisonDate(
  value: unknown,
  today = comparisonToday(),
): string {
  const date = text(value, 10)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    date > today ||
    date < '2000-01-01'
  )
    throw Error('invalid_date')
  return date
}
export function comparisonUrl(value: unknown) {
  const validated = validateSeoFetchUrl(text(value, 2048))
  if (!validated.ok) throw Error('invalid_url')
  const url = validated.url
  if (
    url.port ||
    !url.hostname.includes('.') ||
    /^\d+(\.\d+){3}$/.test(url.hostname) ||
    url.hostname.includes(':') ||
    [...url.searchParams.keys()].some((k) =>
      /token|secret|password|key|auth|signature|credential/i.test(k),
    )
  )
    throw Error('invalid_url')
  url.hash = ''
  return url.href
}
function mapsUrl(url: URL) {
  return (
    ([
      'google.com',
      'www.google.com',
      'google.de',
      'www.google.de',
      'maps.google.com',
      'maps.google.de',
    ].includes(url.hostname) &&
      (url.pathname.startsWith('/maps') || url.hostname.startsWith('maps.'))) ||
    (['maps.app.goo.gl', 'goo.gl'].includes(url.hostname) &&
      url.pathname.length > 1)
  )
}
export function validateComparisonConfig(
  value: unknown,
  today = comparisonToday(),
): ComparisonConfig {
  const input = record(value)
  if (input.channel !== 'organic' && input.channel !== 'maps')
    throw Error('invalid_comparison')
  if (input.device !== 'mobile' && input.device !== 'desktop')
    throw Error('invalid_comparison')
  const subjectUrl = comparisonUrl(input.subjectUrl)
  if (input.channel === 'maps' && !mapsUrl(new URL(subjectUrl)))
    throw Error('invalid_maps')
  if (!Array.isArray(input.keywords) || input.keywords.length > 50)
    throw Error('invalid_keywords')
  const seen = new Set<string>()
  const keywords = input.keywords
    .map((k) => text(k, 120))
    .filter((k) => !seen.has(key(k)) && !!seen.add(key(k)))
  if (!keywords.length || keywords.some((k) => /[;\n\r]/.test(k)))
    throw Error('invalid_keywords')
  const locale = text(input.locale, 10)
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) throw Error('invalid_comparison')
  const coordinate = (v: unknown, limit: number) => {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    if (!Number.isFinite(n) || Math.abs(n) > limit)
      throw Error('invalid_coordinates')
    return n
  }
  const latitude = coordinate(input.latitude, 90),
    longitude = coordinate(input.longitude, 180)
  if (input.channel === 'maps' && (latitude === null || longitude === null))
    throw Error('invalid_coordinates')
  return {
    version: 1,
    channel: input.channel,
    subjectUrl,
    keywords,
    location: text(input.location),
    locale,
    device: input.device,
    latitude: input.channel === 'maps' ? latitude : null,
    longitude: input.channel === 'maps' ? longitude : null,
    partnerSince: input.partnerSince
      ? comparisonDate(input.partnerSince, today)
      : null,
    packageStartedOn: input.packageStartedOn
      ? comparisonDate(input.packageStartedOn, today)
      : null,
    baseline: null,
  }
}
function matchesSubject(config: ComparisonConfig, candidate: string) {
  const url = new URL(comparisonUrl(candidate)),
    subject = new URL(config.subjectUrl)
  if (config.channel === 'maps') return url.href === subject.href
  url.searchParams.sort()
  subject.searchParams.sort()
  return (
    url.hostname.replace(/^www\./, '') ===
      subject.hostname.replace(/^www\./, '') &&
    ((subject.pathname === '/' && !subject.search) ||
      (url.pathname.replace(/\/$/, '') ===
        subject.pathname.replace(/\/$/, '') &&
        url.search === subject.search))
  )
}
export function parseRankImport(
  config: ComparisonConfig,
  value: unknown,
  today = comparisonToday(),
): Omit<RankBatch, 'id' | 'recordedAt'> {
  const input = record(value)
  if (input.confirmed !== true) throw Error('evidence_confirmation')
  const provider = text(input.provider, 100),
    method = text(input.method, 100)
  if (/search.?console|\bgsc\b|web_search/i.test(`${provider} ${method}`))
    throw Error('not_a_rank_tracker')
  const depth = Number(input.depth)
  if (!Number.isInteger(depth) || depth < 10 || depth > 1000)
    throw Error('invalid_depth')
  if (typeof input.rows !== 'string' || input.rows.length > 150000)
    throw Error('invalid_rows')
  const byKeyword = new Map<string, RankResult>()
  const accepted = new Map(config.keywords.map((k) => [key(k), k]))
  for (const line of input.rows.trim().split(/\r?\n/)) {
    const parts = line.split(';').map((p) => p.trim())
    if (parts.length !== 3) throw Error('invalid_rows')
    const [keyword, position, rawUrl] = parts
    const normalized = key(keyword)
    if (!accepted.has(normalized) || byKeyword.has(normalized))
      throw Error('keyword_mismatch')
    const unknown = position === '?',
      outside = position === `>${depth}`
    const n = Number(position)
    if (
      !unknown &&
      !outside &&
      (!/^\d+$/.test(position) || !Number.isInteger(n) || n < 1 || n > depth)
    )
      throw Error('invalid_position')
    if (!unknown && !outside && (!rawUrl || !matchesSubject(config, rawUrl)))
      throw Error('ranking_url_mismatch')
    if ((unknown || outside) && rawUrl) throw Error('invalid_rows')
    byKeyword.set(normalized, {
      keyword: accepted.get(normalized)!,
      state: unknown ? 'unknown' : outside ? 'outside' : 'ranked',
      position: unknown || outside ? null : n,
      rankingUrl: rawUrl ? comparisonUrl(rawUrl) : null,
    })
  }
  if (byKeyword.size !== config.keywords.length) throw Error('keyword_mismatch')
  const results = config.keywords.map((k) => byKeyword.get(key(k))!)
  return {
    observedOn: comparisonDate(input.observedOn, today),
    provider,
    method,
    depth,
    reference: text(input.reference, 1000),
    source: 'import',
    results,
  }
}

/** Project persisted JSON into the bounded public contract, never forward provider_config. */
export function readRankBatch(
  value: unknown,
  config: ComparisonConfig,
): RankBatch | null {
  try {
    const input = record(value)
    if (input.source !== 'import' && input.source !== 'tracker') return null
    if (
      !Array.isArray(input.results) ||
      input.results.length !== config.keywords.length
    )
      return null
    const depth = input.depth === null ? null : Number(input.depth)
    if (
      depth !== null &&
      (!Number.isInteger(depth) || depth < 1 || depth > 1000)
    )
      return null
    const results = config.keywords.map((keyword) => {
      const matches = (input.results as unknown[])
        .map(record)
        .filter((r) => key(String(r.keyword)) === key(keyword))
      if (matches.length !== 1) throw Error('invalid_rows')
      const r = matches[0]
      if (!['ranked', 'outside', 'unknown'].includes(String(r.state)))
        throw Error('invalid_rows')
      const position = r.state === 'ranked' ? Number(r.position) : null
      if (
        position !== null &&
        (!Number.isInteger(position) ||
          position < 1 ||
          (depth !== null && position > depth))
      )
        throw Error('invalid_position')
      if (r.state === 'outside' && depth === null) throw Error('invalid_depth')
      const rankingUrl =
        r.state === 'ranked' ? comparisonUrl(r.rankingUrl) : null
      if (rankingUrl && !matchesSubject(config, rankingUrl))
        throw Error('ranking_url_mismatch')
      return {
        keyword,
        state: r.state as RankResult['state'],
        position,
        rankingUrl,
      }
    })
    const provider = text(input.provider, 100),
      method = text(input.method, 100)
    if (/search.?console|\bgsc\b|web_search/i.test(`${provider} ${method}`))
      return null
    const recordedAt = text(input.recordedAt, 40)
    if (!Number.isFinite(Date.parse(recordedAt))) return null
    return {
      id: text(input.id, 500),
      observedOn: comparisonDate(input.observedOn),
      provider,
      method,
      depth,
      reference: text(input.reference, 1000),
      source: input.source,
      recordedAt: new Date(recordedAt).toISOString(),
      results,
    }
  } catch {
    return null
  }
}
export function readComparisonConfig(value: unknown): ComparisonConfig | null {
  try {
    const input = record(value)
    if (input.version !== 1) return null
    const config = validateComparisonConfig(input)
    config.baseline = input.baseline
      ? readRankBatch(input.baseline, config)
      : null
    if (input.baseline && !config.baseline) return null
    return config
  } catch {
    return null
  }
}
export function classifyBaseline(
  config: ComparisonConfig,
  baseline: RankBatch,
) {
  if (config.partnerSince && baseline.observedOn < config.partnerSince)
    return 'before_partner'
  if (config.packageStartedOn && baseline.observedOn < config.packageStartedOn)
    return 'before_package'
  return 'since_measurement'
}
export function compareRankBatches(
  config: ComparisonConfig,
  baseline: RankBatch | null,
  batches: RankBatch[],
  asOf = comparisonToday(),
) {
  const compatible = baseline
    ? batches.filter(
        (b) =>
          b.id !== baseline.id &&
          b.provider === baseline.provider &&
          b.method === baseline.method &&
          b.observedOn > baseline.observedOn &&
          b.observedOn <= asOf &&
          (!config.packageStartedOn || b.observedOn >= config.packageStartedOn),
      )
    : []
  const current =
    compatible.sort(
      (a, b) =>
        b.observedOn.localeCompare(a.observedOn) ||
        b.recordedAt.localeCompare(a.recordedAt) ||
        b.id.localeCompare(a.id),
    )[0] ?? null
  const rows = config.keywords.map((keyword) => {
    const before =
      baseline?.results.find((r) => key(r.keyword) === key(keyword)) ?? null
    const after =
      current?.results.find((r) => key(r.keyword) === key(keyword)) ?? null
    const sameDepth =
      baseline?.depth != null && current?.depth === baseline.depth
    const delta =
      before?.state === 'ranked' && after?.state === 'ranked'
        ? before.position! - after.position!
        : null
    const change =
      delta !== null
        ? delta > 0
          ? 'up'
          : delta < 0
            ? 'down'
            : 'same'
        : sameDepth && before?.state === 'outside' && after?.state === 'ranked'
          ? 'entered'
          : sameDepth &&
              before?.state === 'ranked' &&
              after?.state === 'outside'
            ? 'left'
            : sameDepth &&
                before?.state === 'outside' &&
                after?.state === 'outside'
              ? 'outside'
              : 'unavailable'
    return { keyword, before, after, delta, change }
  })
  const deltas = rows.flatMap((r) => (r.delta === null ? [] : [r.delta]))
  return {
    current,
    rows,
    paired: deltas.length,
    meanDelta: deltas.length
      ? deltas.reduce((a, b) => a + b, 0) / deltas.length
      : null,
    improved: rows.filter((r) => r.change === 'up' || r.change === 'entered')
      .length,
    declined: rows.filter((r) => r.change === 'down' || r.change === 'left')
      .length,
    unchanged: rows.filter((r) => r.change === 'same' || r.change === 'outside')
      .length,
    unavailable: rows.filter((r) => r.change === 'unavailable').length,
  }
}
export function rankLabel(result: RankResult | null, depth: number | null) {
  return result?.state === 'ranked'
    ? String(result.position)
    : result?.state === 'outside'
      ? `Nicht in Top ${depth}`
      : 'Nicht gemessen'
}
export function comparisonCsv(
  config: ComparisonConfig,
  baseline: RankBatch | null,
  report: RankComparison,
) {
  const cell = (value: unknown) => {
    let v = String(value ?? '')
    if (/^[\s]*[=+@\-\t\r]/.test(v)) v = `'${v}`
    return `"${v.replaceAll('"', '""')}"`
  }
  const header = [
    'Keyword',
    'Kanal',
    'Messziel',
    'Ort',
    'Breitengrad',
    'Längengrad',
    'Gerät',
    'Sprache',
    'Partnerschaft seit',
    'SEO-Paket seit',
    'Ausgangsmessung',
    'Vergleichsmessung',
    'Vorher',
    'Aktuell',
    'Positionen gewonnen',
    'Anbieter',
    'Methode',
    'Ausgangsbeleg',
    'Aktueller Beleg',
    'Quelle vorher',
    'Quelle aktuell',
    'Suchtiefe vorher',
    'Suchtiefe aktuell',
    'Hinweis',
  ]
  return (
    '\uFEFF' +
    [
      header,
      ...report.rows.map((r) => [
        r.keyword,
        config.channel,
        config.subjectUrl,
        config.location,
        config.latitude,
        config.longitude,
        config.device,
        config.locale,
        config.partnerSince,
        config.packageStartedOn,
        baseline?.observedOn,
        report.current?.observedOn,
        rankLabel(r.before, baseline?.depth ?? null),
        rankLabel(r.after, report.current?.depth ?? null),
        r.delta,
        baseline?.provider,
        baseline?.method,
        baseline?.reference,
        report.current?.reference,
        baseline?.source,
        report.current?.source,
        baseline?.depth,
        report.current?.depth,
        'Beobachtete Veränderung; kein Nachweis alleiniger Ursache durch Benefitsi.',
      ]),
    ]
      .map((r) => r.map(cell).join(';'))
      .join('\r\n')
  )
}

export type ComparableSnapshot = {
  id: string
  target_id: string
  keyword: string
  locale: string
  device: string
  search_engine: string
  location: string | null
  grid_latitude: number | null
  grid_longitude: number | null
  rank_position: number | null
  ranking_url: string | null
  provider: string
  provider_version: string | null
  observed_at: string
  coverage: number
  confidence: number
  serp_features: unknown
}
export function batchesFromSnapshots(
  targetId: string,
  config: ComparisonConfig,
  rows: ComparableSnapshot[],
): RankBatch[] {
  const groups = new Map<string, RankBatch>()
  const ambiguous = new Set<string>()
  for (const row of rows) {
    const markers = Array.isArray(row.serp_features)
      ? row.serp_features.filter(
          (v) =>
            v &&
            typeof v === 'object' &&
            v.type === 'benefitsi_rank_context_v1',
        )
      : []
    if (markers.length !== 1) continue
    const marker = markers[0] as Record<string, unknown>
    if (
      marker.channel !== config.channel ||
      typeof marker.batch_id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(marker.batch_id) ||
      typeof marker.measured_at !== 'string' ||
      marker.measured_at.length > 40 ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(marker.measured_at) ||
      !Number.isFinite(Date.parse(marker.measured_at))
    )
      continue
    const depth = marker.depth === null ? null : Number(marker.depth)
    if (
      depth !== null &&
      (!Number.isInteger(depth) || depth < 10 || depth > 1000)
    )
      continue
    let provider: string, method: string
    try {
      provider = text(row.provider, 100)
      method = text(row.provider_version, 100)
    } catch {
      continue
    }
    if (/web_search|search.?console|\bgsc\b/i.test(`${provider} ${method}`))
      continue
    if (
      row.target_id !== targetId ||
      row.search_engine !== 'google' ||
      row.locale !== config.locale ||
      row.device !== config.device ||
      row.location !== config.location ||
      row.grid_latitude !== config.latitude ||
      row.grid_longitude !== config.longitude
    )
      continue
    const keyword = config.keywords.find((k) => key(k) === key(row.keyword))
    if (!keyword) continue
    if (!Number.isFinite(Date.parse(row.observed_at))) continue
    const measuredAt = new Date(marker.measured_at).toISOString()
    const id = JSON.stringify([
      provider,
      method,
      marker.batch_id,
      measuredAt,
      depth,
    ])
    let batch = groups.get(id)
    if (!batch) {
      batch = {
        id: `tracker:${id}`,
        observedOn: new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Berlin',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(measuredAt)),
        provider,
        method,
        depth,
        reference: `Ranktracker-Lauf ${marker.batch_id} · ${measuredAt}`,
        source: 'tracker',
        recordedAt: measuredAt,
        results: config.keywords.map((keyword) => ({
          keyword,
          state: 'unknown',
          position: null,
          rankingUrl: null,
        })),
      }
      groups.set(id, batch)
    }
    const index = batch.results.findIndex((r) => r.keyword === keyword)
    // Multiple results for one query are ambiguous; never select the best rank.
    const entryKey = `${id}:${keyword}`
    if (ambiguous.has(entryKey)) {
      batch.results[index] = {
        keyword,
        state: 'unknown',
        position: null,
        rankingUrl: null,
      }
      continue
    }
    ambiguous.add(entryKey)
    if (
      row.rank_position === null &&
      marker.state === 'outside' &&
      depth !== null &&
      Number(row.coverage) > 0 &&
      Number(row.confidence) > 0
    ) {
      batch.results[index] = {
        keyword,
        state: 'outside',
        position: null,
        rankingUrl: null,
      }
      continue
    }
    if (
      row.rank_position === null ||
      !Number.isInteger(Number(row.rank_position)) ||
      Number(row.rank_position) < 1 ||
      (depth !== null && Number(row.rank_position) > depth) ||
      Number(row.coverage) <= 0 ||
      Number(row.confidence) <= 0 ||
      !row.ranking_url
    )
      continue
    try {
      if (!matchesSubject(config, row.ranking_url)) continue
    } catch {
      continue
    }
    batch.results[index] = {
      keyword,
      state: 'ranked',
      position: Number(row.rank_position),
      rankingUrl: row.ranking_url,
    }
  }
  return [...groups.values()]
}

type ComparisonTarget = {
  id: string
  partner_id: string | null
  updated_at: string
  provider_config: Record<string, unknown>
}
export type BaselineStore = {
  getTarget(id: string): Promise<ComparisonTarget | null>
  getBatches(id: string, config: ComparisonConfig): Promise<RankBatch[]>
  updateConfig(
    id: string,
    version: string,
    config: Record<string, unknown>,
  ): Promise<boolean>
}
export async function freezeBaseline(
  authorize: () => Promise<BaselineStore>,
  id: string,
  version: string,
) {
  const store = await authorize()
  const target = await store.getTarget(id)
  const config = readComparisonConfig(target?.provider_config.comparison)
  if (!target?.partner_id || !config) throw Error('invalid_target')
  if (target.updated_at !== version) throw Error('stale_update')
  if (config.baseline) throw Error('baseline_locked')
  const batches = (await store.getBatches(id, config))
    .map((batch) => readRankBatch(batch, config))
    .filter(
      (batch): batch is RankBatch =>
        !!batch && batch.results.some((r) => r.state !== 'unknown'),
    )
  // Freeze the earliest available measurement, never cherry-pick a favourable baseline.
  const baseline = batches.sort(
    (a, b) =>
      a.observedOn.localeCompare(b.observedOn) ||
      a.recordedAt.localeCompare(b.recordedAt) ||
      a.id.localeCompare(b.id),
  )[0]
  if (!baseline) throw Error('no_evidence')
  if (
    !(await store.updateConfig(id, version, {
      ...target.provider_config,
      comparison: { ...config, baseline: structuredClone(baseline) },
    }))
  )
    throw Error('stale_update')
}
