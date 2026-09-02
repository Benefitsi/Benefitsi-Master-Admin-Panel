import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  forgotPasswordPathForPortal,
  loginPathForPortal,
  normalizeAuthPortal,
  recoveryCallbackUrl,
  resetPasswordPathForPortal,
  safeRecoveryRedirect,
} from "../lib/auth-recovery.ts"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("keeps admin and partner recovery destinations separate", () => {
  assert.equal(normalizeAuthPortal("partner"), "partner")
  assert.equal(normalizeAuthPortal("anything-else"), "admin")
  assert.equal(loginPathForPortal("admin"), "/login")
  assert.equal(loginPathForPortal("partner"), "/partner/login")
  assert.equal(forgotPasswordPathForPortal("admin"), "/forgot-password")
  assert.equal(
    forgotPasswordPathForPortal("partner"),
    "/partner/forgot-password",
  )
  assert.equal(
    resetPasswordPathForPortal("partner"),
    "/reset-password?portal=partner",
  )
  assert.equal(
    recoveryCallbackUrl("https://admin.example.com", "partner"),
    "https://admin.example.com/auth/confirm?next=%2Freset-password%3Fportal%3Dpartner",
  )
})

test("recovery callbacks only redirect to the known internal reset page", () => {
  assert.equal(
    safeRecoveryRedirect("/reset-password?portal=partner"),
    "/reset-password?portal=partner",
  )
  assert.equal(
    safeRecoveryRedirect(
      "https://admin.example.com/reset-password?portal=partner",
    ),
    "/reset-password?portal=partner",
  )
  assert.equal(
    safeRecoveryRedirect("https://attacker.example/reset-password?portal=admin"),
    "/reset-password?portal=admin",
  )
  assert.equal(
    safeRecoveryRedirect("https://attacker.example/phishing?portal=partner"),
    "/reset-password?portal=admin",
  )
})

test("both login forms expose password recovery and auth routes stay public", async () => {
  const [
    adminLogin,
    partnerLogin,
    proxy,
    requestForm,
    resetForm,
    callback,
    recoveryTemplate,
  ] =
    await Promise.all([
      read("app/login/login-form.tsx"),
      read("app/partner/login/login-form.tsx"),
      read("lib/supabase/proxy.ts"),
      read("app/forgot-password/recovery-request-form.tsx"),
      read("app/reset-password/reset-password-form.tsx"),
      read("app/auth/confirm/route.ts"),
      read("supabase/templates/recovery.html"),
    ])

  assert.match(adminLogin, /href="\/forgot-password"/)
  assert.match(partnerLogin, /href="\/partner\/forgot-password"/)
  assert.match(proxy, /pathname === "\/forgot-password"/)
  assert.match(proxy, /pathname === "\/partner\/forgot-password"/)
  assert.match(proxy, /pathname === "\/reset-password"/)
  assert.match(requestForm, /auth\.resetPasswordForEmail/)
  assert.match(requestForm, /recoveryCallbackUrl\(window\.location\.origin, portal\)/)
  assert.match(requestForm, /If an account exists/)
  assert.match(resetForm, /auth\.exchangeCodeForSession/)
  assert.match(resetForm, /auth\.updateUser/)
  assert.match(callback, /auth\.verifyOtp/)
  assert.match(callback, /type === "recovery"/)
  assert.match(recoveryTemplate, /href="{{ \.ConfirmationURL }}"/)
  assert.doesNotMatch(recoveryTemplate, /\.SiteURL/)
})
