import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../lib/admin-data.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText
const loaded = {exports: {}}
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const {getDashboardData} = loaded.exports

function database(count = 303) {
  const requests = []
  const partners = Array.from({length: count}, (_, index) => ({id: `partner-${index}`, name: `Shop ${index}`}))
  return {
    requests,
    client: {
      from(table) {
        const query = {
          select() {return query}, order() {return query}, limit() {return query},
          then(resolve, reject) {return Promise.resolve({data: table === 'partners' ? partners : [], error: null}).then(resolve, reject)},
        }
        return query
      },
      async rpc(name, args) {
        requests.push({name, ...args})
        return {data: {partner_id: args.p_partner_id, plan_code: 'pro', features: {'media.rich': true, 'menu.ai_import': true}}, error: null}
      },
    },
  }
}

test('an admin refresh fetches capabilities only for the open partner, keeping all list records', async () => {
  const db = database()
  const dashboard = await getDashboardData(db.client, {entitlementPartnerId: 'partner-42'})
  assert.equal(dashboard.partners.length, 303)
  assert.equal(db.requests.length, 1)
  assert.deepEqual(db.requests, [{name: 'get_partner_entitlements', p_partner_id: 'partner-42'}])
  assert.equal(dashboard.partners[42].media_rich_enabled, true)
  assert.equal(dashboard.partners[42].menu_ai_import_enabled, true)
  assert.equal(dashboard.partners[0].media_rich_enabled, undefined)
})

test('an initial admin load or stale partner link resolves only the first available partner', async () => {
  for (const id of [null, 'missing-partner']) {
    const db = database(4)
    await getDashboardData(db.client, {entitlementPartnerId: id})
    assert.equal(db.requests.length, 1)
    assert.deepEqual(db.requests, [{name: 'get_partner_entitlements', p_partner_id: 'partner-0'}])
  }
})

test('callers requesting complete capabilities still receive every partner flag', async () => {
  const db = database(3)
  const data = await getDashboardData(db.client)
  assert.equal(db.requests.length, 3)
  assert.ok(data.partners.every(partner => partner.menu_ai_import_enabled === true))
})
test('failed capability reads remain unknown and retryable instead of becoming a known locked tariff', async () => {
  for (const rpc of [async () => ({ data: null, error: { message: 'Transport unavailable' } }), async () => { throw new Error('Timeout') }]) {
    const db = database(1)
    db.client.rpc = rpc
    const dashboard = await getDashboardData(db.client, { entitlementPartnerId: 'partner-0' })
    assert.equal(dashboard.partners[0].menu_ai_import_enabled, undefined)
    assert.match(dashboard.errors.join(' '), /Tarifberechtigungen/)
  }
})
