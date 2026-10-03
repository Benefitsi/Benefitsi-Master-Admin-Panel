import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { createElement as h } from "react"
import { renderToReadableStream } from "react-dom/server"
import { loadTypescript } from "./helpers/load-typescript.mjs"

const require = createRequire(import.meta.url)
const { createServerClient } = require("@supabase/ssr")
const user = { id: "00000000-0000-4000-8000-000000000501", email: "fixture@example.invalid" }
const session = { user, profile: { id: user.id, is_admin: false }, isAdmin: false }
function page(getAdminSession, createClient = async () => ({})) {
  return loadTypescript("app/login/page.tsx", {
    "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`) } },
    "@/app/actions": { signOut: async () => { throw new Error("No mutations in this test") } },
    "@/lib/admin": { getAdminSession },
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ isConfigured: true }) },
    "@/lib/supabase/server": { createClient },
    "./login-form": { LoginForm: () => h("form", { "data-login": true }, h("input", { name: "password" })) },
    "@/components/pending-submit-button": { PendingSubmitButton: ({ children }) => h("button", {}, children) },
    "@/components/brand-logo": { BrandLogo: () => null },
    "@/app/admin-language": { AdminLanguageProvider: ({ children }) => children, AdminLanguageControl: () => null },
  }).default
}
async function html(Page) {
  const stream = await renderToReadableStream(await Page())
  await stream.allReady
  return new Response(stream).text()
}

test("login rendering reads the validated session once and preserves the non-admin notice", async () => {
  let reads = 0, clients = 0
  const Page = page(async () => { reads++; return session }, async () => { clients++; return {} })
  const body = await html(Page)
  assert.match(body, /not authorized for the admin panel/)
  assert.match(body, /data-login/)
  assert.equal(reads, 1)
  assert.equal(clients, 1)
})

test("real SSR clients do not refresh the same expired RSC cookie twice during login rendering", async () => {
  const token = exp => `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp })).toString("base64url")}.fixture-signature`
  const expired = { access_token: token(1), refresh_token: "synthetic-expired-refresh", expires_at: 1, expires_in: 1, token_type: "bearer", user }
  const cookie = { name: "sb-fixture-auth-token", value: `base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}` }
  const refreshes = []
  const clients = []
  const createClient = async () => {
    const client = createServerClient("https://fixture.supabase.co", "synthetic-publishable-key", {
      cookies: { getAll: () => [{ ...cookie }], setAll: () => {} },
      global: { fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input.url)
        if (url.pathname === "/auth/v1/token") {
          refreshes.push(JSON.parse(init.body).refresh_token)
          return Response.json({ access_token: token(Math.floor(Date.now() / 1000) + 3600), refresh_token: "synthetic-new-refresh", expires_in: 3600, token_type: "bearer", user })
        }
        if (url.pathname === "/auth/v1/user") return Response.json(user)
        if (url.pathname === "/rest/v1/users") return Response.json([{ id: user.id, email: user.email, display_name: "Fixture", is_admin: false }])
        throw new Error(`Unexpected mocked transport: ${url.pathname}`)
      } },
    })
    clients.push(client)
    return client
  }
  const { getAdminSession } = loadTypescript("lib/admin.ts", {
    "next/headers": { headers: async () => new Headers({ host: "admin.benefitsi.de" }) },
    "next/navigation": { redirect: () => { throw new Error("Unexpected redirect") } },
    "@/lib/portal-routing": { isPartnerHost: () => false },
    "@/lib/supabase/server": { createClient },
    "@/lib/supabase/config": { getSupabaseConfig: () => ({ isConfigured: true }) },
  })
  const body = await html(page(getAdminSession, createClient))
  assert.match(body, /not authorized for the admin panel/)
  assert.equal(refreshes.length, 1)
  assert.equal(clients.length, 1)
  assert.deepEqual(refreshes, ["synthetic-expired-refresh"])
})

test("a rejected session lookup still renders login without granting access", async () => {
  const Page = page(async () => { throw new DOMException("Synthetic timeout", "TimeoutError") })
  const body = await html(Page)
  assert.match(body, /data-login/)
  assert.match(body, /role="alert"/)
  assert.doesNotMatch(body, /not authorized for the admin panel|fixture@example/)
})

test("a validated administrator still redirects and redirect errors are never swallowed", async () => {
  await assert.rejects(page(async () => ({ ...session, isAdmin: true }))(), /redirect:\/$/)
})
