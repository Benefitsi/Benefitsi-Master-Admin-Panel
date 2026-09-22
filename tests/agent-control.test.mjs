import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentOverview } from "../app/agents/agent-overview.tsx"
import { cityDisplayName, normalizeRuntimeSnapshot } from "../lib/agent-control.ts"

const observedAt = "2026-09-21T10:00:00.000Z"
const now = new Date("2026-09-21T10:30:00.000Z")

function validSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    hostId: "m1-benefitsi",
    observedAt,
    collectorVersion: "1.0.0",
    profiles: [{
      id: "city-annweiler",
      scope: "benefitsi",
      purpose: "Reviewed city operations",
      provider: "minimax",
      model: "MiniMax-M3.0",
      citySlug: "annweiler",
      automation: "scheduled",
      contextFiles: [{
        path: "MEMORY.md", exists: true, chars: 2300, limit: 2200,
        sha256: "a".repeat(64), modifiedAt: "2026-09-20T10:00:00Z", loadedBy: "system",
        injected: "must be discarded",
      }],
      schedules: [{
        id: "city-daily", source: "launchd", enabled: true,
        cadence: "daily 06:35 Europe/Berlin", lastRunAt: "2026-09-21T04:35:00Z",
        lastStatus: "editorial_pending", secret: "must be discarded",
      }],
      prompt: "must be discarded",
    }],
    credential: "must be discarded",
    ...overrides,
  }
}

test("normalizes only the v1 allowlist and reports context limits separately", () => {
  const result = normalizeRuntimeSnapshot(validSnapshot(), now)
  assert.equal(result.state, "fresh")
  assert.equal(result.snapshot?.profiles[0].contextHealth, "over_limit")
  assert.equal(result.snapshot?.profiles[0].runtimeHealth, "unknown")
  assert.equal(JSON.stringify(result).includes("must be discarded"), false)
  assert.deepEqual(Object.keys(result.snapshot.profiles[0].contextFiles[0]), [
    "path", "exists", "chars", "limit", "sha256", "modifiedAt", "loadedBy",
  ])
})

test("marks an otherwise valid observation stale after 90 minutes", () => {
  const result = normalizeRuntimeSnapshot(validSnapshot(), new Date("2026-09-21T11:30:01Z"))
  assert.equal(result.state, "stale")
  assert.ok(result.snapshot)
})

test("rejects unsupported, oversized, future, malformed and over-limit snapshots", () => {
  const invalid = [
    validSnapshot({ schemaVersion: 2 }),
    validSnapshot({ observedAt: "2026-09-21T10:35:01Z" }),
    validSnapshot({ observedAt: "not-a-date" }),
    validSnapshot({ profiles: Array.from({ length: 65 }, (_, id) => ({ ...validSnapshot().profiles[0], id: `p-${id}` })) }),
    validSnapshot({ profiles: [{ ...validSnapshot().profiles[0], contextFiles: Array(17).fill(validSnapshot().profiles[0].contextFiles[0]) }] }),
    validSnapshot({ profiles: [{ ...validSnapshot().profiles[0], schedules: Array(17).fill(validSnapshot().profiles[0].schedules[0]) }] }),
    validSnapshot({ profiles: [{ ...validSnapshot().profiles[0], contextFiles: [{ ...validSnapshot().profiles[0].contextFiles[0], path: "/Users/name/private.md" }] }] }),
    validSnapshot({ profiles: [{ ...validSnapshot().profiles[0], purpose: "x".repeat(132_000) }] }),
  ]
  for (const input of invalid) assert.deepEqual(normalizeRuntimeSnapshot(input, now), { state: "invalid", snapshot: null })
})

test("missing profiles and implausible fields cannot create a positive runtime state", () => {
  assert.deepEqual(normalizeRuntimeSnapshot(validSnapshot({ profiles: undefined }), now), { state: "invalid", snapshot: null })
  assert.deepEqual(normalizeRuntimeSnapshot(validSnapshot({ profiles: [{ ...validSnapshot().profiles[0], automation: "running" }] }), now), { state: "invalid", snapshot: null })
})

test("optional observed context files do not turn the profile into a false warning", () => {
  const profile = validSnapshot().profiles[0]
  const result = normalizeRuntimeSnapshot(validSnapshot({ profiles: [{
    ...profile,
    contextFiles: [{ path: "MEMORY.md", exists: false, chars: null, limit: null, sha256: null, modifiedAt: null, loadedBy: "reference" }],
  }] }), now)
  assert.equal(result.snapshot?.profiles[0].contextHealth, "ok")
})

test("runtime health requires a recent, plausible timestamp for a successful status", () => {
  const schedule = validSnapshot().profiles[0].schedules[0]
  const cases = [
    { lastRunAt: null, want: "unknown" },
    { lastRunAt: "2026-09-19T10:29:59Z", want: "unknown" },
    { lastRunAt: "2026-09-21T10:35:01Z", want: "unknown" },
    { lastRunAt: "2026-09-21T10:25:00+00:00", want: "ok" },
  ]
  for (const { lastRunAt, want } of cases) {
    const result = normalizeRuntimeSnapshot(validSnapshot({ profiles: [{
      ...validSnapshot().profiles[0],
      schedules: [{ ...schedule, lastRunAt, lastStatus: "ok" }],
    }] }), now)
    assert.equal(result.snapshot?.profiles[0].runtimeHealth, want)
  }
})

test("contract dates require a full ISO timestamp with timezone and a real calendar date", () => {
  const profile = validSnapshot().profiles[0]
  for (const invalidDate of ["2026-09-21", "2026-09-21T10:00:00", "2026-02-30T10:00:00Z"]) {
    const snapshotDate = normalizeRuntimeSnapshot(validSnapshot({ observedAt: invalidDate }), now)
    assert.equal(snapshotDate.state, "invalid")
    const scheduleDate = normalizeRuntimeSnapshot(validSnapshot({ profiles: [{
      ...profile, schedules: [{ ...profile.schedules[0], lastRunAt: invalidDate }],
    }] }), now)
    assert.equal(scheduleDate.state, "invalid")
  }
})

test("duplicate profile, schedule, and context identities are rejected", () => {
  const profile = validSnapshot().profiles[0]
  const duplicateCases = [
    validSnapshot({ profiles: [profile, { ...profile }] }),
    validSnapshot({ profiles: [{ ...profile, schedules: [profile.schedules[0], { ...profile.schedules[0] }] }] }),
    validSnapshot({ profiles: [{ ...profile, contextFiles: [profile.contextFiles[0], { ...profile.contextFiles[0] }] }] }),
  ]
  for (const input of duplicateCases) {
    assert.deepEqual(normalizeRuntimeSnapshot(input, now), { state: "invalid", snapshot: null })
  }
})

test("unknown city ids stay explicit instead of inheriting Annweiler's name", () => {
  assert.equal(cityDisplayName("b9e684e4-54b3-41ff-8f97-4426423893c2"), "Annweiler am Trifels")
  assert.equal(cityDisplayName("another-city"), null)
})

test("overview explains evidence boundaries and renders no start or publish action", () => {
  const runtime = normalizeRuntimeSnapshot(validSnapshot(), now)
  const html = renderToStaticMarkup(createElement(AgentOverview, { data: {
    checkedAt: now.toISOString(), runtime,
    cities: { state: "available", items: [] }, citySchedules: { state: "available", items: [] },
    pipeline: { state: "available", item: null },
  } }))
  assert.match(html, /Konfiguration, nicht gleichzeitig aktive Prozesse/)
  assert.match(html, /menschliche Freigabe/)
  assert.match(html, /city-annweiler/)
  assert.match(html, /Kontextlimit überschritten/)
  assert.match(html, /M1 beobachtet:/)
  assert.match(html, /Geändert:/)
  assert.match(html, /href="\/city-operations"/)
  assert.match(html, /href="\/automation"/)
  assert.doesNotMatch(html, /<button/)
})

test("profile regions resolve uniquely to their visible headings", () => {
  const benefitsiProfile = validSnapshot().profiles[0]
  const runtime = normalizeRuntimeSnapshot(validSnapshot({ profiles: [
    benefitsiProfile,
    { ...benefitsiProfile, id: "external-review", scope: "general" },
  ] }), now)
  const html = renderToStaticMarkup(createElement(AgentOverview, { data: {
    checkedAt: now.toISOString(), runtime,
    cities: { state: "available", items: [] }, citySchedules: { state: "available", items: [] },
    pipeline: { state: "available", item: null },
  } }))
  const document = new JSDOM(html).window.document

  for (const expectedTitle of ["Benefitsi-Profile", "Weitere beobachtete Profile"]) {
    const heading = [...document.querySelectorAll("h2")].find(element => element.textContent === expectedTitle)
    assert.ok(heading, `missing heading: ${expectedTitle}`)
    const region = heading.closest("section")
    assert.ok(region, `missing region for: ${expectedTitle}`)
    const references = region.getAttribute("aria-labelledby")?.trim().split(/\s+/) ?? []
    assert.equal(references.length, 1, `${expectedTitle} must use one heading reference`)
    const matches = [...document.querySelectorAll("[id]")].filter(element => element.id === references[0])
    assert.equal(matches.length, 1, `${expectedTitle} heading reference must resolve uniquely`)
    assert.equal(matches[0].textContent, expectedTitle)
  }
})

test("old city evidence never renders as a current technical success", () => {
  const html = renderToStaticMarkup(createElement(AgentOverview, { data: {
    checkedAt: "2026-09-21T10:30:00Z", runtime: { state: "unavailable", snapshot: null },
    cities: { state: "available", truncated: false, items: [{ cityId: "b9e684e4-54b3-41ff-8f97-4426423893c2", cityName: "Annweiler am Trifels", operatingMode: "review", orchestratorProfile: "ben", cityProfile: "city-annweiler", timezone: "Europe/Berlin", autoPublishEnabled: false, lastFullCheckAt: "2026-09-01T10:00:00Z", nextFullCheckAt: null, healthStatus: "ok" }] },
    citySchedules: { state: "available", truncated: false, items: [] },
    pipeline: { state: "available", item: { cityId: "b9e684e4-54b3-41ff-8f97-4426423893c2", cityName: "Annweiler am Trifels", lastRunAt: "2026-09-01T10:00:00Z", lastRunOk: true, technicalOk: true, editorialReviewPending: true, researchCheckedAt: "2026-09-01T09:55:00Z" } },
  } }))
  assert.match(html, /Technische Daten veraltet/)
  assert.doesNotMatch(html, /Technisch in Ordnung/)
})

test("city card keeps auto-publication configuration separate from pending editorial review", () => {
  const html = renderToStaticMarkup(createElement(AgentOverview, { data: {
    checkedAt: "2026-09-21T10:30:00Z", runtime: { state: "unavailable", snapshot: null },
    cities: { state: "available", items: [{ cityId: "b9e684e4-54b3-41ff-8f97-4426423893c2", cityName: "Annweiler am Trifels", operatingMode: "review", orchestratorProfile: "ben", cityProfile: "city-annweiler", timezone: "Europe/Berlin", autoPublishEnabled: true, lastFullCheckAt: null, nextFullCheckAt: null, healthStatus: "partial" }] },
    citySchedules: { state: "available", items: [] },
    pipeline: { state: "available", item: { cityId: "b9e684e4-54b3-41ff-8f97-4426423893c2", cityName: "Annweiler am Trifels", lastRunAt: "2026-09-21T09:00:00Z", lastRunOk: false, technicalOk: true, editorialReviewPending: true, researchCheckedAt: "2026-09-21T08:55:00Z" } },
  } }))
  assert.match(html, /Technisch in Ordnung/)
  assert.match(html, /Veröffentlichungskonfiguration.*Automatische Veröffentlichung aktiviert/s)
  assert.match(html, /Redaktionelle Prüfung.*Menschliche Prüfung ausstehend/s)
})

test("city card distinguishes disabled and unknown publication configuration", () => {
  for (const [autoPublishEnabled, expected] of [[false, "Automatische Veröffentlichung deaktiviert"], [null, "Nicht nachgewiesen"]]) {
    const html = renderToStaticMarkup(createElement(AgentOverview, { data: {
      checkedAt: now.toISOString(), runtime: { state: "unavailable", snapshot: null },
      cities: { state: "available", items: [{ cityId: "city", cityName: "Teststadt", operatingMode: null, orchestratorProfile: null, cityProfile: null, timezone: null, autoPublishEnabled, lastFullCheckAt: null, nextFullCheckAt: null, healthStatus: null }] },
      citySchedules: { state: "available", items: [] }, pipeline: { state: "available", item: null },
    } }))
    assert.match(html, new RegExp(`Veröffentlichungskonfiguration.*${expected}`, "s"))
  }
})

test("complete source failure shows an honest empty state without invented profiles", () => {
  const html = renderToStaticMarkup(createElement(AgentOverview, { data: {
    checkedAt: now.toISOString(), runtime: { state: "unavailable", snapshot: null },
    cities: { state: "unavailable", items: [] }, citySchedules: { state: "unavailable", items: [] },
    pipeline: { state: "unavailable", item: null },
  } }))
  assert.match(html, /Keine belastbaren Agentendaten verfügbar/)
  assert.doesNotMatch(html, /city-annweiler/)
})
