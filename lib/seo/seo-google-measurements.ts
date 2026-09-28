/** Server use only: credentials are read here from non-public environment variables. */
import type { SeoTarget } from './seo-data'
export type MeasurementProvider = 'gsc' | 'psi'
export type MeasurementState =
  | 'ok'
  | 'partial'
  | 'no_data'
  | 'unconfigured'
  | 'invalid_target'
  | 'auth_error'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_response'
  | 'provider_error'
export type GoogleMeasurement = {
  provider: MeasurementProvider
  state: MeasurementState
  source: string
  observedAt: string
  data: Record<string, unknown> | null
  period?: { startDate: string; endDate: string; timezone: string }
  scope?: string
}
type Target = Pick<
  SeoTarget,
  'canonical_url' | 'target_type' | 'partner_id' | 'city_id'
>
type Fetch = typeof fetch
class MeasurementError extends Error {
  constructor(readonly state: MeasurementState) {
    super(state)
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MeasurementError('invalid_response')
  return value as Record<string, unknown>
}
function benefitsiUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new MeasurementError('invalid_target')
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'benefitsi.de' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  )
    throw new MeasurementError('invalid_target')
  return url
}
async function jsonRequest(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
  timeout = 15000,
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    ...init,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  })
  if (response.status === 400 && url === 'https://oauth2.googleapis.com/token')
    throw new MeasurementError('auth_error')
  if (!response.ok)
    throw new MeasurementError(
      (
        { 401: 'auth_error', 403: 'forbidden', 429: 'rate_limited' } as Record<
          number,
          MeasurementState
        >
      )[response.status] ?? 'provider_error',
    )
  if (!response.body) throw new MeasurementError('invalid_response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 5_000_000) {
        await reader.cancel()
        throw new MeasurementError('invalid_response')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return object(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new MeasurementError('invalid_response')
    throw error
  } finally {
    reader.releaseLock()
  }
}
function failure(error: unknown): MeasurementState {
  if (error instanceof MeasurementError) return error.state
  if (
    error instanceof Error &&
    ['TimeoutError', 'AbortError'].includes(error.name)
  )
    return 'timeout'
  return 'provider_error'
}
function base(provider: MeasurementProvider): GoogleMeasurement {
  return {
    provider,
    state: 'unconfigured',
    source:
      provider === 'gsc'
        ? 'Google Search Console Search Analytics'
        : 'PageSpeed Insights · Lighthouse laboratory data · mobile',
    observedAt: new Date().toISOString(),
    data: null,
  }
}
function period() {
  // Search Console dates use Pacific time, including its daylight-saving transitions.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const end = new Date(`${today}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() - 3)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 27)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    timezone: 'America/Los_Angeles',
  }
}
function gscRows(payload: Record<string, unknown>, query: boolean) {
  const rows = payload.rows === undefined ? [] : payload.rows
  if (!Array.isArray(rows) || rows.length > (query ? 25 : 1))
    throw new MeasurementError('invalid_response')
  return rows.map((value) => {
    const row = object(value)
    for (const key of ['clicks', 'impressions', 'ctr', 'position'])
      if (
        typeof row[key] !== 'number' ||
        !Number.isFinite(row[key]) ||
        row[key] < 0
      )
        throw new MeasurementError('invalid_response')
    if (
      (row.ctr as number) > 1 ||
      (row.clicks as number) > (row.impressions as number)
    )
      throw new MeasurementError('invalid_response')
    if (
      query &&
      (!Array.isArray(row.keys) ||
        row.keys.length !== 1 ||
        typeof row.keys[0] !== 'string' ||
        row.keys[0].length > 4096)
    )
      throw new MeasurementError('invalid_response')
    return {
      clicks: row.clicks as number,
      impressions: row.impressions as number,
      ctr: row.ctr as number,
      averagePosition: row.position as number,
      ...(query ? { query: (row.keys as string[])[0] } : {}),
    }
  })
}
export async function measureGsc(
  target: Target,
  fetcher: Fetch = fetch,
): Promise<GoogleMeasurement> {
  const result = { ...base('gsc'), period: period() }
  try {
    const canonical = benefitsiUrl(target.canonical_url)
    const env = process.env
    const property = env.SEO_GSC_PROPERTY?.trim()
    if (
      !env.SEO_GOOGLE_CLIENT_ID ||
      !env.SEO_GOOGLE_CLIENT_SECRET ||
      !env.SEO_GOOGLE_REFRESH_TOKEN ||
      ![
        'sc-domain:benefitsi.de',
        'https://benefitsi.de/',
        'https://benefitsi.de',
      ].includes(property ?? '')
    )
      return result
    const token = await jsonRequest(
      fetcher,
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.SEO_GOOGLE_CLIENT_ID,
          client_secret: env.SEO_GOOGLE_CLIENT_SECRET,
          refresh_token: env.SEO_GOOGLE_REFRESH_TOKEN,
          grant_type: 'refresh_token',
          scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        }),
      },
    )
    if (
      typeof token.access_token !== 'string' ||
      !token.access_token ||
      token.access_token.length > 8192
    )
      throw new MeasurementError('invalid_response')
    const propertyWide =
      target.target_type === 'domain' &&
      target.partner_id === null &&
      target.city_id === null &&
      canonical.pathname === '/'
    result.scope = propertyWide ? 'property' : canonical.href
    const body = {
      startDate: result.period.startDate,
      endDate: result.period.endDate,
      dataState: 'final',
      type: 'web',
      aggregationType: 'auto',
      ...(propertyWide
        ? {}
        : {
            dimensionFilterGroups: [
              {
                groupType: 'and',
                filters: [
                  {
                    dimension: 'page',
                    operator: 'equals',
                    expression: canonical.href,
                  },
                ],
              },
            ],
          }),
    }
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property!)}/searchAnalytics/query`
    const query = (dimensions: string[], rowLimit: number) =>
      jsonRequest(fetcher, endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, dimensions, rowLimit }),
      })
    const totals = gscRows(await query([], 1), false)
    const queries = gscRows(await query(['query'], 25), true)
    if (!totals.length) {
      if (queries.length) throw new MeasurementError('invalid_response')
      return { ...result, state: 'no_data' }
    }
    return {
      ...result,
      state: 'ok',
      data: {
        totals: totals[0],
        queries,
        queryNote:
          'Top queries only; anonymized queries can be omitted by Google. Average position is not a tracked keyword rank.',
      },
    }
  } catch (error) {
    return { ...result, state: failure(error) }
  }
}
function optionalNumber(value: unknown, max = Infinity): number | null {
  if (value === undefined || value === null) return null
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new MeasurementError('invalid_response')
  return value
}
export async function measurePageSpeed(
  target: Target,
  fetcher: Fetch = fetch,
): Promise<GoogleMeasurement> {
  const result = base('psi')
  try {
    const canonical = benefitsiUrl(target.canonical_url)
    if (!process.env.SEO_PAGESPEED_API_KEY) return result
    const endpoint = new URL(
      'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
    )
    endpoint.searchParams.set('url', canonical.href)
    endpoint.searchParams.set('strategy', 'mobile')
    endpoint.searchParams.set('key', process.env.SEO_PAGESPEED_API_KEY)
    for (const category of [
      'performance',
      'accessibility',
      'best-practices',
      'seo',
    ])
      endpoint.searchParams.append('category', category)
    const payload = await jsonRequest(fetcher, endpoint.href, {}, 40000)
    const lighthouse = object(payload.lighthouseResult)
    if (typeof lighthouse.finalUrl !== 'string')
      throw new MeasurementError('invalid_response')
    const final = benefitsiUrl(lighthouse.finalUrl)
    if (final.pathname !== canonical.pathname)
      throw new MeasurementError('invalid_target')
    if (lighthouse.runtimeError) throw new MeasurementError('provider_error')
    if (
      typeof lighthouse.fetchTime !== 'string' ||
      !Number.isFinite(Date.parse(lighthouse.fetchTime))
    )
      throw new MeasurementError('invalid_response')
    const categories = object(lighthouse.categories ?? {})
    const audits = object(lighthouse.audits ?? {})
    const scores: Record<string, number | null> = {}
    for (const category of [
      'performance',
      'accessibility',
      'best-practices',
      'seo',
    ]) {
      const score = optionalNumber(
        categories[category] === undefined
          ? null
          : object(categories[category]).score,
        1,
      )
      scores[category] = score === null ? null : Math.round(score * 100)
    }
    const metrics: Record<string, number | null> = {}
    for (const [key, audit] of Object.entries({
      lcpMs: 'largest-contentful-paint',
      fcpMs: 'first-contentful-paint',
      tbtMs: 'total-blocking-time',
      cls: 'cumulative-layout-shift',
      speedIndexMs: 'speed-index',
    }))
      metrics[key] = optionalNumber(
        audits[audit] === undefined ? null : object(audits[audit]).numericValue,
      )
    const available = [
      ...Object.values(scores),
      ...Object.values(metrics),
    ].filter((value) => value !== null).length
    return {
      ...result,
      state: available === 0 ? 'no_data' : available < 9 ? 'partial' : 'ok',
      observedAt: new Date(lighthouse.fetchTime).toISOString(),
      data:
        available === 0
          ? null
          : {
              strategy: 'mobile',
              kind: 'laboratory',
              finalUrl: final.href,
              categories: scores,
              metrics,
            },
    }
  } catch (error) {
    return { ...result, state: failure(error) }
  }
}
