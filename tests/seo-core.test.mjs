import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateSeoScores,
  DEFAULT_SEO_SCORE_WEIGHTS,
} from "../lib/seo/seo-core.ts"
import {
  validateSeoFetchUrl,
  validateSeoRedirectTarget,
} from "../lib/seo/seo-url-policy.ts"
import { preferredSourceForDomain } from "../lib/seo/preferred-source.ts"
import { deriveInitialSeoKeywords } from "../lib/seo/seo-keywords.ts"
import {
  describeSeoJob,
  isSeoJobPending,
} from "../lib/seo/seo-status.ts"
import {
  localizeSeoExperiment,
  localizeSeoAuditSummary,
  localizeSeoFinding,
} from "../lib/seo/seo-i18n.ts"
import { getSeoActionPlan, getSeoScoreRoadmap } from "../lib/seo/seo-action-plan.ts"

function completeInput(overrides = {}) {
  return {
    technical: { score: 90, available: true, confidence: 0.9 },
    organic: { score: 70, available: true, confidence: 0.8 },
    local: { score: 80, available: true, confidence: 0.85 },
    contentEntity: { score: 75, available: true, confidence: 0.8 },
    aiVisibility: { score: 50, available: true, confidence: 0.6 },
    ...overrides,
  }
}

test("calculates a versioned deterministic score with documented weights", () => {
  const result = calculateSeoScores(completeInput())

  assert.equal(result.formulaVersion, "v1")
  assert.deepEqual(result.weights, DEFAULT_SEO_SCORE_WEIGHTS)
  assert.equal(result.coverage, 1)
  assert.equal(result.overall, 75)
  assert.equal(result.components.technical.score, 90)
  assert.equal(result.components.organic.score, 70)
  assert.equal(result.confidence, 0.81)
})

test("does not punish a target for unavailable providers", () => {
  const result = calculateSeoScores(
    completeInput({
      local: { score: null, available: false, confidence: 0 },
      aiVisibility: { score: null, available: false, confidence: 0 },
    }),
  )

  assert.equal(result.components.local.available, false)
  assert.equal(result.components.aiVisibility.available, false)
  assert.equal(result.coverage, 0.65)
  assert.equal(result.overall, 77)
  assert.notEqual(result.overall, 0)
})

test("rejects unsafe crawl URLs and redirect targets", () => {
  assert.equal(validateSeoFetchUrl("ftp://example.com").ok, false)
  assert.equal(validateSeoFetchUrl("http://localhost:3000").ok, false)
  assert.equal(validateSeoFetchUrl("https://192.168.1.10/page").ok, false)
  assert.equal(validateSeoFetchUrl("https://[::1]/page").ok, false)
  assert.equal(validateSeoFetchUrl("https://metadata.google.internal/page").ok, false)
  assert.equal(validateSeoFetchUrl("https://example.com/page").ok, true)
  assert.equal(validateSeoRedirectTarget("https://example.com/next").ok, true)
  assert.equal(validateSeoRedirectTarget("http://127.0.0.1/admin").ok, false)
})

test("normalizes a page URL to a domain-scoped Google Preferred Source", () => {
  const result = preferredSourceForDomain("https://benefitsi.de/p/pizzeria")

  assert.equal(result.ok, true)
  assert.equal(result.domain, "benefitsi.de")
  assert.equal(
    result.deeplink,
    "https://www.google.com/preferences/source?q=benefitsi.de",
  )
})

test("rejects an invalid Preferred Source domain", () => {
  assert.equal(preferredSourceForDomain("http://localhost:3000").ok, false)
  assert.equal(preferredSourceForDomain("not-a-url").ok, false)
})

test("derives a small reviewable keyword set from a microsite URL", () => {
  assert.deepEqual(
    deriveInitialSeoKeywords("https://benefitsi.de/p/dilara-kebap-pizzahaus"),
    ["dilara kebap pizzahaus", "dilara", "kebap", "pizzahaus"],
  )
})

test("does not create an unbounded keyword list for a domain target", () => {
  const keywords = deriveInitialSeoKeywords("https://benefitsi.de")

  assert.ok(keywords.length > 0)
  assert.ok(keywords.length <= 12)
  assert.equal(new Set(keywords).size, keywords.length)
})

test("describes queue states and exposes pending work to the dashboard", () => {
  assert.equal(isSeoJobPending("queued"), true)
  assert.equal(isSeoJobPending("claimed"), true)
  assert.equal(isSeoJobPending("agent_completed"), false)
  assert.equal(
    describeSeoJob({
      job_type: "seo_audit",
      status: "failed",
      error_code: "provider_unconfigured",
    }).detail,
    "provider_unconfigured",
  )
  assert.equal(
    describeSeoJob({ job_type: "seo_audit", status: "queued" }).label,
    "Wartet auf Hermes",
  )
})

test("localizes stored English findings and experiment metadata into German", () => {
  const finding = localizeSeoFinding({
    category: "technical",
    severity: "high",
    status: "open",
    evidence_class: "verified",
    title: "Active SEO target has no published Benefitsi microsite",
    description: "The target is active but no published microsite exists.",
    recommendation: "Create and submit a microsite draft through human review.",
  })
  const experiment = localizeSeoExperiment({
    experiment_type: "citation_probe",
    hypothesis: "Ein answer-first Entity- und Quellenblock könnte die Zitierbarkeit verbessern",
    target_metric: "AI citation rate",
    status: "draft",
    rollback_note: "Nur als menschlich freizugebender Draft testen.",
  })

  assert.equal(finding.title, "Aktives SEO-Ziel hat keine veröffentlichte Benefitsi-Microsite")
  assert.equal(finding.category, "Technik")
  assert.equal(finding.severity, "Hoch")
  assert.equal(finding.status, "Offen")
  assert.equal(finding.evidenceClass, "Verifiziert")
  assert.equal(experiment.type, "Zitierbarkeitstest")
  assert.equal(
    experiment.hypothesis,
    "Ein Antwort-zuerst-Entitäts- und Quellenblock könnte die Zitierbarkeit verbessern, ohne einen Rankingeffekt zu behaupten.",
  )
  assert.equal(experiment.targetMetric, "AI-Zitierrate")
  assert.equal(experiment.status, "Entwurf")
  assert.equal(experiment.rollbackNote, "Nur als menschlich freizugebender Entwurf testen.")
})

test("creates a concrete German action plan for a weak technical score", () => {
  const plan = getSeoActionPlan({
    category: "technical",
    severity: "high",
    title: "Active SEO target has no published Benefitsi microsite",
    recommendation: "Create and submit a microsite draft through human review.",
  })

  assert.equal(plan.priority, "Sofort")
  assert.match(plan.headline, /Microsite veröffentlichen/)
  assert.ok(plan.steps.length >= 3)
  assert.match(plan.steps[0].doneWhen, /200|veröffentlicht/i)
  assert.ok(plan.scoreAreas.includes("Technik"))
})

test("localizes the audit summary and prioritizes missing score dimensions", () => {
  assert.match(
    localizeSeoAuditSummary("No score drift detected versus latest stored baseline; unchanged blocker remains published microsite availability/indexability."),
    /Keine Score-Abweichung|unveränderte Problem/i,
  )

  const roadmap = getSeoScoreRoadmap({
    technicalScore: 15,
    organicScore: null,
    coverage: 0.62,
    localProviderUnavailable: true,
    aiProviderUnavailable: true,
    findings: [{ category: "technical", severity: "high", title: "Active SEO target has no published Benefitsi microsite" }],
    hasExperiments: true,
  })

  assert.ok(roadmap.length >= 3)
  assert.equal(roadmap[0].priority, "Sofort")
  assert.match(roadmap.map((item) => item.headline).join(" "), /Provider|GEO|Microsite/i)
})
