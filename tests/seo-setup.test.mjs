import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateSeoSetup,
  saveSeoSetup,
  runSeoMeasurement,
} from '../lib/seo/seo-setup.ts'
const target = {
  id: 't',
  updated_at: '2026-09-27T00:00:00Z',
  status: 'active',
  canonical_url: 'https://benefitsi.de/p/test',
  target_type: 'partner_microsite',
  partner_id: 'p',
  city_id: null,
  provider_config: { measurements: { ready: false }, custom: { keep: 1 } },
}
const input = {
  business: { name: 'Test' },
  businessConfirmed: true,
  profiles: {
    google: {
      url: 'https://www.google.com/maps/place/Test',
      ownershipConfirmed: true,
      eligibilityConfirmed: true,
      checked: true,
    },
  },
}
function store(options = {}) {
  const writes = []
  return {
    writes,
    getTarget: async () => structuredClone(target),
    updateConfig: async (id, version, config) => {
      writes.push({ id, version, config })
      return !options.stale
    },
    insertAudit: async (row) => {
      writes.push(row)
    },
  }
}
test('validates public URLs and requires manual business/ownership/eligibility confirmation', () => {
  for (const url of [
    'https://user:password@www.google.com/maps/test',
    'http://www.google.com/maps/test',
    'https://evil.google.com/maps/test',
    'https://www.google.com.evil.test/maps',
    'javascript:alert(1)',
    'https://www.google.com/maps?token=secret',
  ])
    assert.throws(() =>
      validateSeoSetup({
        ...input,
        profiles: { google: { ...input.profiles.google, url } },
      }),
    )
  assert.throws(() => validateSeoSetup({ ...input, businessConfirmed: false }))
  assert.throws(() =>
    validateSeoSetup({
      ...input,
      profiles: {
        google: { ...input.profiles.google, ownershipConfirmed: false },
      },
    }),
  )
  assert.throws(() => validateSeoSetup({ ...input, apiKey: 'secret' }))
  assert.throws(() =>
    validateSeoSetup({ ...input, business: { description: 'x'.repeat(2001) } }),
  )
  assert.equal(
    validateSeoSetup(input).profiles.google.status,
    'manually_checked',
  )
})
test('setup authenticates before reading target, preserves readiness and unknown config, checks stale writes', async () => {
  const db = store()
  await assert.rejects(
    saveSeoSetup(
      async () => {
        throw Error('unauthorized')
      },
      't',
      target.updated_at,
      input,
    ),
  )
  assert.equal(db.writes.length, 0)
  await saveSeoSetup(async () => db, 't', target.updated_at, input)
  assert.deepEqual(db.writes[0].config.measurements, { ready: false })
  assert.deepEqual(db.writes[0].config.custom, { keep: 1 })
  assert.equal(db.writes[0].version, target.updated_at)
  await assert.rejects(
    saveSeoSetup(async () => store(), 't', 'old', input),
    /stale/,
  )
  await assert.rejects(
    saveSeoSetup(
      async () => store({ stale: true }),
      't',
      target.updated_at,
      input,
    ),
    /stale/,
  )
  await assert.rejects(
    saveSeoSetup(async () => store(), 't', target.updated_at, {
      ...input,
      measurements: { ready: true },
    }),
  )
})
test('measurement authenticates and rereads canonical target, persists honest evidence with empty scores', async () => {
  let measured = false
  await assert.rejects(
    runSeoMeasurement(
      async () => {
        throw Error('unauthorized')
      },
      't',
      'gsc',
      async () => {
        measured = true
      },
    ),
  )
  assert.equal(measured, false)
  const db = store()
  await runSeoMeasurement(
    async () => db,
    't',
    'gsc',
    async (t) => {
      assert.equal(t.canonical_url, target.canonical_url)
      return {
        provider: 'gsc',
        state: 'no_data',
        observedAt: '2026-09-27T12:00:00Z',
        source: 'Google Search Console',
        data: null,
      }
    },
  )
  assert.deepEqual(db.writes[0].scores, {})
  assert.equal(db.writes[0].status, 'partial')
  assert.equal(db.writes[0].target_id, 't')
  assert.equal(db.writes[0].evidence.state, 'no_data')
  assert.equal(db.writes[0].coverage, 0)
})
test('rejects private website addresses and does not accept a claimed status without confirmations', () => {
  for (const website of [
    'https://172.16.0.1/',
    'https://machine.internal/',
    'https://127.1/',
  ])
    assert.throws(() => validateSeoSetup({ ...input, business: { website } }))
  assert.equal(
    validateSeoSetup({
      ...input,
      profiles: {
        google: {
          ...input.profiles.google,
          checked: false,
          status: 'manually_checked',
        },
      },
    }).profiles.google.status,
    'prepared',
  )
})
test('database persistence applies target and version predicates and rejects zero updated rows', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const { createSeoStore } = await import('../lib/seo/seo-setup.ts')
  assert.equal(typeof createSeoStore, 'function')
  let stale = false
  const persisted = []
  const supabase = createClient(
    'https://database.example.test',
    'public-test-key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (url, init) => {
          const endpoint = new URL(url)
          const method = init.method ?? 'GET'
          if (method === 'GET') {
            assert.equal(endpoint.searchParams.get('id'), 'eq.t')
            return new Response(JSON.stringify([target]), { status: 200 })
          }
          if (method === 'PATCH') {
            assert.equal(endpoint.searchParams.get('id'), 'eq.t')
            assert.equal(
              endpoint.searchParams.get('updated_at'),
              'eq.2026-09-27T00:00:00Z',
            )
            persisted.push(JSON.parse(init.body))
            return new Response(JSON.stringify(stale ? [] : [{ id: 't' }]), {
              status: 200,
            })
          }
          assert.equal(endpoint.pathname, '/rest/v1/seo_audit_runs')
          persisted.push(JSON.parse(init.body))
          return new Response(null, { status: 201 })
        },
      },
    },
  )
  const db = createSeoStore(supabase)
  await saveSeoSetup(async () => db, 't', target.updated_at, input)
  assert.deepEqual(persisted[0].provider_config.measurements, { ready: false })
  stale = true
  await assert.rejects(
    saveSeoSetup(async () => db, 't', target.updated_at, input),
    /stale/,
  )
  await runSeoMeasurement(
    async () => db,
    't',
    'psi',
    async () => ({
      provider: 'psi',
      state: 'forbidden',
      source: 'PSI',
      observedAt: new Date().toISOString(),
      data: null,
    }),
  )
  assert.equal(persisted.at(-1).status, 'failed')
  assert.deepEqual(persisted.at(-1).scores, {})
})
test('client projection excludes all private and unknown provider configuration', async () => {
  const { publicSeoTarget } = await import('../lib/seo/seo-setup.ts')
  assert.equal(typeof publicSeoTarget, 'function')
  const projected = publicSeoTarget({
    ...target,
    provider_config: {
      setup: input,
      token: 'hidden',
      measurements: { secret: 'hidden' },
      custom: { secret: 'hidden' },
    },
  })
  assert.deepEqual(Object.keys(projected.provider_config), ['setup'])
  assert.doesNotMatch(JSON.stringify(projected), /hidden/)
})
test('city and editorial pages cannot store business profiles but can run measurements', async () => {
  for (const target_type of ['city_portal', 'editorial_site']) {
    const db = store()
    db.getTarget = async () => ({ ...target, target_type, partner_id: null })
    await assert.rejects(
      saveSeoSetup(async () => db, 't', target.updated_at, input),
      /profile_setup_unavailable/,
    )
    assert.equal(db.writes.length, 0)
    await runSeoMeasurement(
      async () => db,
      't',
      'gsc',
      async () => ({
        provider: 'gsc',
        state: 'no_data',
        source: 'Google',
        observedAt: new Date().toISOString(),
        data: null,
      }),
    )
    assert.equal(db.writes[0].target_id, 't')
  }
})
