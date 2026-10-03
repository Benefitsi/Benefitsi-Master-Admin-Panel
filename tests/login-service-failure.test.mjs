import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const { createServerClient } = createRequire(import.meta.url)("@supabase/ssr")
function loginFor(response) {
  const client = createServerClient("https://fixture.supabase.co", "synthetic-publishable-key", {
    cookies: { getAll: () => [], setAll: () => {} },
    global: { fetch: async () => {
      if (response instanceof Error) throw response
      return Response.json(response.body, { status: response.status })
    } },
  })
  return loadTypescript("app/login/actions.ts", {
    "next/headers": { headers: async () => new Headers({ host: "admin.benefitsi.de" }) },
    "@/lib/portal-routing": { isPartnerHost: () => false },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("Unexpected privileged redirect") } },
    "@/lib/admin": { getAdminSession: async () => { throw new Error("A failed password request must not reach authorization") } },
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ isConfigured: true }) },
    "@/lib/supabase/server": { createClient: async () => client },
  }).login
}
async function run(response) {
  const form = new FormData()
  form.set("email", "fixture@example.invalid")
  form.set("password", "synthetic-test-value")
  return loginFor(response)({ message: "" }, form)
}
test("real SDK auth 500 and 504 errors report temporary unavailability instead of invalid credentials", async () => {
  for (const [status, code] of [[500, "unexpected_failure"], [504, "request_timeout"]]) {
    const result = await run({ status, body: { code, msg: "Synthetic provider failure" } })
    assert.match(result.message, /temporarily unavailable/)
    assert.doesNotMatch(result.message, /Invalid email or password|fixture@example/)
  }
})
test("real SDK transport failures report temporary unavailability", async () => {
  for (const error of [new TypeError("Synthetic network failure"), new DOMException("Synthetic timeout", "TimeoutError")]) {
    assert.match((await run(error)).message, /temporarily unavailable/)
  }
})
test("real SDK credential failures retain the generic invalid-credentials message", async () => {
  const result = await run({ status: 400, body: { code: "invalid_credentials", msg: "Synthetic credential rejection" } })
  assert.equal(result.message, "Invalid email or password.")
})
