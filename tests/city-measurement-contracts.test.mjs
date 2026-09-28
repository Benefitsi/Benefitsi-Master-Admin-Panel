import assert from "node:assert/strict"
import test from "node:test"
import { cityMeasurementWindow, cityMeasurementHref } from "../lib/analytics/city-measurement-filters.ts"
import { normalizeCityConversion, normalizeCityWebOperations, cityVitalAssessment } from "../lib/analytics/city-measurement-normalize.ts"
import { city, filters, scope, conversionFixture, operationsFixture, emptyOperationsFixture } from "./helpers/city-measurement-fixtures.mjs"

test("city calendar windows include both Berlin DST changes without dropping the last hour", () => {
  for (const [date, from, until] of [
    ["2026-03-29", "2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"],
    ["2026-10-25", "2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"],
  ]) assert.deepEqual(cityMeasurementWindow({ ...filters, dateFrom: date, dateTo: date }), { state: "ready", from, until })
})

test("unsupported dimensions and long or invalid city periods never silently widen scope", () => {
  assert.equal(cityMeasurementWindow({ ...filters, dateFrom: "2026-01-01", dateTo: "2026-04-01" }).state, "window_too_long")
  for (const change of [{ partnerId: city.id }, { channel: "organic_search" }, { planCode: "premium" }]) {
    assert.equal(cityMeasurementWindow({ ...filters, ...change }).state, "unsupported_filters")
  }
  for (const change of [{ dateFrom: "2026-02-30" }, { dateFrom: "2026-10-01" }, { environment: "preview" }, { timezone: "UTC" }]) {
    assert.equal(cityMeasurementWindow({ ...filters, ...change }).state, "invalid_window")
  }
})

test("city reset links retain selected city and environment but remove unsupported dimensions", () => {
  assert.equal(cityMeasurementHref({ ...filters, partnerId: city.id }, city.id, true), `/analytics?city=${city.id}&environment=production#city-measurement`)
})

test("conversion projection retains measured facts without manufacturing account or installation metrics", () => {
  const input = conversionFixture()
  input.actor_hash = "private-marker"
  input.web_observations.email = "private@example.test"
  const result = normalizeCityConversion(input, scope)
  assert.equal(result.web.cityViews, 3)
  assert.equal(result.web.cityActors, 2)
  assert.equal(result.partnerRequests.submitted, 3)
  assert.equal(result.confirmedVisits, 2)
  assert.equal(result.confirmedRedemptions, 1)
  assert.equal(result.web.providerDelivery.failed, 1)
  assert.equal(JSON.stringify(result).includes("private"), false)
  assert.equal(Object.hasOwn(result, "conversionRate"), false)
})

test("successful empty conversion source yields exact observed zeros and explicit no-observations coverage", () => {
  const input = conversionFixture()
  input.backend_consented = {}
  input.partner_requests = { submitted: 0, qualified: 0 }
  input.web_observations = { ...input.web_observations, event_count: 0, observed_actors: 0, coverage: "no_observations", first_observed_at: null, last_observed_at: null, denominators: { city_page_view_events: 0, city_page_view_actors: 0, partner_form_view_events: 0, partner_form_view_actors: 0 }, stages: {}, channels: {}, provider_delivery: { delivered: 0, pending: 0, failed: 0 } }
  const result = normalizeCityConversion(input, scope)
  assert.equal(result.web.cityViews, 0)
  assert.equal(result.web.coverage, "no_observations")
  assert.equal(result.confirmedVisits, 0)
  assert.equal(result.partnerRequests.qualified, 0)
})

test("missing web measurement remains null even when operational requests are measured", () => {
  const input = conversionFixture()
  input.web_observations = null
  assert.equal(normalizeCityConversion(input, scope).web, null)
  assert.equal(normalizeCityConversion(input, scope).partnerRequests.submitted, 3)
})

test("wrong city, environment, period, malformed counts and false provider totals fail closed", () => {
  for (const change of [{ city: "landau" }, { environment: "test" }, { from: "2026-09-01T00:00:00Z" }]) {
    assert.throws(() => normalizeCityConversion({ ...conversionFixture(), ...change }, scope))
  }
  for (const bad of [null, "3", -1, NaN, Infinity]) {
    const input = conversionFixture()
    input.partner_requests.submitted = bad
    assert.throws(() => normalizeCityConversion(input, scope))
  }
  const input = conversionFixture()
  input.web_observations.provider_delivery.delivered = 99
  assert.throws(() => normalizeCityConversion(input, scope))
})

test("operations retains grouped p75, errors and fixed alerts but strips extra fields", () => {
  const input = operationsFixture()
  input.errors[0].stack = "private@example.test"
  input.user_id = "private-marker"
  const result = normalizeCityWebOperations(input, scope)
  assert.deepEqual(result.vitals[0], { metric: "LCP", device: "mobile", routeKind: "city_home", sampleCount: 120, p75: 2700, lastObservedAt: "2026-09-22T10:00:00.000Z" })
  assert.equal(result.errors[0].count, 2)
  assert.equal(result.alerts[0].state, "open")
  assert.equal(JSON.stringify(result).includes("private"), false)
})

test("empty telemetry is not a healthy measurement and malformed or personal technical fields fail closed", () => {
  assert.equal(normalizeCityWebOperations(emptyOperationsFixture(), scope).coverage, "no_observations")
  for (const mutate of [
    input => { input.schema_version = 2 },
    input => { input.city_slug = "landau" },
    input => { input.vitals[0].sample_count = -1 },
    input => { input.vitals[0].p75 = Infinity },
    input => { input.vitals[0].route_kind = "/stadt/annweiler?token=secret" },
    input => { input.errors[0].error_code = "user@example.test" },
    input => { input.alerts[0].title = "Konto user@example.test" },
  ]) {
    const input = operationsFixture(); mutate(input)
    assert.throws(() => normalizeCityWebOperations(input, scope))
  }
})

test("core-vital judgement needs a sample and does not treat diagnostic timings as CWV passing", () => {
  const metric = { metric: "LCP", sampleCount: 100, p75: 2500 }
  assert.equal(cityVitalAssessment(metric), "good")
  assert.equal(cityVitalAssessment({ ...metric, p75: 2501 }), "attention")
  assert.equal(cityVitalAssessment({ ...metric, sampleCount: 99 }), "provisional")
  assert.equal(cityVitalAssessment({ ...metric, sampleCount: 0, p75: null }), "unknown")
  assert.equal(cityVitalAssessment({ ...metric, metric: "INP", p75: 201 }), "attention")
  assert.equal(cityVitalAssessment({ ...metric, metric: "CLS", p75: 0.1 }), "good")
  assert.equal(cityVitalAssessment({ ...metric, metric: "TTFB" }), "measured")
  assert.equal(cityVitalAssessment({ ...metric, metric: "FCP" }), "measured")
})

test("the complete version-one database grouping fits within the protected response bounds", () => {
  const input = operationsFixture()
  const routes = ["city_home", "city_guides", "city_guide", "city_places", "city_place", "city_events", "city_event", "city_meetups", "city_meetup", "city_stays", "city_stay", "city_memories", "city_downloads", "city_newsletter", "city_businesses", "city_magazine", "city_article", "city_service", "city_other", "partner", "marketing", "api_public"]
  input.vitals = routes.flatMap(route_kind => ["mobile", "desktop", "unknown"].flatMap(device => ["LCP", "INP", "CLS", "TTFB", "FCP"].map(metric => ({ ...input.vitals[0], route_kind, device, metric, p75: metric === "CLS" ? 0.2 : 2700 }))))
  input.errors = routes.flatMap(route_kind => ["client_error", "unhandled_rejection", "server_error"].flatMap(error_kind => ["client_exception", "promise_rejected", "boundary_failed", "render_failed", "route_failed", "action_failed", "proxy_failed"].map(error_code => ({ ...input.errors[0], route_kind, error_kind, error_code }))))
  input.alerts = [...Array.from({ length: 100 }, (_, index) => ({ ...input.alerts[0], key: `production:annweiler:city_home:client_error:${index}` })), ...input.vitals.map(row => ({ ...input.alerts[0], key: `vital:${row.metric}:${row.device}:${row.route_kind}` }))]
  const result = normalizeCityWebOperations(input, scope)
  assert.equal(result.vitals.length, 330)
  assert.equal(result.errors.length, 462)
  assert.equal(result.alerts.length, 430)
})

test("technical routes and error codes must be fixed categories, including innocuous-looking unknown tokens", () => {
  for (const mutate of [
    input => { input.vitals[0].route_kind = "profile_name" },
    input => { input.errors[0].route_kind = "account_123" },
    input => { input.errors[0].error_code = "TypeError" },
  ]) {
    const input = operationsFixture(); mutate(input)
    assert.throws(() => normalizeCityWebOperations(input, scope))
  }
})
