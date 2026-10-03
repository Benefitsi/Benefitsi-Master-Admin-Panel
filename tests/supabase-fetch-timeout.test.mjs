import assert from "node:assert/strict"
import test from "node:test"
import { createBoundedSupabaseFetch } from "../lib/supabase/bounded-fetch.ts"

test("a stalled Supabase request is aborted instead of leaving the form pending indefinitely", async () => {
  const keepAlive = setTimeout(() => {}, 200)
  try {
    const fetcher = createBoundedSupabaseFetch((_input, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    }), 10)
    await assert.rejects(fetcher("https://example.invalid/rest/v1/deals"), error => error.name === "TimeoutError")
  } finally { clearTimeout(keepAlive) }
})
test("bounded fetch preserves an existing cancellation signal and request body", async () => {
  const controller = new AbortController()
  let observed
  const fetcher = createBoundedSupabaseFetch(async (input, init) => {
    observed = { input, init }
    return new Response("ok")
  }, 500)
  const response = await fetcher("https://example.invalid/rest/v1/deals", { method: "POST", body: "synthetic", signal: controller.signal })
  assert.equal(await response.text(), "ok")
  assert.equal(observed.init.body, "synthetic")
  controller.abort(new Error("Route changed"))
  assert.equal(observed.init.signal.aborted, true)
  assert.equal(observed.init.signal.reason.message, "Route changed")
})
test("Request object cancellation is retained when init does not contain a signal", async () => {
  const controller = new AbortController()
  const request = new Request("https://example.invalid/rest/v1/deals", { signal: controller.signal })
  let signal
  const fetcher = createBoundedSupabaseFetch(async (_input, init) => { signal = init.signal; return new Response() })
  await fetcher(request)
  controller.abort()
  assert.equal(signal.aborted, true)
})
