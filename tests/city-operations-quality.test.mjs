import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as quality from "../lib/city-operations/quality.ts"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"
import { DirectoryQualityPanel } from "../components/city-operations/quality-panel.tsx"

const { buildDirectoryQuality, safeQualityUrl } = await import("../lib/city-operations/quality.ts")
const now = new Date("2026-09-28T12:00:00Z")
const place = (extra = {}) => ({ id: "place-1", city_id: "city-1", city_slug: "annweiler", city_name: "Annweiler", name: "Café", status: "active", address: "Hauptstraße 1", contact_phone: "06346 123", source_url: "https://example.org/cafe", opening_hours: [{ weekday: 1, closed: false, opens: "09:00", closes: "18:00" }], opening_hours_note: null, last_verified_at: "2026-09-27T12:00:00Z", expires_at: null, ...extra })
const source = (extra = {}) => ({ id: "source-1", city_id: "city-1", city_slug: "annweiler", city_name: "Annweiler", slug: "cafe", owner_name: "Tourismus", url: "https://example.org/cafe", updated_at: "2026-09-21T10:00:00Z", active: true, enabled: true, cadence: "daily", city_mode: "REVIEW_ONLY", parser_config: { cadence_owner: "m1_city_freshness", auto_publish: false, interval_seconds: 259200 }, content_scope: { entity_type: "PLACE", entity_id: "place-1" }, ...extra })
const check = (extra = {}) => ({ id: "check-1", city_id: "city-1", source_id: "source-1", source_revision: "2026-09-21T10:00:00+00:00", source_url: "https://example.org/cafe", checked_at: "2026-09-28T10:00:00Z", window_start: "2026-09-28T00:00:00Z", fetch_status: "available", http_status: 200, comparison: "unchanged", source_sha256: "a".repeat(64), stale_fields: [], unknown_fields: [], review_job_id: null, ...extra })

test("missing directory fields and never-verified records produce actionable editor tasks", () => {
  const result = buildDirectoryQuality([place({ address: "  ", contact_phone: null, source_url: "javascript:alert(1)", opening_hours: [], last_verified_at: null })], [], [], now)
  assert.deepEqual(result.places[0].issues, ["address", "phone", "source", "opening", "never_verified"])
  assert.equal(result.places[0].editorHref, "/city-pages/annweiler/content/places/place-1")
  assert.equal(result.counts.placesNeedingAttention, 1)
  assert.equal(result.counts.missingFields, 4)
})

test("appointment notes and explicit closed days count as information, empty hour objects do not", () => {
  const result = buildDirectoryQuality([
    place({ id: "note", opening_hours: [], opening_hours_note: "Nur nach Terminvereinbarung" }),
    place({ id: "closed", opening_hours: [{ weekday: 1, closed: true }] }),
    place({ id: "empty", opening_hours: [{}] }),
  ], [], [], now)
  assert.equal(result.counts.missingFields, 1)
  assert.deepEqual(result.places.map(row => row.id), ["empty"])
})

test("expired and thirty-day-old verification is stale; future or malformed verification remains unverified", () => {
  const result = buildDirectoryQuality([
    place({ id: "expired", expires_at: "2026-09-28T12:00:00Z" }),
    place({ id: "old", last_verified_at: "2026-08-29T12:00:00Z" }),
    place({ id: "future", last_verified_at: "2026-09-29T12:00:00Z" }),
    place({ id: "bad", last_verified_at: "invalid" }),
    place({ id: "fine", expires_at: "2026-09-29T12:00:00Z" }),
  ], [], [], now)
  assert.deepEqual(result.places.find(row => row.id === "expired").issues, ["stale_verification"])
  assert.deepEqual(result.places.find(row => row.id === "old").issues, ["stale_verification"])
  assert.deepEqual(result.places.find(row => row.id === "future").issues, ["never_verified"])
  assert.deepEqual(result.places.find(row => row.id === "bad").issues, ["never_verified"])
  assert.equal(result.counts.stalePlaces, 2)
  assert.equal(result.counts.unverifiedPlaces, 2)
})

test("receipts from another city, revision, URL, source or future cannot satisfy the current source", () => {
  for (const change of [
    { city_id: "city-2" }, { source_revision: "2026-09-20T10:00:00Z" },
    { source_url: "https://example.org/other" }, { source_id: "source-2" },
    { checked_at: "2026-09-29T12:00:00Z" }, { window_start: "2026-09-25T00:00:00Z" },
  ]) {
    const row = buildDirectoryQuality([], [source()], [check(change)], now).sources[0]
    assert.equal(row.latestCheck, null)
    assert.equal(row.schedule, "due")
    assert.ok(row.issues.includes("missing_check"))
  }
})

test("source revision matching preserves PostgreSQL microseconds", () => {
  const row = buildDirectoryQuality([], [source({ updated_at: "2026-09-21T10:00:00.123457Z" })], [check({ source_revision: "2026-09-21T10:00:00.123456Z" })], now).sources[0]
  assert.equal(row.latestCheck, null)
})

test("latest matching receipt wins deterministically and next due uses the fixed 72-hour window", () => {
  const checks = [check({ id: "older", checked_at: "2026-09-28T09:00:00Z", comparison: "changed" }), check()]
  const result = buildDirectoryQuality([], [source()], checks, now)
  assert.equal(result.sources[0].latestCheck.id, "check-1")
  assert.equal(result.sources[0].schedule, "current")
  assert.equal(result.sources[0].dueAt, "2026-10-01T00:00:00.000Z")
  assert.equal(result.sources[0].owner, "Tourismus")
  assert.equal(result.sources[0].editorHref, "/city-pages/annweiler/content/places/place-1")
  assert.deepEqual(result, buildDirectoryQuality([], [source()], [...checks].reverse(), now))
  const overdue = buildDirectoryQuality([], [source()], [check({ checked_at: "2026-09-26T10:00:00Z", window_start: "2026-09-25T00:00:00Z" })], now).sources[0]
  assert.equal(overdue.schedule, "due")
  assert.equal(overdue.dueAt, "2026-09-28T00:00:00.000Z")
})

test("a receipt persisted just after a window boundary still proves the preceding attempted window", () => {
  const row = buildDirectoryQuality([], [source()], [check({ checked_at: "2026-09-28T00:01:00Z", window_start: "2026-09-25T00:00:00Z" })], now).sources[0]
  assert.equal(row.latestCheck?.id, "check-1")
  assert.equal(row.schedule, "due")
  assert.equal(row.dueAt, "2026-09-28T00:00:00.000Z")
})

test("failed, changed and unchanged-but-unverified receipts retain separate evidence issues", () => {
  const result = buildDirectoryQuality([place({ last_verified_at: null })], [source()], [check({ unknown_fields: ["openingHours"], stale_fields: ["pricing"], review_job_id: "review-1" })], now)
  assert.deepEqual(result.sources[0].issues, ["stale_fields", "unknown_fields"])
  assert.equal(result.counts.unverifiedPlaces, 1)
  assert.equal(result.sources[0].reviewHref, "/automation?city=city-1&status=needs_human")
  assert.equal(result.sources[0].latestCheck.reviewJobId, "review-1")
  const failed = buildDirectoryQuality([], [source()], [check({ fetch_status: "failed", http_status: 503, comparison: "unverified", source_sha256: null, error_code: "source_unavailable" })], now).sources[0]
  assert.ok(failed.issues.includes("source_failed"))
  assert.equal(failed.latestCheck.httpStatus, 503)
  assert.ok(buildDirectoryQuality([], [source()], [check({ comparison: "changed" })], now).sources[0].issues.includes("source_changed"))
})

test("disabled, unknown city control and other owners never masquerade as healthy M1 checks", () => {
  for (const [change, schedule] of [[{ enabled: false }, "disabled"], [{ city_mode: "DISABLED" }, "disabled"], [{ city_mode: null }, "unknown"], [{ parser_config: { visitor_adapter: "museum-v1" } }, "external"], [{ parser_config: { cadence_owner: "m1_city_freshness", auto_publish: true, interval_seconds: 259200 } }, "excluded"]]) {
    const row = buildDirectoryQuality([], [source(change)], [check()], now).sources[0]
    assert.equal(row.schedule, schedule)
    assert.equal(row.dueAt, null)
  }
})

test("disabled external sources remain visibly disabled", () => {
  const row = buildDirectoryQuality([], [source({ enabled: false, parser_config: { visitor_adapter: "museum-v1" } })], [], now).sources[0]
  assert.equal(row.schedule, "disabled")
})

test("external links permit only credential-free http(s), and local path values remain encoded", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "//example.org", "https://user:secret@example.org", "invalid", ""]) assert.equal(safeQualityUrl(url), null)
  assert.equal(safeQualityUrl(" http://example.org/path "), "http://example.org/path")
  const row = buildDirectoryQuality([place({ city_slug: "a/b", id: "x?y", address: null })], [], [], now).places[0]
  assert.equal(row.editorHref, "/city-pages/a%2Fb/content/places/x%3Fy")
})

test("bounded output preserves full counts and signals omitted tasks", () => {
  const rows = Array.from({ length: 45 }, (_, i) => place({ id: String(i).padStart(2, "0"), address: null }))
  const result = buildDirectoryQuality(rows, [], [], now)
  assert.equal(result.places.length, 30)
  assert.equal(result.omittedPlaces, 15)
  assert.equal(result.counts.placesNeedingAttention, 45)
  assert.deepEqual(result, buildDirectoryQuality([...rows].reverse(), [], [], now))
})

test("directory due date keeps the thirty-day review deadline when no explicit expiry exists", () => {
  const result = buildDirectoryQuality([place({ address: null })], [], [], now)
  assert.equal(result.places[0].dueAt, "2026-10-27T12:00:00.000Z")
})

test("a future expiry cannot defer an entry with no verified date", () => {
  const row = buildDirectoryQuality([place({ last_verified_at: null, expires_at: "2026-12-01T00:00:00Z" })], [], [], now).places[0]
  assert.equal(row.dueAt, null)
})

function loaderFixture(options = {}) {
  const calls = []
  const tables = {
    cities: [{ id: "city-1", slug: "annweiler", name: "Annweiler" }, { id: "city-2", slug: "landau", name: "Landau" }],
    city_places: [place()], city_agent_sources: [source()], city_source_freshness_checks: [check()],
    city_agent_city_controls: [{ city_id: "city-1", operating_mode: "REVIEW_ONLY" }],
    ...options.tables,
  }
  const client = { from(table) {
    calls.push(["from", table])
    let rows = [...(tables[table] ?? [])]
    let from = 0, to = 249
    const query = {
      select() { return query }, order() { return query },
      in(key, values) { calls.push(["in", table, key, values]); rows = rows.filter(row => values.includes(row[key])); return query },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return query },
      range(start, end) { calls.push(["range", table, start, end]); from = start; to = end; return query },
      abortSignal() { return query },
      then(resolve, reject) {
        if (options.failTable === table) return Promise.resolve({ data: null, count: null, error: { message: "private database details" } }).then(resolve, reject)
        // Simulate a server cap smaller than the requested page.
        return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + (options.serverCap ?? 250))), count: rows.length, error: null }).then(resolve, reject)
      },
    }
    return query
  } }
  const dependencies = {
    "server-only": {},
    "../admin": { requireAdmin: async () => { calls.push(["auth"]); if (options.denied) throw new Error("denied") } },
    "../supabase/admin": { createAdminClient: () => { calls.push(["service"]); return client } },
    "./quality": quality,
  }
  const compiled = ts.transpileModule(readFileSync(new URL("../lib/city-operations/quality-data.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`)
    return dependencies[name]
  }, loaded, loaded.exports)
  return { calls, run: filters => loaded.exports.loadDirectoryQuality(filters, now) }
}

test("quality loader denies access before creating the privileged client or reading tables", async () => {
  const fixture = loaderFixture({ denied: true })
  await assert.rejects(fixture.run({}), /denied/)
  assert.deepEqual(fixture.calls, [["auth"]])
})

test("city slugs resolve to IDs and combine with region filters before loading quality records", async () => {
  const fixture = loaderFixture({ tables: { city_places: [place(), place({ id: "other", city_id: "city-2" })] } })
  const result = await fixture.run({ city: "annweiler" })
  assert.equal(result.quality.counts.totalPlaces, 1)
  assert.equal(result.scopeLabel, "Annweiler")
  assert.deepEqual(fixture.calls.slice(0, 2), [["auth"], ["service"]])
  assert.ok(fixture.calls.some(call => call[0] === "in" && call[1] === "city_places" && call[2] === "city_id" && call[3].join() === "city-1"))
  const empty = await loaderFixture().run({ city: "annweiler", regionCityIds: new Set(["city-2"]) })
  assert.equal(empty.quality.counts.totalPlaces, 0)
  assert.equal(empty.scopeLabel, "Keine passenden Orte")
})

test("loader paginates even when the server page cap is smaller than requested", async () => {
  const fixture = loaderFixture({ serverCap: 100, tables: { city_places: Array.from({ length: 501 }, (_, i) => place({ id: String(i) })) } })
  const result = await fixture.run({ city: "annweiler" })
  assert.equal(result.quality.counts.totalPlaces, 501)
  assert.equal(result.coverage, "ready")
  assert.equal(result.warnings.length, 0)
})

test("bounded database reads expose truncation and load failures without raw error details", async () => {
  const fixture = loaderFixture({ tables: { city_places: Array.from({ length: 2001 }, (_, i) => place({ id: String(i) })) } })
  const result = await fixture.run({ city: "annweiler" })
  assert.equal(result.quality.counts.totalPlaces, 2000)
  assert.equal(result.coverage, "partial")
  assert.ok(result.warnings.some(warning => warning.includes("2000") && warning.includes("2001")))
  const failed = await loaderFixture({ failTable: "city_source_freshness_checks" }).run({ city: "annweiler" })
  assert.equal(failed.coverage, "partial")
  assert.equal(failed.checksAvailable, false)
  assert.ok(failed.warnings.length > 0)
  assert.doesNotMatch(JSON.stringify(failed), /private database details/)
})

test("rendered panel stays collapsed, labels incomplete evidence, and only links existing review/editor flows", async () => {
  const data = await loaderFixture({ failTable: "city_source_freshness_checks", tables: { city_places: [place({ contact_phone: null, source_url: "javascript:alert(1)" })] } }).run({ city: "annweiler" })
  const dom = new JSDOM(renderToStaticMarkup(createElement(DirectoryQualityPanel, { data }))).window.document
  assert.equal(dom.querySelector("details").hasAttribute("open"), false)
  assert.match(dom.querySelector("summary").textContent, /Unvollständige Auswertung/)
  assert.match(dom.body.textContent, /keine Feldangaben/)
  assert.ok(dom.querySelector('a[href="/city-pages/annweiler/content/places/place-1"]'))
  assert.ok(dom.querySelector('a[href="/automation?city=city-1&status=needs_human"]'))
  assert.equal(dom.querySelector('a[href^="javascript:"]'), null)
  assert.equal(dom.querySelector("button,form"), null)
  assert.match(dom.querySelector('[aria-label="Verzeichniseinträge mit Prüfbedarf"]').textContent, /Telefon fehlt/)
})
