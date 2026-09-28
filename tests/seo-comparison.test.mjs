import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateComparisonConfig,
  parseRankImport,
  compareRankBatches,
  classifyBaseline,
  comparisonCsv,
  batchesFromSnapshots,
  freezeBaseline,
  readComparisonConfig,
} from '../lib/seo/seo-comparison.ts'
import {
  readAllComparisonRows,
  importAuditId,
} from '../lib/seo/seo-comparison-data.ts'

const today = '2026-09-28'
const input = {
  channel: 'organic',
  subjectUrl: 'https://partner.example/',
  keywords: ['Pizza Annweiler', 'Pizza liefern Annweiler', 'Partner Annweiler'],
  location: 'Annweiler am Trifels, DE',
  locale: 'de-DE',
  device: 'mobile',
  partnerSince: '2026-09-01',
  packageStartedOn: '2026-09-10',
  latitude: null,
  longitude: null,
}
const config = () => validateComparisonConfig(input, today)
const context = (day = '2026-09-20', overrides = {}) => [
  {
    type: 'benefitsi_rank_context_v1',
    channel: 'organic',
    batch_id: day,
    measured_at: `${day}T08:00:00Z`,
    depth: 100,
    ...overrides,
  },
]
function batch(overrides = {}) {
  return {
    id: 'baseline',
    observedOn: '2026-08-28',
    provider: 'Rank export',
    method: 'organic-v1',
    depth: 100,
    reference: 'Report August',
    source: 'import',
    recordedAt: '2026-09-01T08:00:00Z',
    results: [
      {
        keyword: 'Pizza Annweiler',
        state: 'ranked',
        position: 25,
        rankingUrl: 'https://partner.example/',
      },
      {
        keyword: 'Pizza liefern Annweiler',
        state: 'outside',
        position: null,
        rankingUrl: null,
      },
      {
        keyword: 'Partner Annweiler',
        state: 'unknown',
        position: null,
        rankingUrl: null,
      },
    ],
    ...overrides,
  }
}

test('campaign validates context and deduplicates keywords without changing query meaning', () => {
  const c = validateComparisonConfig(
    {
      ...input,
      keywords: [' Pizza  Annweiler ', 'pizza annweiler', '"Pizza Annweiler"'],
    },
    today,
  )
  assert.deepEqual(c.keywords, ['Pizza Annweiler', '"Pizza Annweiler"'])
  for (const change of [
    { subjectUrl: 'https://127.0.0.1/' },
    { subjectUrl: 'https://user:secret@partner.example' },
    { subjectUrl: 'https://partner.example/?token=secret' },
    { keywords: [] },
    { device: 'watch' },
    { location: '' },
    { partnerSince: '2026-02-30' },
    { packageStartedOn: '2027-01-01' },
  ])
    assert.throws(() =>
      validateComparisonConfig({ ...input, ...change }, today),
    )
})
test('Maps requires a Google profile and a fixed valid search point', () => {
  assert.throws(() =>
    validateComparisonConfig({ ...input, channel: 'maps' }, today),
  )
  const maps = {
    ...input,
    channel: 'maps',
    subjectUrl: 'https://www.google.com/maps/place/Partner',
    latitude: 49.2,
    longitude: 7.96,
  }
  assert.equal(validateComparisonConfig(maps, today).channel, 'maps')
  assert.throws(() =>
    validateComparisonConfig({ ...maps, latitude: 91 }, today),
  )
})

const importInput = {
  observedOn: '2026-08-28',
  provider: 'Rank export',
  method: 'organic-v1',
  depth: '100',
  reference: 'Original report August',
  confirmed: true,
  rows: 'Pizza Annweiler;25;https://partner.example/\nPizza liefern Annweiler;>100;\nPartner Annweiler;?;',
}
test('import distinguishes missing data from verified absence and rejects fabricated rank zero', () => {
  const result = parseRankImport(config(), importInput, today)
  assert.deepEqual(
    result.results.map((r) => [r.state, r.position]),
    [
      ['ranked', 25],
      ['outside', null],
      ['unknown', null],
    ],
  )
  for (const rows of [
    importInput.rows.replace(';25;', ';0;'),
    importInput.rows.replace(';25;', ';25.5;'),
    importInput.rows.replace(';>100;', ';>50;'),
    importInput.rows.replace(
      'https://partner.example/',
      'https://competitor.example/',
    ),
    'Pizza Annweiler;25;https://partner.example/',
  ]) {
    assert.throws(() =>
      parseRankImport(config(), { ...importInput, rows }, today),
    )
  }
  assert.throws(() =>
    parseRankImport(config(), { ...importInput, confirmed: false }, today),
  )
  assert.throws(() =>
    parseRankImport(
      config(),
      { ...importInput, provider: 'Google Search Console' },
      today,
    ),
  )
  assert.throws(() =>
    parseRankImport(
      config(),
      { ...importInput, observedOn: '2027-01-01' },
      today,
    ),
  )
})
test('query-addressed targets never count a different business on the same host as a hit', () => {
  for (const subjectUrl of [
    'https://partner.example/partner.php?id=knobi',
    'https://partner.example/?partner=knobi',
  ]) {
    const c = validateComparisonConfig({ ...input, subjectUrl }, today)
    assert.throws(
      () =>
        parseRankImport(
          c,
          {
            ...importInput,
            rows: importInput.rows.replace(
              'https://partner.example/',
              subjectUrl.replace('knobi', 'other'),
            ),
          },
          today,
        ),
      /ranking_url_mismatch/,
    )
    assert.equal(
      parseRankImport(
        c,
        {
          ...importInput,
          rows: importInput.rows.replace(
            'https://partner.example/',
            subjectUrl,
          ),
        },
        today,
      ).results[0].position,
      25,
    )
  }
})
test('comparison excludes incompatible providers, versions and dates, preserves regressions and unknowns', () => {
  const baseline = batch()
  const after = batch({
    id: 'after',
    observedOn: '2026-09-20',
    results: [
      {
        keyword: 'Pizza Annweiler',
        state: 'ranked',
        position: 30,
        rankingUrl: 'https://partner.example/',
      },
      {
        keyword: 'Pizza liefern Annweiler',
        state: 'ranked',
        position: 8,
        rankingUrl: 'https://partner.example/',
      },
      {
        keyword: 'Partner Annweiler',
        state: 'ranked',
        position: 1,
        rankingUrl: 'https://partner.example/',
      },
    ],
  })
  const result = compareRankBatches(
    config(),
    baseline,
    [
      after,
      batch({ id: 'other', provider: 'Other', observedOn: '2026-09-27' }),
      batch({ id: 'future', observedOn: '2026-10-02' }),
    ],
    today,
  )
  assert.equal(result.current.id, 'after')
  assert.deepEqual(
    result.rows.map((r) => r.delta),
    [-5, null, null],
  )
  assert.deepEqual(
    result.rows.map((r) => r.change),
    ['down', 'entered', 'unavailable'],
  )
  assert.equal(result.paired, 1)
  assert.equal(result.meanDelta, -5)
  assert.equal(
    compareRankBatches(
      config(),
      baseline,
      [batch({ id: 'early', observedOn: '2026-09-05' })],
      today,
    ).current,
    null,
  )
  assert.equal(
    compareRankBatches(
      config(),
      baseline,
      [
        batch({
          id: 'version',
          method: 'organic-v2',
          observedOn: '2026-09-20',
        }),
      ],
      today,
    ).current,
    null,
  )
})
test('partial latest measurement is not replaced by a more flattering old value', () => {
  const result = compareRankBatches(
    config(),
    batch(),
    [
      batch({ id: 'known', observedOn: '2026-09-15' }),
      batch({
        id: 'partial',
        observedOn: '2026-09-20',
        results: batch().results.map((r) => ({
          ...r,
          state: 'unknown',
          position: null,
        })),
      }),
    ],
    today,
  )
  assert.equal(result.current.id, 'partial')
  assert.equal(result.meanDelta, null)
  assert.equal(result.rows[0].change, 'unavailable')
})
test('historical import can continue with the same tracker method, without inferring gains from expanded depth', () => {
  const original = batch()
  const tracker = batch({
    id: 'tracker',
    source: 'tracker',
    depth: null,
    observedOn: '2026-09-20',
    results: [
      {
        keyword: 'Pizza Annweiler',
        state: 'ranked',
        position: 10,
        rankingUrl: input.subjectUrl,
      },
      {
        keyword: 'Pizza liefern Annweiler',
        state: 'ranked',
        position: 101,
        rankingUrl: input.subjectUrl,
      },
      {
        keyword: 'Partner Annweiler',
        state: 'unknown',
        position: null,
        rankingUrl: null,
      },
    ],
  })
  const result = compareRankBatches(config(), original, [tracker], today)
  assert.equal(result.current.id, 'tracker')
  assert.equal(result.rows[0].delta, 15)
  assert.equal(result.rows[1].change, 'unavailable')
})
test('an all-unknown import records a failed observation instead of leaving a past success as current', () => {
  const result = parseRankImport(
    config(),
    {
      ...importInput,
      rows: config()
        .keywords.map((k) => `${k};?;`)
        .join('\n'),
    },
    today,
  )
  assert.equal(
    result.results.every((r) => r.state === 'unknown'),
    true,
  )
})
test('baseline timing never calls a measurement after joining a pre-partnership result', () => {
  assert.equal(classifyBaseline(config(), batch()), 'before_partner')
  assert.equal(
    classifyBaseline(config(), batch({ observedOn: '2026-09-05' })),
    'before_package',
  )
  assert.equal(
    classifyBaseline(config(), batch({ observedOn: '2026-09-20' })),
    'since_measurement',
  )
  assert.equal(
    classifyBaseline(
      { ...config(), partnerSince: null, packageStartedOn: null },
      batch(),
    ),
    'since_measurement',
  )
})
test('snapshot adapter only accepts matching target, device, engine, location, source and real evidence', () => {
  const row = {
    id: 'r1',
    target_id: 't',
    keyword: 'Pizza Annweiler',
    locale: 'de-DE',
    device: 'mobile',
    search_engine: 'google',
    location: input.location,
    grid_latitude: null,
    grid_longitude: null,
    rank_position: 18,
    ranking_url: input.subjectUrl,
    provider: 'DataForSEO',
    provider_version: 'v3',
    serp_features: [],
    observed_at: '2026-09-20T08:00:00Z',
    coverage: 1,
    confidence: 1,
  }
  row.serp_features = context()
  const rows = [
    row,
    { ...row, id: 'wrong', target_id: 'other' },
    { ...row, id: 'desktop', device: 'desktop' },
    { ...row, id: 'city', location: 'Berlin' },
    { ...row, id: 'null', keyword: 'Partner Annweiler', rank_position: null },
    { ...row, id: 'search', provider: 'Hermes web_search' },
    { ...row, id: 'invalid-method', provider_version: ' ' },
    { ...row, id: 'invalid-provider', provider: 'Bad\u0001Provider' },
    { ...row, id: 'gsc-method', provider_version: 'GSC average position' },
    { ...row, id: 'maps', grid_latitude: 49.2, grid_longitude: 7.96 },
  ]
  const result = batchesFromSnapshots('t', config(), rows)
  assert.equal(result.length, 1)
  assert.equal(result[0].results[0].position, 18)
  assert.equal(result[0].results[1].state, 'unknown')
  const normalized = batchesFromSnapshots('t', config(), [
    { ...row, provider: ' DataForSEO ', provider_version: ' v3 ' },
  ])
  assert.equal(normalized[0].provider, 'DataForSEO')
  assert.equal(normalized[0].method, 'v3')
  assert.notEqual(
    readComparisonConfig({ ...config(), baseline: normalized[0] }),
    null,
  )
})
test('ambiguous duplicate snapshot results cannot reappear as an arbitrarily selected ranking', () => {
  const row = {
    id: 'a',
    target_id: 't',
    keyword: 'Pizza Annweiler',
    locale: 'de-DE',
    device: 'mobile',
    search_engine: 'google',
    location: input.location,
    grid_latitude: null,
    grid_longitude: null,
    rank_position: 18,
    ranking_url: input.subjectUrl,
    provider: 'DataForSEO',
    provider_version: 'v3',
    serp_features: [],
    observed_at: '2026-09-20T08:00:00Z',
    coverage: 1,
    confidence: 1,
  }
  row.serp_features = context()
  const result = batchesFromSnapshots('t', config(), [
    row,
    { ...row, id: 'b', rank_position: 3 },
    { ...row, id: 'c', rank_position: 1 },
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].results[0].state, 'unknown')
})
test('latest null tracker observations remain visible and do not resurrect an older successful rank', () => {
  const row = {
    id: 'a',
    target_id: 't',
    keyword: 'Pizza Annweiler',
    locale: 'de-DE',
    device: 'mobile',
    search_engine: 'google',
    location: input.location,
    grid_latitude: null,
    grid_longitude: null,
    rank_position: 2,
    ranking_url: input.subjectUrl,
    provider: 'DataForSEO',
    provider_version: 'v3',
    serp_features: [],
    observed_at: '2026-09-15T08:00:00Z',
    coverage: 1,
    confidence: 1,
  }
  row.serp_features = context('2026-09-15')
  const batches = batchesFromSnapshots('t', config(), [
    row,
    {
      ...row,
      id: 'b',
      observed_at: '2026-09-20T08:00:00Z',
      serp_features: context(),
      rank_position: null,
      ranking_url: null,
      coverage: 0,
      confidence: 0,
    },
  ])
  const original = batch({ provider: 'DataForSEO', method: 'v3' })
  const report = compareRankBatches(config(), original, batches, today)
  assert.equal(report.current.observedOn, '2026-09-20')
  assert.equal(report.rows[0].delta, null)
  const mixedOffsets = batchesFromSnapshots('t', config(), [
    {
      ...row,
      serp_features: context('2026-09-20', {
        measured_at: '2026-09-20T10:00:00+02:00',
      }),
    },
    {
      ...row,
      id: 'newer',
      rank_position: null,
      serp_features: context('2026-09-20', {
        measured_at: '2026-09-20T09:00:00Z',
      }),
    },
  ])
  const sameDayReport = compareRankBatches(
    config(),
    original,
    mixedOffsets,
    today,
  )
  assert.equal(sameDayReport.current.recordedAt, '2026-09-20T09:00:00.000Z')
  assert.equal(sameDayReport.rows[0].delta, null)
})
test('tracker needs an explicit channel and shared run identity, regardless of query insert timestamps', () => {
  const row = {
    id: 'a',
    target_id: 't',
    keyword: 'Pizza Annweiler',
    locale: 'de-DE',
    device: 'mobile',
    search_engine: 'google',
    location: input.location,
    grid_latitude: null,
    grid_longitude: null,
    rank_position: 18,
    ranking_url: input.subjectUrl,
    provider: 'DataForSEO',
    provider_version: 'v3',
    serp_features: [],
    observed_at: '2026-09-20T08:00:01Z',
    coverage: 1,
    confidence: 1,
  }
  assert.deepEqual(batchesFromSnapshots('t', config(), [row]), [])
  assert.deepEqual(
    batchesFromSnapshots('t', config(), [
      { ...row, serp_features: context('2026-09-20', { channel: 'maps' }) },
    ]),
    [],
  )
  const rows = [
    { ...row, serp_features: context() },
    {
      ...row,
      id: 'b',
      keyword: 'Pizza liefern Annweiler',
      rank_position: 8,
      observed_at: '2026-09-20T08:00:05Z',
      serp_features: context(),
    },
  ]
  const result = batchesFromSnapshots('t', config(), rows)
  assert.equal(result.length, 1)
  assert.deepEqual(
    result[0].results.map((r) => r.position),
    [18, 8, null],
  )
  const repeatedRunId = batchesFromSnapshots('t', config(), [
    rows[0],
    {
      ...rows[0],
      serp_features: context('2026-09-21', { batch_id: context()[0].batch_id }),
    },
  ])
  assert.equal(new Set(repeatedRunId.map((b) => b.id)).size, 2)
})
test('local-pack snapshot does not become an organic rank just because coordinates are absent', () => {
  const row = {
    id: 'a',
    target_id: 't',
    keyword: 'Pizza Annweiler',
    locale: 'de-DE',
    device: 'mobile',
    search_engine: 'google',
    location: input.location,
    grid_latitude: null,
    grid_longitude: null,
    rank_position: 3,
    ranking_url: input.subjectUrl,
    provider: 'DataForSEO',
    provider_version: 'v3',
    serp_features: ['local_pack'],
    observed_at: '2026-09-20T08:00:00Z',
    coverage: 1,
    confidence: 1,
  }
  assert.deepEqual(batchesFromSnapshots('t', config(), [row]), [])
})
test('public comparison projection drops unrelated settings and detects corrupt baseline data', () => {
  const value = {
    ...config(),
    secret: 'hidden',
    baseline: { ...batch(), accessToken: 'hidden' },
  }
  const result = readComparisonConfig(value)
  assert.equal(JSON.stringify(result).includes('hidden'), false)
  assert.equal(
    readComparisonConfig({ ...value, baseline: { ...batch(), results: [] } }),
    null,
  )
})
test('history loader reads beyond one provider page and fails rather than showing partial data on errors', async () => {
  const rows = Array.from({ length: 701 }, (_, id) => ({ id }))
  assert.equal(
    (
      await readAllComparisonRows(async (from, to) => ({
        data: rows.slice(from, to + 1),
        error: null,
      }))
    ).at(-1).id,
    700,
  )
  await assert.rejects(
    readAllComparisonRows(async (from, to) =>
      from
        ? { data: null, error: { message: 'failed' } }
        : { data: rows.slice(from, to + 1), error: null },
    ),
    /storage_error/,
  )
})
test('identical historical import is idempotent but different target or evidence stays separate', () => {
  const b = parseRankImport(config(), importInput, today)
  assert.equal(importAuditId('t', b), importAuditId('t', structuredClone(b)))
  assert.notEqual(importAuditId('t', b), importAuditId('other', b))
  assert.notEqual(
    importAuditId('t', b),
    importAuditId('t', { ...b, observedOn: '2026-08-29' }),
  )
})
test('baseline freezing authorizes first, retains provider settings, detects races and cannot replace a baseline', async () => {
  let writes = 0
  let saved
  const target = {
    id: 't',
    partner_id: 'p',
    updated_at: 'v1',
    provider_config: { token: 'server-only', comparison: config() },
  }
  const store = {
    getTarget: async () => target,
    getBatches: async () => [batch()],
    updateConfig: async (id, version, value) => {
      writes++
      saved = value
      return version === 'v1'
    },
  }
  await assert.rejects(
    freezeBaseline(
      async () => {
        throw Error('unauthorized')
      },
      't',
      'v1',
    ),
    /unauthorized/,
  )
  assert.equal(writes, 0)
  await freezeBaseline(async () => store, 't', 'v1')
  assert.equal(saved.token, 'server-only')
  assert.equal(saved.comparison.baseline.results[0].position, 25)
  target.provider_config = saved
  await assert.rejects(
    freezeBaseline(async () => store, 't', 'v1'),
    /baseline_locked/,
  )
  target.provider_config = { comparison: config() }
  await assert.rejects(
    freezeBaseline(
      async () => ({ ...store, updateConfig: async () => false }),
      't',
      'v1',
    ),
    /stale/,
  )
  await assert.rejects(
    freezeBaseline(async () => store, 't', 'old'),
    /stale/,
  )
})
test('CSV export neutralizes spreadsheet formulas and preserves source, dates and missing states', () => {
  const c = { ...config(), keywords: ['=HYPERLINK("bad")'] }
  const b = batch({
    results: [
      {
        keyword: c.keywords[0],
        state: 'unknown',
        position: null,
        rankingUrl: null,
      },
    ],
  })
  const csv = comparisonCsv(c, b, compareRankBatches(c, b, [], today))
  assert.match(csv, /'=HYPERLINK/)
  assert.match(csv, /2026-08-28/)
  assert.match(csv, /Rank export/)
  assert.match(csv, /Nicht gemessen/)
})
