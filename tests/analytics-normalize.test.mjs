import assert from "node:assert/strict"
import test from "node:test"
import { parseBusinessAnalyticsFilters } from "../lib/analytics/filters.ts"
import {
  AnalyticsPayloadContractError,
  formatAnalyticsValue,
  normalizeBusinessAnalyticsPayload,
  redactFinanceData,
} from "../lib/analytics/normalize.ts"
import { parseAnalyticsPermissions } from "../lib/analytics/permissions.ts"

const filters = parseBusinessAnalyticsFilters(
  {},
  new Date("2026-07-17T12:00:00.000Z"),
)

test("permissions never fall back to is_admin and accept the RPC DTO variants", () => {
  assert.deepEqual(parseAnalyticsPermissions({ is_admin: true }), {
    businessAnalyticsRead: false,
    financeRead: false,
  })
  assert.deepEqual(
    parseAnalyticsPermissions([
      { business_analytics_read: true, finance_read: false },
    ]),
    { businessAnalyticsRead: true, financeRead: false },
  )
  assert.deepEqual(
    parseAnalyticsPermissions({
      permissions: { "business_analytics:read": true, "finance:read": true },
    }),
    { businessAnalyticsRead: true, financeRead: true },
  )
})

test("normalizes a source payload into the PII-free dashboard DTO", () => {
  const payload = normalizeBusinessAnalyticsPayload(
    {
      payload: {
        schema_version: 1,
        generated_at: "2026-07-17T10:30:00.000Z",
        status: "ready",
        email: "must-not-leak@example.com",
        freshness: {
          status: "fresh",
          as_of: "2026-07-17T10:25:00.000Z",
          sources: [
            {
              key: "visits",
              label: "Bestätigte Visits",
              status: "fresh",
              as_of: "2026-07-17T10:25:00.000Z",
              expected_within_minutes: 5,
              sensitivity: "business",
            },
          ],
        },
        sections: {
          overview: {
            kpis: [
              {
                key: "value_active_users_30d",
                label: "30d Value-Active Users",
                value: 0,
                unit: "count",
                definition: "Produktionsnutzer mit bestätigtem Visit oder Redemption.",
                source: "analytics.metric_snapshots",
                quality: "verified",
                availability: "available",
                sensitivity: "business",
              },
              {
                key: "contribution_margin_ii",
                label: "Contribution Margin II",
                value: 123.45,
                unit: "currency_eur",
                definition: "Deckungsbeitrag nach variablen Kosten.",
                source: "analytics.metric_snapshots",
                quality: "verified",
                sensitivity: "finance",
              },
            ],
          },
          revenue_profit: {
            kpis: [
              {
                key: "mrr",
                label: "MRR",
                value: 50,
                unit: "currency_eur",
                definition: "Monatlich wiederkehrender Umsatz.",
                source: "billing ledger",
                quality: "verified",
                sensitivity: "finance",
              },
            ],
          },
        },
      },
    },
    filters,
  )

  assert.equal(payload.status, "ready")
  assert.equal(payload.sections.overview.kpis[0].value, 0)
  assert.equal(
    payload.sections.overview.kpis[0].formattedValue,
    null,
  )
  assert.equal("email" in payload, false)
  assert.equal(payload.freshness.sources[0].expectedWithinMinutes, 5)
  assert.equal(formatAnalyticsValue(0, "count"), "0")
  assert.equal(formatAnalyticsValue(17.4, "score"), "17,4 / 100")
})

test("normalizes the NES shadow section without accepting person-level fields", () => {
  const payload = normalizeBusinessAnalyticsPayload(
    {
      schemaVersion: "1",
      generatedAt: "2026-07-29T20:30:00.000Z",
      status: "partial",
      user_id: "must-not-cross-the-dashboard-contract",
      sections: {
        engagement: {
          kpis: [
            {
              key: "nes_average_score",
              label: "Durchschnittlicher NES",
              value: 42.5,
              unit: "count",
              definition: "Versionierter Score von 0 bis 100.",
              source: "analytics.nes_user_scores",
              quality: "provisional",
              availability: "provisional",
              sensitivity: "business",
            },
          ],
          tables: [
            {
              key: "nes_segment_distribution",
              title: "Engagement-Verteilung",
              columns: [
                { key: "users", label: "Nutzer", unit: "count" },
                { key: "share", label: "Anteil", unit: "percent" },
              ],
              rows: [
                {
                  id: "active",
                  label: "Aktiv",
                  values: { users: 3, share: 60 },
                  quality: "provisional",
                  email: "must-not-leak@example.com",
                },
              ],
              source: "analytics.nes_user_scores",
              quality: "provisional",
              sensitivity: "business",
            },
          ],
          caveats: ["Shadow Mode: keine automatische Ansprache."],
        },
      },
      filterOptions: {
        cities: [{ id: "city-1", label: "Annweiler" }],
      },
    },
    filters,
  )

  assert.equal(payload.sections.engagement.kpis[0].value, 42.5)
  assert.equal(payload.sections.engagement.tables[0].rows[0].label, "Aktiv")
  assert.deepEqual(payload.sections.engagement.tables[0].rows[0].values, {
    users: 3,
    share: 60,
  })
  assert.equal("user_id" in payload, false)
  assert.equal(
    "email" in payload.sections.engagement.tables[0].rows[0],
    false,
  )
  assert.deepEqual(payload.filterOptions.cities, [
    { id: "city-1", label: "Annweiler" },
  ])
})

test("redacts every finance-sensitive surface for business-only readers", () => {
  const normalized = normalizeBusinessAnalyticsPayload(
    {
      schema_version: 1,
      generated_at: "2026-07-17T10:30:00.000Z",
      status: "ready",
      freshness: {
        status: "fresh",
        sources: [
          {
            key: "visits",
            label: "Bestätigte Visits",
            status: "fresh",
            sensitivity: "business",
          },
          {
            key: "stripe",
            label: "Stripe 12.345 EUR Abweichung",
            status: "fresh",
            sensitivity: "finance",
          },
        ],
      },
      caveats: ["Finanzabweichung 12.345 EUR"],
      sections: {
        overview: {
          caveats: ["Stripe-Abweichung 12.345 EUR"],
          kpis: [
            {
              key: "users",
              label: "Nutzer",
              value: 10,
              definition: "Nutzer",
              source: "snapshot",
              quality: "verified",
              sensitivity: "business",
            },
            {
              key: "profit",
              label: "Profit",
              value: 20,
              definition: "Profit",
              source: "snapshot",
              quality: "verified",
              sensitivity: "finance",
            },
          ],
        },
        revenueProfit: {
          kpis: [
            {
              key: "mrr",
              label: "MRR",
              value: 30,
              definition: "MRR",
              source: "snapshot",
              quality: "verified",
              sensitivity: "finance",
            },
          ],
        },
      },
    },
    filters,
  )
  const redacted = redactFinanceData(normalized)

  assert.deepEqual(
    redacted.sections.overview.kpis.map((metric) => metric.key),
    ["users"],
  )
  assert.equal(redacted.sections.revenueProfit.kpis.length, 0)
  assert.deepEqual(redacted.caveats, [])
  assert.deepEqual(redacted.sections.overview.caveats, [])
  assert.deepEqual(
    redacted.freshness.sources.map((source) => source.key),
    ["visits"],
  )
})

test("invalid payload contracts fail closed and missing values are never formatted as zero", () => {
  assert.throws(
    () => normalizeBusinessAnalyticsPayload(null, filters),
    AnalyticsPayloadContractError,
  )
  assert.throws(
    () =>
      normalizeBusinessAnalyticsPayload(
        { schema_version: 999, generated_at: new Date().toISOString() },
        filters,
      ),
    AnalyticsPayloadContractError,
  )
  assert.throws(
    () => normalizeBusinessAnalyticsPayload({ schema_version: 1 }, filters),
    AnalyticsPayloadContractError,
  )
  assert.equal(formatAnalyticsValue(null, "count"), "Noch nicht messbar")
  assert.equal(
    formatAnalyticsValue(null, "currency_eur", "999,00 €"),
    "Noch nicht messbar",
  )
})

test("unknown sensitivity fails closed for business-only readers", () => {
  const normalized = normalizeBusinessAnalyticsPayload(
    {
      schema_version: 1,
      generated_at: "2026-07-17T10:30:00.000Z",
      status: "ready",
      sections: {
        overview: {
          kpis: [
            {
              key: "unclassified_metric",
              label: "Unklassifizierte Kennzahl",
              value: 42,
              definition: "Absichtlich ohne Sensitivity.",
              source: "snapshot",
              quality: "verified",
            },
          ],
        },
      },
    },
    filters,
  )

  assert.equal(normalized.sections.overview.kpis[0].sensitivity, "finance")
  assert.equal(redactFinanceData(normalized).sections.overview.kpis.length, 0)
})

test("freshness uses the worst status and provisional availability cannot look verified", () => {
  const normalized = normalizeBusinessAnalyticsPayload(
    {
      schema_version: 1,
      generated_at: "2026-07-17T10:30:00.000Z",
      status: "ready",
      freshness: {
        status: "fresh",
        sources: [
          {
            key: "visits",
            label: "Visits",
            status: "stale",
            sensitivity: "business",
          },
        ],
      },
      sections: {
        retention: {
          kpis: [
            {
              key: "predictive_clv",
              label: "Predictive CLV",
              value: 120,
              availability: "provisional",
              quality: "verified",
              sensitivity: "finance",
            },
          ],
        },
      },
    },
    filters,
  )

  assert.equal(normalized.freshness.status, "stale")
  assert.equal(normalized.sections.retention.kpis[0].quality, "provisional")
  assert.equal(normalized.sections.retention.kpis[0].unit, "text")
})
