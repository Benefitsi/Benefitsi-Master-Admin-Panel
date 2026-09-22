export const city = { id: "b9e684e4-54b3-41ff-8f97-4426423893c2", slug: "annweiler", name: "Annweiler" }
export const filters = { dateFrom: "2026-09-01", dateTo: "2026-09-22", compareFrom: "2026-08-10", compareTo: "2026-08-31", cityId: city.id, partnerId: null, channel: null, planCode: null, environment: "production", timezone: "Europe/Berlin", currency: "EUR" }
export const scope = { city, dateFrom: filters.dateFrom, dateTo: filters.dateTo, from: "2026-08-31T22:00:00.000Z", until: "2026-09-22T22:00:00.000Z", environment: "production", checkedAt: "2026-09-22T11:00:00.000Z" }

export function conversionFixture() {
  return {
    city: "annweiler", from: scope.from, until_exclusive: scope.until, environment: "production",
    backend_consented: { visit_confirmed: 2, redemption_confirmed: 1 },
    partner_requests: { submitted: 3, qualified: 1, basis: "operational contact requests; no analytics-consent denominator" },
    web_observations: {
      source: "analytics.reportable_product_event_facts_v1", event_count: 7, observed_actors: 3, coverage: "observed_subset",
      first_observed_at: "2026-09-01T10:00:00Z", last_observed_at: "2026-09-22T10:00:00Z",
      denominators: { city_page_view_events: 3, city_page_view_actors: 2, partner_form_view_events: 1, partner_form_view_actors: 1 },
      stages: { city_page_views: { events: 3, observed_actors: 2 }, app_entry_clicks: { events: 1, observed_actors: 1 } },
      channels: { organic_search: { events: 4, observed_actors: 2 }, unknown: { events: 3, observed_actors: 1 } },
      provider_delivery: { delivered: 5, pending: 1, failed: 1 },
      measurement_basis: "Consented observations only; pseudonymous actors are not unique people, sessions, accounts or installations.",
    },
    errors: { web_provider_delivery_failed: 1, gateway_rejections: null, handoff: null },
    confirmed_accounts_city_attribution: null, installed_app_attribution: null, conversion_rate: null,
    limitations: ["Web observations are a consented subset."],
  }
}

export function operationsFixture() {
  return {
    schema_version: 1, city_slug: "annweiler", environment: "production", from: scope.from, until_exclusive: scope.until,
    generated_at: "2026-09-22T11:00:00Z", last_observed_at: "2026-09-22T10:00:00Z", coverage: "observed_subset",
    vitals: [{ metric: "LCP", device: "mobile", route_kind: "city_home", sample_count: 120, p75: 2700, last_observed_at: "2026-09-22T10:00:00Z" }],
    errors: [{ error_kind: "client_error", error_code: "client_exception", route_kind: "city_home", count: 2, last_observed_at: "2026-09-22T10:00:00Z" }],
    alerts: [{ key: "web:lcp", severity: "warning", state: "open", title: "Ladezeit prüfen", observed_value: 2700, threshold: 2500, sample_count: 120, last_observed_at: "2026-09-22T10:00:00Z" }],
    limitations: ["Einwilligungsgebundene technische Beobachtungen."],
  }
}

export function emptyOperationsFixture() {
  return { ...operationsFixture(), coverage: "no_observations", last_observed_at: null, vitals: [], errors: [], alerts: [] }
}
