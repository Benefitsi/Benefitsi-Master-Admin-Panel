import assert from "node:assert/strict"
import test from "node:test"
import {
  parseBusinessAnalyticsFilters,
  toBusinessAnalyticsRpcFilters,
} from "../lib/analytics/filters.ts"

test("defaults to 30 fully comparable Berlin calendar days in production", () => {
  const filters = parseBusinessAnalyticsFilters(
    {},
    new Date("2026-07-17T12:00:00.000Z"),
  )

  assert.deepEqual(filters, {
    dateFrom: "2026-06-18",
    dateTo: "2026-07-17",
    compareFrom: "2026-05-19",
    compareTo: "2026-06-17",
    cityId: null,
    partnerId: null,
    channel: null,
    planCode: null,
    environment: "production",
    timezone: "Europe/Berlin",
    currency: "EUR",
  })
})

test("sanitizes filters, bounds the period and keeps environments separated", () => {
  const filters = parseBusinessAnalyticsFilters(
    {
      from: "2020-01-01",
      to: "2026-07-10",
      city: ["  11111111-1111-4111-8111-111111111111  ", "ignored"],
      partner: "22222222-2222-4222-8222-222222222222",
      channel: "paid_search",
      plan: "premium_yearly",
      environment: "staging",
    },
    new Date("2026-07-17T12:00:00.000Z"),
  )

  assert.equal(filters.dateFrom, "2025-07-10")
  assert.equal(filters.dateTo, "2026-07-10")
  assert.equal(filters.cityId, "11111111-1111-4111-8111-111111111111")
  assert.equal(filters.partnerId, "22222222-2222-4222-8222-222222222222")
  assert.equal(filters.channel, "paid_search")
  assert.equal(filters.planCode, "premium_yearly")
  assert.equal(filters.environment, "staging")
  assert.equal(filters.compareTo, "2025-07-09")
})

test("rejects invalid or future dates and serializes the RPC contract", () => {
  const filters = parseBusinessAnalyticsFilters(
    {
      from: "not-a-date",
      to: "2030-01-01",
      city: "not-a-uuid",
      partner: "not-a-uuid",
      channel: "google_ads",
      plan: "unsafe plan",
      environment: "unknown",
    },
    new Date("2026-07-17T12:00:00.000Z"),
  )
  const rpc = toBusinessAnalyticsRpcFilters(filters)

  assert.equal(filters.dateFrom, "2026-06-18")
  assert.equal(filters.dateTo, "2026-07-17")
  assert.equal(filters.environment, "production")
  assert.deepEqual(rpc, {
    date_from: "2026-06-18",
    date_to: "2026-07-17",
    compare_from: "2026-05-19",
    compare_to: "2026-06-17",
    city_id: null,
    partner_id: null,
    channel: null,
    plan_code: null,
    environment: "production",
    timezone: "Europe/Berlin",
    currency: "EUR",
  })
})
