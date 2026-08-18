import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  buildImageGenerationPrompt,
  canTransitionStamp,
  createLandmarkStampSkill,
  generationDecision,
  isExplorerStamp,
  isLoyaltyStamp,
  referenceReadiness,
  stampCuratorAgent,
  validateEdition,
  validateReferenceProvenance,
  validateSeriesPiece,
  validateStampRunInput,
} from "../lib/stamp-curator/index.ts"

const reference = (id, sourceKind) => ({
  id,
  sourceKind,
  title: id,
  url: `https://example.com/${id}`,
  checkedAt: "2026-08-16",
  ...(sourceKind === "WIKIMEDIA_OPEN_DATA"
    ? { license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" }
    : {}),
})

const references = [
  reference("operator", "OFFICIAL_OPERATOR"),
  reference("tourism", "CITY_TOURISM"),
  reference("commons", "WIKIMEDIA_OPEN_DATA"),
]

const factSheet = {
  landmarkName: "Reichsburg Trifels",
  cityName: "Annweiler am Trifels",
  primarySubject: "Castle",
  definingSilhouette: "Dominant main tower above lower masses",
  dominantTowerArrangement: "One dominant main tower; preserve approved view",
  roofTypes: "Reference-led",
  relativeBuildingHeights: "Main tower above lower masses",
  architecturalMasses: "Ring wall, gate, fountain tower, main tower, palas base",
  facadeFeatures: "Stone masonry",
  terrainContext: "Rock ridge above Annweiler",
  foregroundBackground: "Forested Trifelsland",
  recognizableViewpoints: ["oblique elevated view"],
  mustNotInvent: ["extra towers"],
  facts: [
    {
      key: "silhouette",
      observation: "Main tower and lower complex",
      confidence: "HIGH",
      sourceReferenceIds: ["operator", "commons"],
      critical: true,
    },
  ],
}

const brief = {
  place: "Reichsburg Trifels",
  city: "Annweiler am Trifels",
  collection: "Annweiler entdecken",
  edition: { type: "STANDARD" },
  references: ["operator", "tourism", "commons"],
  signatureFeatures: ["dominant main tower", "rock ridge", "stone masonry"],
  viewpointComposition: "Approved oblique elevated view",
  shape: "Round collector seal",
  color: "Benefitsi blue and restrained sandstone accent",
  typography: "Minimal high-contrast name",
  ornamentation: "Subtle local line ornament",
  texture: "Light print grain",
  mustInclude: ["real silhouette", "main tower"],
  mustNotInvent: ["extra towers", "generic castle"],
  backSideContent: ["source-grounded short story"],
}

test("agent and skill are registered below Ben without a scheduler", () => {
  assert.equal(stampCuratorAgent.id, "stamp_curator")
  assert.equal(stampCuratorAgent.parentAgent, "ben")
  assert.deepEqual(stampCuratorAgent.placement, ["CONTENT", "CREATIVE", "DISCOVERY"])
  assert.equal(stampCuratorAgent.runtimeProfile, "ben")
  assert.equal(stampCuratorAgent.registered, true)
  assert.equal(stampCuratorAgent.enabled, true)
  assert.equal(stampCuratorAgent.scheduled, false)
  assert.equal(stampCuratorAgent.autoRun, false)
  assert.equal(stampCuratorAgent.status, "REGISTERED")
  assert.equal(stampCuratorAgent.operatingMode, "MANUAL_TRIGGER")
  assert.equal(stampCuratorAgent.scheduler, null)
  assert.equal(createLandmarkStampSkill.id, "CREATE_LANDMARK_STAMP")
  assert.deepEqual(createLandmarkStampSkill.stages, [
    "RESEARCH",
    "VISUAL_FACT_EXTRACTION",
    "DESIGN_BRIEF",
    "STAMP_GENERATION",
    "FIDELITY_QA",
    "METADATA",
    "HUMAN_REVIEW",
  ])
})

test("city and place input is required and loyalty stamps stay out of scope", () => {
  assert.equal(validateStampRunInput({ cityId: "city", placeId: "place", references }).valid, true)
  const invalid = validateStampRunInput({ cityId: "", placeId: "", stampKind: "PARTNER_LOYALTY", references })
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.includes("CITY_ID_REQUIRED"))
  assert.ok(invalid.errors.includes("PLACE_ID_REQUIRED"))
  assert.ok(invalid.errors.includes("LOYALTY_STAMP_OUT_OF_SCOPE"))
  assert.equal(isExplorerStamp("LANDMARK_EXPLORER"), true)
  assert.equal(isLoyaltyStamp("PARTNER_LOYALTY"), true)
})

test("missing references prevent final generation", () => {
  const readiness = referenceReadiness(references.slice(0, 2), factSheet)
  assert.equal(readiness.status, "REFERENCE_INCOMPLETE")
  assert.ok(readiness.reasons.includes("MINIMUM_THREE_DISTINCT_REFERENCES"))
  const decision = generationDecision({
    run: { cityId: "city", placeId: "place", references: references.slice(0, 2) },
    referencesApproved: false,
    factSheet,
    designBrief: brief,
    requestedOutput: "FINAL",
    fidelityResult: "PASS",
    humanApproved: true,
    manualLock: false,
  })
  assert.equal(decision.allowed, false)
  assert.equal(decision.status, "REFERENCE_INCOMPLETE")
})

test("critical low-confidence facts require reference review", () => {
  const uncertain = { ...factSheet, facts: [{ ...factSheet.facts[0], confidence: "LOW" }] }
  const decision = generationDecision({
    run: { cityId: "city", placeId: "place", references },
    referencesApproved: true,
    factSheet: uncertain,
    designBrief: brief,
    requestedOutput: "FINAL",
    fidelityResult: "PASS",
    humanApproved: true,
    manualLock: false,
  })
  assert.equal(decision.allowed, false)
  assert.equal(decision.status, "NEEDS_REFERENCE_REVIEW")
  assert.ok(decision.reasons.includes("CRITICAL_FACTS_HAVE_LOW_CONFIDENCE"))
})

test("approved references can produce candidates, never an implicit final", () => {
  const decision = generationDecision({
    run: { cityId: "city", placeId: "place", references },
    referencesApproved: true,
    factSheet,
    designBrief: brief,
    requestedOutput: "CANDIDATES",
    fidelityResult: null,
    humanApproved: false,
    manualLock: false,
  })
  assert.deepEqual(decision, { allowed: true, status: "CANDIDATES_READY", reasons: [] })
})

test("final prompt enforces original illustration and landmark fidelity", () => {
  const prompt = buildImageGenerationPrompt(brief, factSheet)
  assert.match(prompt, /Use the supplied\/researched landmark references/)
  assert.match(prompt, /original illustrative interpretation, not a copy or tracing/)
  assert.match(prompt, /dominant main tower/)
  assert.match(prompt, /extra towers/)
})

test("reference provenance is unique, URL-backed and auditable", () => {
  assert.equal(validateReferenceProvenance(references).valid, true)
  const duplicate = validateReferenceProvenance([references[0], references[0]])
  assert.equal(duplicate.valid, false)
  assert.ok(duplicate.errors.includes("REFERENCE_ID_DUPLICATE"))
  assert.ok(duplicate.errors.includes("REFERENCE_URL_DUPLICATE"))

  const unlicensedFile = validateReferenceProvenance([{
    ...references[2],
    id: "unlicensed-file",
    title: "File: Trifels Castle.jpg",
    license: undefined,
    licenseUrl: undefined,
  }])
  assert.equal(unlicensedFile.valid, false)
  assert.ok(unlicensedFile.errors.includes("OPEN_REFERENCE_LICENSE_REQUIRED"))

  const unlicensedCategory = validateReferenceProvenance([{
    ...references[2],
    id: "commons-category",
    title: "Wikimedia Commons category: Trifels Castle",
    license: undefined,
    licenseUrl: undefined,
  }])
  assert.equal(unlicensedCategory.valid, true)
})

test("editions require real scarcity and reject game mechanics", () => {
  assert.equal(validateEdition({ type: "STANDARD" }).valid, true)
  const missingConstraint = validateEdition({ type: "LIMITED_EDITION" })
  assert.ok(missingConstraint.errors.includes("LIMITED_EDITION_REQUIRES_AVAILABILITY_CONSTRAINT"))
  const limited = validateEdition({
    type: "LIMITED_EDITION",
    availabilityConstraint: {
      kind: "EVENT",
      statement: "Nur während des verifizierten Events",
      sourceReferenceIds: ["operator"],
    },
  })
  assert.equal(limited.valid, true)
  const gameMechanics = validateEdition({ type: "STANDARD", randomDropChance: 0.05, rarity: "RARE", lootbox: true })
  assert.ok(gameMechanics.errors.includes("RANDOM_SCARCITY_NOT_ALLOWED"))
  assert.ok(gameMechanics.errors.includes("GAME_RARITY_NOT_ALLOWED"))
  assert.ok(gameMechanics.errors.includes("LOOTBOX_NOT_ALLOWED"))
})

test("series indexing is deterministic", () => {
  assert.equal(validateSeriesPiece({ seriesId: "trifels-panorama", numberOfPieces: 5, pieceNumber: 3 }).valid, true)
  const invalid = validateSeriesPiece({ seriesId: "trifels-panorama", numberOfPieces: 5, pieceNumber: 6 })
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.includes("SERIES_PIECE_NUMBER_INVALID"))
})

test("human approval, fidelity pass and manual lock protect final artwork", () => {
  const blocked = canTransitionStamp({ from: "ART_REVIEW", to: "READY", humanApproved: false, fidelityResult: "PASS", manualLock: false, artworkChanged: false })
  assert.ok(blocked.errors.includes("HUMAN_APPROVAL_REQUIRED"))
  const locked = canTransitionStamp({ from: "HUMAN_APPROVED", to: "READY", humanApproved: true, fidelityResult: "PASS", manualLock: true, artworkChanged: true })
  assert.ok(locked.errors.includes("MANUAL_LOCK_PROTECTS_SELECTED_ARTWORK"))
  const ready = canTransitionStamp({ from: "HUMAN_APPROVED", to: "READY", humanApproved: true, fidelityResult: "PASS", manualLock: false, artworkChanged: false })
  assert.equal(ready.valid, true)
})

test("the foundation documents keep the current shadow isolated", async () => {
  const [manifest, profileMeta, soul, skill, agentDoc, designDoc, referencesJson, factsJson, briefJson] = await Promise.all([
    readFile(new URL("../../../tools/hermes-city-profiles/ben/entdeckerstempel-curator.yaml", import.meta.url), "utf8"),
    readFile(new URL("../../../tools/hermes-city-profiles/ben/profile.yaml", import.meta.url), "utf8"),
    readFile(new URL("../../../tools/hermes-city-profiles/ben/SOUL.md", import.meta.url), "utf8"),
    readFile(new URL("../../../tools/hermes-city-profiles/ben/skills/content/creative/discovery/create-landmark-stamp/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/entdeckerstempel-agent.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/entdeckerstempel-design-system.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/research/entdeckerstempel/annweiler-trifels-reference-set.json", import.meta.url), "utf8"),
    readFile(new URL("../docs/research/entdeckerstempel/annweiler-trifels-visual-fact-sheet.json", import.meta.url), "utf8"),
    readFile(new URL("../docs/research/entdeckerstempel/annweiler-trifels-stamp-design-brief.json", import.meta.url), "utf8"),
  ])
  assert.match(manifest, /status: REGISTERED/)
  assert.match(manifest, /operating_mode: MANUAL_TRIGGER/)
  assert.match(manifest, /profile: ben/)
  assert.match(manifest, /scheduled: false/)
  assert.match(profileMeta, /ENTDECKERSTEMPEL CURATOR/)
  assert.match(soul, /CREATE_LANDMARK_STAMP/)
  assert.match(skill, /name: CREATE_LANDMARK_STAMP/)
  assert.match(manifest, /scheduler: null/)
  assert.match(agentDoc, /does not change City Agent\s+Shadow/)
  assert.match(designDoc, /STYLIZED, BUT NEVER INVENTED/)
  assert.equal(JSON.parse(referencesJson).finalArtworkStatus, "NOT_GENERATED")
  assert.equal(JSON.parse(factsJson).status, "NEEDS_REFERENCE_REVIEW")
  assert.equal(JSON.parse(briefJson).status, "DRAFT_ONLY")
})
