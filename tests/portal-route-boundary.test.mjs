import assert from "node:assert/strict"
import test from "node:test"
import * as routes from "../lib/auth-recovery.ts"

test("expired partner sessions return to the partner login, with exact path boundaries", () => {
  assert.equal(routes.loginPathForRequest("/partner"), "/partner/login")
  assert.equal(routes.loginPathForRequest("/partner/microsite-builder/shop"), "/partner/login")
  assert.equal(routes.loginPathForRequest("/partners"), "/login")
  assert.equal(routes.loginPathForRequest("/analytics"), "/login")
})
