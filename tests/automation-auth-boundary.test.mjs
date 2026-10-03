import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypescript } from './helpers/load-typescript.mjs'

for (const endpoint of ['tick', 'worker']) {
  test(`${endpoint} rejects a multibyte bearer value without throwing or running privileged work`, async t => {
    const previous = process.env.CRON_SECRET
    process.env.CRON_SECRET = 'a'.repeat(32)
    t.after(() => { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous })
    const unavailable = () => { throw Error('unauthorized privileged work') }
    const route = loadTypescript(`app/api/automation/${endpoint}/route.ts`, {
      '@/lib/city-agent/runner': { runNextCityAgentJob: unavailable },
      '@/lib/city-agent/operations': { recoverStaleCityAgentRuns: unavailable },
      '@/lib/supabase/admin': { createAdminClient: unavailable },
    }, { Request, Response })
    const response = await route.GET(new Request(`https://admin.benefitsi.de/api/automation/${endpoint}`, {
      headers: { authorization: `Bearer ${'é'.repeat(32)}` },
    }))
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { ok: false, error: 'unauthorized' })
  })
}
