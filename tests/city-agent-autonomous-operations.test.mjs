import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { decideAutonomousAction } from "../lib/city-agent/autonomy-policy.ts"
import { buildEditorialDraft, editorialDraftKey, evaluateEditorialDraft } from "../lib/city-agent/editorial-automation.ts"

const worker = new URL("../app/api/automation/worker/route.ts", import.meta.url)
const runner = new URL("../lib/city-agent/runner.ts", import.meta.url)
const contentActions = new URL("../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts", import.meta.url)
const communityActions = new URL("../app/city-pages/[citySlug]/community/actions.ts", import.meta.url)

function safeAction(overrides = {}) {
  return {
    operatingMode: "GUARDED_AUTO",
    autoPublishEnabled: true,
    prelaunch: false,
    fieldMode: "AUTO",
    sourceTrustTier: "A",
    confidence: 0.99,
    risk: "low",
    contentType: "city_place",
    operation: "update",
    fields: ["seo_title", "seo_description"],
    entityExists: true,
    evidenceCount: 2,
    hasConflict: false,
    ...overrides,
  }
}

test("shadow and prelaunch remain hard stops even for an otherwise safe action", () => {
  const shadow = decideAutonomousAction(safeAction({ operatingMode: "SHADOW" }))
  const prelaunch = decideAutonomousAction(safeAction({ prelaunch: true }))

  assert.equal(shadow.decision, "BLOCKED")
  assert.match(shadow.reason, /SHADOW/)
  assert.equal(prelaunch.decision, "BLOCKED")
  assert.match(prelaunch.reason, /PRELAUNCH/)
  assert.equal(shadow.protectedActionExecuted, false)
})

test("guarded auto accepts only a proven existing low-risk metadata update", () => {
  const decision = decideAutonomousAction(safeAction())

  assert.deepEqual(decision, {
    decision: "AUTO",
    reason: "existing_low_risk_change",
    protectedActionExecuted: false,
  })
})

test("new entities, events, conflicts and sensitive fields are escalated", () => {
  for (const overrides of [
    { entityExists: false },
    { contentType: "city_event" },
    { hasConflict: true },
    { fields: ["price", "opening_hours"] },
    { sourceTrustTier: "B" },
  ]) {
    assert.equal(decideAutonomousAction(safeAction(overrides)).decision, "REVIEW")
  }
})

test("editorial drafts are deterministic, source-bound and never published", () => {
  const input = {
    cityId: "11111111-1111-4111-8111-111111111111",
    citySlug: "annweiler",
    cityName: "Annweiler am Trifels",
    contentType: "city_guide",
    sourceSlug: "annweiler-tourismus",
    sourceUrl: "https://example.test/annweiler",
    sourceTitle: "Wandern rund um Annweiler",
    sourceText: "Verifizierte Hinweise zu Wegen, Aussichtspunkten und regionalen Besonderheiten rund um Annweiler am Trifels.",
    dateMentions: [],
    retrievedAt: "2026-09-03T10:00:00.000Z",
    sourceTrustTier: "A",
    canonicalUrl: "https://benefitsi.de/stadt/annweiler/entdecken",
  }
  const draft = buildEditorialDraft(input)
  const again = buildEditorialDraft(input)
  const renamed = buildEditorialDraft({ ...input, sourceTitle: "Neue geprüfte Wanderidee" })

  assert.ok(draft)
  assert.deepEqual(draft, again)
  assert.equal(renamed?.slug, draft.slug)
  assert.equal(draft.status, "draft")
  assert.equal(draft.scope, "city")
  assert.equal(draft.city_id, input.cityId)
  assert.deepEqual(draft.sources, [{ label: "annweiler-tourismus", url: input.sourceUrl }])
  assert.deepEqual(draft.related_links, [{ label: "Annweiler am Trifels entdecken", href: input.canonicalUrl }])
  assert.equal(editorialDraftKey(input), editorialDraftKey(input))
})

test("editorial automation rejects weak evidence and unsafe sources", () => {
  const base = {
    cityId: "11111111-1111-4111-8111-111111111111",
    citySlug: "annweiler",
    cityName: "Annweiler am Trifels",
    contentType: "city_event",
    sourceSlug: "event-source",
    sourceTitle: "Sommerabend",
    sourceText: "Ein kurzer Hinweis.",
    dateMentions: [],
    retrievedAt: "2026-09-03T10:00:00.000Z",
    sourceTrustTier: "A",
  }
  assert.equal(buildEditorialDraft({ ...base, sourceUrl: "http://example.test/event" }), null)
  assert.equal(buildEditorialDraft({ ...base, sourceUrl: "https://example.test/event" }), null)
  assert.equal(buildEditorialDraft({ ...base, sourceUrl: "https://example.test/event", sourceText: "Ausführliche Informationen zum Termin in Annweiler.", dateMentions: ["2026-09-20"] , sourceTrustTier: "C" }), null)
  assert.equal(buildEditorialDraft({ ...base, sourceUrl: "https://example.test/event", sourceText: "Ausführliche Informationen zum Termin in Annweiler.", dateMentions: ["2026-09-20"], retrievedAt: "not-a-date" }), null)
})

test("editorial quality gate keeps source-bound drafts reviewable and rejects unsafe shape", () => {
  const input = {
    cityId: "11111111-1111-4111-8111-111111111111",
    citySlug: "annweiler",
    cityName: "Annweiler am Trifels",
    contentType: "city_guide",
    sourceSlug: "annweiler-tourismus",
    sourceUrl: "https://example.test/annweiler",
    sourceTitle: "Wandern rund um Annweiler",
    sourceText: "Verifizierte Hinweise zu Wegen, Aussichtspunkten und regionalen Besonderheiten rund um Annweiler am Trifels.",
    dateMentions: [],
    retrievedAt: "2026-09-03T10:00:00.000Z",
    sourceTrustTier: "A",
    canonicalUrl: "https://benefitsi.de/stadt/annweiler/entdecken",
  }
  const draft = buildEditorialDraft(input)

  assert.ok(draft)
  assert.equal(evaluateEditorialDraft(draft).status, "READY_FOR_REVIEW")
  assert.equal(
    evaluateEditorialDraft({ ...draft, sources: [{ label: "unsafe", url: "http://example.test" }] }).status,
    "REJECTED",
  )
})

test("scheduled worker defaults to real execution and runner has a worker-id link fallback", async () => {
  const workerSource = await readFile(worker, "utf8")
  const runnerSource = await readFile(runner, "utf8")

  assert.match(workerSource, /dryRun.*false/)
  assert.match(workerSource, /CITY_AGENT_WORKER_MAX_JOBS/)
  assert.match(workerSource, /jobsProcessed|jobsProcessed/)
  assert.match(runnerSource, /worker_job_id/)
  assert.match(runnerSource, /const schedulerJobId/)
  assert.match(runnerSource, /eq\("worker_job_id", workerJobId\)/)
  assert.match(runnerSource, /buildEditorialDraft/)
  assert.match(runnerSource, /evaluateEditorialDraft/)
  assert.match(runnerSource, /from\("editorial_posts"\)/)
  assert.match(runnerSource, /editorial_draft_created/)
})

test("public cache is notified after human content restore and community moderation", async () => {
  const [contentSource, communitySource] = await Promise.all([
    readFile(contentActions, "utf8"),
    readFile(communityActions, "utf8"),
  ])

  assert.match(contentSource, /human_publish_city_content/)
  assert.match(contentSource, /notifyPublicRevalidation/)
  assert.match(communitySource, /moderate_city_community_submission/)
  assert.match(communitySource, /notifyPublicRevalidation/)
})
