import assert from 'node:assert/strict'
import test from 'node:test'
import {
  measureGsc,
  measurePageSpeed,
} from '../lib/seo/seo-google-measurements.ts'
const target = {
  id: 't',
  canonical_url: 'https://benefitsi.de/p/test',
  target_type: 'partner_microsite',
  partner_id: 'p',
  city_id: null,
}
const env = [
  'SEO_GOOGLE_CLIENT_ID',
  'SEO_GOOGLE_CLIENT_SECRET',
  'SEO_GOOGLE_REFRESH_TOKEN',
  'SEO_GSC_PROPERTY',
  'SEO_PAGESPEED_API_KEY',
]
function configured() {
  for (const key of env) process.env[key] = 'test-secret'
  process.env.SEO_GSC_PROPERTY = 'sc-domain:benefitsi.de'
}
const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
const row = { clicks: 0, impressions: 10, ctr: 0, position: 12 }
test('missing credentials never make network calls or return zero', async () => {
  for (const key of env) delete process.env[key]
  const noFetch = () => {
    throw Error('network forbidden')
  }
  assert.equal((await measureGsc(target, noFetch)).state, 'unconfigured')
  const result = await measurePageSpeed(target, noFetch)
  assert.equal(result.state, 'unconfigured')
  assert.equal(result.data, null)
})
test('GSC uses readonly token, final 28 day period and exact page filter on both requests', async () => {
  configured()
  const requests = []
  const result = await measureGsc(target, async (url, init) => {
    requests.push({ url, init })
    if (requests.length === 1)
      return reply({ access_token: 'token', token_type: 'Bearer' })
    return reply({
      rows: requests.length === 2 ? [row] : [{ ...row, keys: ['test'] }],
    })
  })
  assert.equal(result.state, 'ok')
  assert.equal(result.data.totals.clicks, 0)
  assert.equal(result.data.queries[0].query, 'test')
  assert.equal(requests.length, 3)
  assert.match(requests[0].init.body.toString(), /webmasters.readonly/)
  for (const request of requests.slice(1)) {
    const body = JSON.parse(request.init.body)
    assert.deepEqual(body.dimensionFilterGroups, [
      {
        groupType: 'and',
        filters: [
          {
            dimension: 'page',
            operator: 'equals',
            expression: 'https://benefitsi.de/p/test',
          },
        ],
      },
    ])
    assert.equal(body.dataState, 'final')
    assert.equal(
      (Date.parse(body.endDate) - Date.parse(body.startDate)) / 86400000,
      27,
    )
  }
  assert.equal(JSON.parse(requests[2].init.body).rowLimit, 25)
})
test('only unowned root domain can query property-wide; city/editorial stay filtered; invalid hosts rejected', async () => {
  configured()
  for (const t of [
    { ...target, target_type: 'city_portal', partner_id: null, city_id: 'c' },
    { ...target, target_type: 'editorial_site', partner_id: null },
    {
      ...target,
      target_type: 'domain',
      partner_id: null,
      canonical_url: 'https://benefitsi.de/',
    },
  ]) {
    const bodies = []
    await measureGsc(t, async (url, init) => {
      if (String(url).includes('oauth2'))
        return reply({ access_token: 'token', token_type: 'Bearer' })
      bodies.push(JSON.parse(init.body))
      return reply({ rows: [] })
    })
    assert.equal(
      Boolean(bodies[0].dimensionFilterGroups),
      t.target_type !== 'domain',
    )
  }
  for (const canonical_url of [
    'https://evil.test/',
    'https://benefitsi.de.evil.test/',
    'http://benefitsi.de/',
    'https://user:pass@benefitsi.de/',
  ])
    assert.equal(
      (
        await measureGsc({ ...target, canonical_url }, () => {
          throw Error('forbidden')
        })
      ).state,
      'invalid_target',
    )
  process.env.SEO_GSC_PROPERTY = 'sc-domain:other.de'
  assert.equal((await measureGsc(target)).state, 'unconfigured')
})
test('GSC distinguishes empty data from zero and rejects malformed rows', async () => {
  configured()
  for (const [payload, state] of [
    [{ rows: [] }, 'no_data'],
    [{}, 'no_data'],
    [{ rows: [{ clicks: 'bad' }] }, 'invalid_response'],
    [{ rows: 'bad' }, 'invalid_response'],
  ]) {
    const result = await measureGsc(target, async (url) =>
      String(url).includes('oauth2')
        ? reply({ access_token: 'token' })
        : reply(payload),
    )
    assert.equal(result.state, state)
    assert.equal(result.data?.totals ?? null, null)
  }
})
test('provider HTTP/auth/timeout failures are bounded and non-secret', async () => {
  configured()
  for (const [status, state] of [
    [401, 'auth_error'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [500, 'provider_error'],
  ])
    for (const fn of [measureGsc, measurePageSpeed]) {
      const result = await fn(target, async () =>
        reply({ error: 'test-secret' }, status),
      )
      assert.equal(result.state, state)
      assert.doesNotMatch(JSON.stringify(result), /test-secret/)
    }
  assert.equal(
    (
      await measureGsc(target, async () => {
        throw new DOMException('test-secret', 'TimeoutError')
      })
    ).state,
    'timeout',
  )
  assert.equal(
    (await measureGsc(target, async () => reply({ access_token: 123 }))).state,
    'invalid_response',
  )
})
test('PSI requests mobile lab categories, keeps absent metrics null, validates final ownership', async () => {
  configured()
  const payload = {
    lighthouseResult: {
      finalUrl: target.canonical_url,
      fetchTime: '2026-09-27T12:00:00Z',
      categories: { performance: { score: 0.73 } },
      audits: {
        'largest-contentful-paint': { numericValue: 2500 },
        'cumulative-layout-shift': { numericValue: 0 },
      },
    },
  }
  let url
  const result = await measurePageSpeed(target, async (u) => {
    url = new URL(u)
    return reply(payload)
  })
  assert.equal(url.searchParams.get('strategy'), 'mobile')
  assert.equal(result.data.categories.performance, 73)
  assert.equal(result.data.categories.seo, null)
  assert.equal(result.data.metrics.lcpMs, 2500)
  assert.equal(result.data.metrics.cls, 0)
  assert.equal(result.data.metrics.tbtMs, null)
  assert.match(result.source, /laboratory/i)
  assert.doesNotMatch(JSON.stringify(result), /test-secret/)
  for (const finalUrl of [
    'https://evil.test/',
    'https://benefitsi.de/p/another',
  ])
    assert.equal(
      (
        await measurePageSpeed(target, async () =>
          reply({
            ...payload,
            lighthouseResult: { ...payload.lighthouseResult, finalUrl },
          }),
        )
      ).state,
      'invalid_target',
    )
  assert.equal(
    (await measurePageSpeed(target, async () => reply({}))).state,
    'invalid_response',
  )
})
test('revoked refresh token maps to auth error; post-refresh HTTP errors stay bounded', async () => {
  configured()
  assert.equal(
    (
      await measureGsc(target, async () =>
        reply({ error: 'invalid_grant' }, 400),
      )
    ).state,
    'auth_error',
  )
  for (const [status, state] of [
    [401, 'auth_error'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
  ])
    assert.equal(
      (
        await measureGsc(target, async (url) =>
          String(url).includes('oauth2')
            ? reply({ access_token: 'token' })
            : reply({ error: 'test-secret' }, status),
        )
      ).state,
      state,
    )
})
