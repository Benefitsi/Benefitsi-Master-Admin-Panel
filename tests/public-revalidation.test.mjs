import assert from "node:assert/strict"
import test from "node:test"

import { notifyPublicRevalidation } from "../lib/public-revalidation.ts"

const originalFetch = globalThis.fetch
const originalUrl = process.env.BENEFITSI_WEB_REVALIDATION_URL
const originalSecret = process.env.BENEFITSI_WEB_REVALIDATION_SECRET

function restoreEnvironment() {
  globalThis.fetch = originalFetch
  if (originalUrl === undefined) delete process.env.BENEFITSI_WEB_REVALIDATION_URL
  else process.env.BENEFITSI_WEB_REVALIDATION_URL = originalUrl
  if (originalSecret === undefined) delete process.env.BENEFITSI_WEB_REVALIDATION_SECRET
  else process.env.BENEFITSI_WEB_REVALIDATION_SECRET = originalSecret
}

test.afterEach(restoreEnvironment)

test("public revalidation is fail-safe when the shared secret is not configured", async () => {
  delete process.env.BENEFITSI_WEB_REVALIDATION_URL
  delete process.env.BENEFITSI_WEB_REVALIDATION_SECRET
  let called = false
  globalThis.fetch = async () => {
    called = true
    throw new Error("fetch must not be called")
  }

  const result = await notifyPublicRevalidation({ resource: "event", citySlug: "annweiler" })

  assert.deepEqual(result, { status: "not_configured" })
  assert.equal(called, false)
})

test("public revalidation sends a bounded resource payload", async () => {
  process.env.BENEFITSI_WEB_REVALIDATION_URL = "https://benefitsi.de/api/revalidate"
  process.env.BENEFITSI_WEB_REVALIDATION_SECRET = "shared-test-secret"
  let request
  globalThis.fetch = async (input, init) => {
    request = { input, init }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  const result = await notifyPublicRevalidation({
    resource: "partner",
    citySlug: "annweiler",
    partnerSlug: "knobi-doener",
  })

  assert.deepEqual(result, { status: "sent", statusCode: 200 })
  assert.equal(request.input, "https://benefitsi.de/api/revalidate")
  assert.equal(request.init.method, "POST")
  assert.equal(request.init.headers.Authorization, "Bearer shared-test-secret")
  assert.deepEqual(JSON.parse(request.init.body), {
    resource: "partner",
    citySlug: "annweiler",
    partnerSlug: "knobi-doener",
  })
})

test("revalidation failures never fail the source write", async () => {
  process.env.BENEFITSI_WEB_REVALIDATION_URL = "https://benefitsi.de/api/revalidate"
  process.env.BENEFITSI_WEB_REVALIDATION_SECRET = "shared-test-secret"
  globalThis.fetch = async () => new Response("unavailable", { status: 503 })

  const result = await notifyPublicRevalidation({ resource: "memory", citySlug: "annweiler" })

  assert.deepEqual(result, { status: "failed", statusCode: 503 })
})
