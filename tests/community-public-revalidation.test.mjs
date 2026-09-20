import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { requestPublicCityRevalidation } from '../lib/city-pages/public-revalidation-request.ts'

const input = { citySlug: 'annweiler', cityId: '743d7d74-5856-4ccd-b91a-907a8cecab90' }
const secret = 'synthetic-city-revalidation-secret-only'
const endpoint = 'https://paired-web.vercel.app/api/revalidate'
const bypass = 'synthetic-preview-bypass-only'
const successfulFetch = async () => new Response('{"ok":true}')

// The regressions are credential delivery to an implicit production fallback,
// unsupported caller-supplied cityId, and missing/scoped-wrong preview protection.
test('missing or incomplete configuration never attempts a public request', async () => {
  for (const options of [{ endpoint }, { secret }, { secret: 'short', endpoint }, { secret, endpoint: ' ' }]) {
    let called = false
    assert.equal(await requestPublicCityRevalidation(input, { ...options, vercelEnv: 'preview', fetcher: async () => { called = true } }), 'not_configured')
    assert.equal(called, false)
  }
})

test('refresh sends only supported slugs to the exact configured endpoint', async () => {
  const calls = []
  const result = await requestPublicCityRevalidation(input, { secret, endpoint, fetcher: async (url, options) => {
    calls.push({ url, options })
    return successfulFetch()
  } })
  assert.equal(result, 'ok')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, endpoint)
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`)
  assert.equal(calls[0].options.cache, 'no-store')
  assert.equal(calls[0].options.redirect, 'error')
  assert.ok(calls[0].options.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(calls[0].options.body), { resource: 'city', citySlug: 'annweiler' })
})

test('network, unsuccessful status and false or malformed JSON keep refresh failed', async () => {
  for (const fetcher of [async () => { throw Error('network') }, async () => new Response('{}', { status: 503 }), async () => new Response('{"ok":false}'), async () => new Response('invalid JSON')]) {
    assert.equal(await requestPublicCityRevalidation(input, { secret, endpoint, fetcher }), 'failed')
  }
})

test('invalid slugs and unsafe endpoint configuration never emit credentials', async () => {
  for (const citySlug of ['../foo', '', 'a'.repeat(121)]) {
    let called = false
    assert.equal(await requestPublicCityRevalidation({ ...input, citySlug }, { secret, endpoint, fetcher: async () => { called = true } }), 'failed')
    assert.equal(called, false)
  }
  for (const configured of ['http://web.example/api/revalidate', 'https://web.example/wrong', 'https://web.example/api/revalidate/', 'https://web.example/api/revalidate?key=test', 'https://web.example/api/revalidate#fragment', 'https://user:password@web.example/api/revalidate', 'not a URL']) {
    let called = false
    assert.equal(await requestPublicCityRevalidation(input, { secret, endpoint: configured, fetcher: async () => { called = true } }), 'failed')
    assert.equal(called, false)
  }
})

test('protected Vercel preview receives the server-only bypass header', async () => {
  const calls = []
  assert.equal(await requestPublicCityRevalidation(input, { secret, endpoint, vercelEnv: 'preview', protectionBypassSecret: bypass, fetcher: async (url, options) => {
    calls.push({ url, options })
    return options.headers['x-vercel-protection-bypass'] === bypass ? successfulFetch() : new Response('Protected', { status: 401 })
  } }), 'ok')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, endpoint)
})

test('bypass credentials never go to Production, Development, custom or lookalike hosts', async () => {
  for (const [vercelEnv, configured] of [['production', endpoint], ['development', endpoint], ['preview', 'https://web.example/api/revalidate'], ['preview', 'https://vercel.app.attacker.example/api/revalidate'], ['preview', 'https://vercel.app/api/revalidate']]) {
    const calls = []
    assert.equal(await requestPublicCityRevalidation(input, { secret, endpoint: configured, vercelEnv, protectionBypassSecret: bypass, fetcher: async (url, options) => {
      calls.push({ url, options }); return successfulFetch()
    } }), 'ok')
    assert.equal(calls[0].options.headers['x-vercel-protection-bypass'], undefined)
  }
})

function loadWrapper(env, fetcher) {
  const loaded = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL('../lib/city-pages/public-revalidation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', 'process', code)(name => {
    if (name === 'server-only') return {}
    assert.equal(name, './public-revalidation-request')
    return { requestPublicCityRevalidation: (value, options) => requestPublicCityRevalidation(value, { ...options, fetcher }) }
  }, loaded, loaded.exports, { env })
  return loaded.exports.refreshPublicCity
}

test('actual City wrapper wires the paired endpoint and preview protection configuration', async () => {
  const calls = []
  const refresh = loadWrapper({ BENEFITSI_ADMIN_REVALIDATION_SECRET: secret, BENEFITSI_WEB_REVALIDATION_URL: endpoint, BENEFITSI_WEB_URL: 'https://wrong.example', VERCEL_ENV: 'preview', BENEFITSI_WEB_PROTECTION_BYPASS_SECRET: bypass }, async (url, options) => { calls.push({ url, options }); return successfulFetch() })
  assert.equal(await refresh(input.citySlug, input.cityId), 'ok')
  assert.equal(calls[0].url, endpoint)
  assert.equal(calls[0].options.headers['x-vercel-protection-bypass'], bypass)
  assert.deepEqual(JSON.parse(calls[0].options.body), { resource: 'city', citySlug: 'annweiler' })
})

test('actual City wrapper cannot fall back from missing endpoint to the production domain', async () => {
  let called = false
  const refresh = loadWrapper({ BENEFITSI_WEB_REVALIDATION_SECRET: secret, BENEFITSI_WEB_URL: 'https://benefitsi.de', VERCEL_ENV: 'preview' }, async () => { called = true; return successfulFetch() })
  assert.equal(await refresh(input.citySlug, input.cityId), 'not_configured')
  assert.equal(called, false)
})
