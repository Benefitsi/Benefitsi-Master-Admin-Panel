import assert from 'node:assert/strict'
import test from 'node:test'
import { POST } from '../../app/api/commerce/notifications/route.ts'

const secret = 'synthetic-notification-worker-secret-123456789'
async function withEnvironment(values, run) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try { return await run() } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('notification worker rejects unauthorized or disabled requests before any network work', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('unexpected network request') }
  try {
    for (const [enabled, authorization] of [['false', `Bearer ${secret}`], ['true', 'Bearer wrong'], ['true', undefined]]) {
      await withEnvironment({ BENEFITSI_COMMERCE_ENABLED: enabled, BENEFITSI_NOTIFICATION_WORKER_SECRET: secret }, async () => {
        const response = await POST(new Request('http://localhost/api/commerce/notifications', { method: 'POST', headers: authorization ? { authorization } : {} }))
        assert.equal(response.status, 401)
      })
    }
    assert.equal(calls, 0)
  } finally { globalThis.fetch = original }
})

test('unconfigured or incomplete provider never claims a notification or attempts delivery', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('unexpected network request') }
  try {
    for (const provider of [undefined, 'resend', 'adapter', 'unknown']) {
      await withEnvironment({
        BENEFITSI_COMMERCE_ENABLED: 'true', BENEFITSI_NOTIFICATION_WORKER_SECRET: secret,
        BENEFITSI_NOTIFICATION_PROVIDER: provider, RESEND_API_KEY: undefined, BENEFITSI_BOOKING_FROM_EMAIL: undefined,
        BENEFITSI_NOTIFICATION_DELIVERY_URL: undefined, BENEFITSI_NOTIFICATION_DELIVERY_TOKEN: undefined,
        NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
      }, async () => {
        const response = await POST(new Request('http://localhost/api/commerce/notifications', { method: 'POST', headers: { authorization: `Bearer ${secret}` } }))
        assert.equal(response.status, 503)
        assert.doesNotMatch(await response.text(), /synthetic-service-key|re_/)
      })
    }
    assert.equal(calls, 0)
  } finally { globalThis.fetch = original }
})
