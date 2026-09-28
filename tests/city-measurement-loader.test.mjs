import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import * as normalize from "../lib/analytics/city-measurement-normalize.ts"
import * as windows from "../lib/analytics/city-measurement-filters.ts"
import * as permissions from "../lib/analytics/permissions.ts"
import { city, filters, scope, conversionFixture, operationsFixture } from "./helpers/city-measurement-fixtures.mjs"

function setup(options = {}) {
  const calls = []
  const response = result => ({ abortSignal(signal) {
    assert.ok(signal instanceof AbortSignal)
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  } })
  const client = {
    rpc(name) {
      calls.push(["permission", name])
      return response(options.permissions ?? { data: { business_analytics_read: true, finance_read: false }, error: null })
    },
    from(table) {
      calls.push(["table", table])
      const query = { ...response(options.cities ?? { data: [city], error: null }) }
      for (const method of ["select", "order", "limit"]) query[method] = (...args) => { calls.push([method, ...args]); return query }
      return query
    },
  }
  const dependencies = {
    "server-only": {},
    "../admin": { getAdminSession: async supplied => {
      assert.equal(supplied, client)
      calls.push(["auth"])
      return await (Object.hasOwn(options, "session") ? options.session : { isAdmin: true })
    } },
    "../supabase/admin": { createAdminClient() {
      calls.push(["service"])
      if (options.missingConfiguration) throw new Error("private configuration details")
      return { rpc(name, args) {
        calls.push(["rpc", name, args])
        return response(name === "city_conversion_readout"
          ? options.conversion ?? { data: conversionFixture(), error: null }
          : options.operations ?? { data: operationsFixture(), error: null })
      } }
    } },
    "./permissions": permissions,
    "./city-measurement-filters": windows,
    "./city-measurement-normalize": normalize,
  }
  const source = readFileSync(new URL("../lib/analytics/city-measurement-loader.ts", import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, loaded, loaded.exports)
  return { calls, run: (value = filters) => loaded.exports.loadCityMeasurement(client, value) }
}

test("missing or partner sessions never read city data or create a service client", async () => {
  for (const session of [null, { isAdmin: false }]) {
    const check = setup({ session })
    assert.equal((await check.run()).state, "forbidden")
    assert.deepEqual(check.calls, [["auth"]])
  }
})

test("admin authorization completes and separate analytics permission passes before service access", async () => {
  let complete
  const check = setup({ session: new Promise(resolve => { complete = resolve }) })
  const pending = check.run()
  assert.deepEqual(check.calls, [["auth"]])
  complete({ isAdmin: true })
  const result = await pending
  assert.equal(result.state, "loaded")
  assert.equal(result.conversion.data.confirmedVisits, 2)
  assert.equal(result.operations.data.vitals[0].p75, 2700)
  assert.ok(check.calls.findIndex(call => call[0] === "permission") < check.calls.findIndex(call => call[0] === "service"))
  const rpcCalls = check.calls.filter(call => call[0] === "rpc")
  assert.deepEqual(rpcCalls, [
    ["rpc", "city_conversion_readout", { p_city_slug: "annweiler", p_from: scope.from, p_until: scope.until, p_environment: "production" }],
    ["rpc", "city_web_operations_readout", { p_city_slug: "annweiler", p_from: scope.from, p_until: scope.until, p_environment: "production" }],
  ])
})

test("admin flag alone never grants analytics and permission failures cannot become empty metrics", async () => {
  for (const [permissionResult, state] of [
    [{ data: { is_admin: true }, error: null }, "forbidden"],
    [{ data: null, error: { code: "PGRST202" } }, "setup_required"],
    [{ data: null, error: { code: "42501", message: "private user details" } }, "unavailable"],
  ]) {
    const check = setup({ permissions: permissionResult })
    const result = await check.run()
    assert.equal(result.state, state)
    assert.equal(check.calls.some(call => call[0] === "service" || call[0] === "table"), false)
    assert.equal(JSON.stringify(result).includes("private"), false)
  }
})

test("unselected, unknown and unsupported scopes do not execute privileged readouts", async () => {
  for (const [change, expected] of [[{ cityId: null }, "selection_required"], [{ cityId: "11111111-1111-4111-8111-111111111111" }, "invalid_scope"], [{ channel: "email" }, "invalid_scope"], [{ dateFrom: "2026-01-01" }, "invalid_scope"]]) {
    const check = setup()
    const result = await check.run({ ...filters, ...change })
    assert.equal(result.state, expected)
    assert.equal(check.calls.some(call => call[0] === "service"), false)
  }
})

test("missing technical migration leaves the existing city source available", async () => {
  const check = setup({ operations: { data: null, error: { code: "42883" } } })
  const result = await check.run()
  assert.equal(result.conversion.state, "ready")
  assert.deepEqual(result.operations, { state: "setup_required" })
})

test("transport error, wrong response scope and absent service configuration never produce synthetic zero", async () => {
  for (const conversion of [new Error("private timeout details"), { data: { ...conversionFixture(), city: "landau" }, error: null }]) {
    const result = await setup({ conversion }).run()
    assert.deepEqual(result.conversion, { state: "unavailable" })
    assert.equal(result.operations.state, "ready")
    assert.equal(JSON.stringify(result).includes("private"), false)
  }
  const result = await setup({ missingConfiguration: true }).run()
  assert.equal(result.state, "loaded")
  assert.deepEqual(result.conversion, { state: "setup_required" })
  assert.deepEqual(result.operations, { state: "setup_required" })
})
