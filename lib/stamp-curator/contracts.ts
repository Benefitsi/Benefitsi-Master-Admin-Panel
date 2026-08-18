export const stampCuratorAgent = {
  id: "stamp_curator",
  displayName: "ENTDECKERSTEMPEL CURATOR",
  parentAgent: "ben",
  placement: ["CONTENT", "CREATIVE", "DISCOVERY"] as const,
  runtimeProfile: "ben",
  registered: true,
  enabled: true,
  scheduled: false,
  autoRun: false,
  status: "REGISTERED" as const,
  operatingMode: "MANUAL_TRIGGER" as const,
  skillId: "CREATE_LANDMARK_STAMP",
  scheduler: null,
  createsFinalArtwork: false,
  capabilities: [
    "stamp_research",
    "visual_fact_extraction",
    "stamp_art_direction",
    "fidelity_qa",
    "edition_design",
    "series_design",
    "stamp_metadata",
  ] as const,
} as const

export const createLandmarkStampSkill = {
  id: "CREATE_LANDMARK_STAMP",
  version: "1.0.0",
  ownerAgent: stampCuratorAgent.id,
  stages: [
    "RESEARCH",
    "VISUAL_FACT_EXTRACTION",
    "DESIGN_BRIEF",
    "STAMP_GENERATION",
    "FIDELITY_QA",
    "METADATA",
    "HUMAN_REVIEW",
  ] as const,
  firstOutput: "THREE_CANDIDATES_OR_COMPOSITION_VARIANTS" as const,
  finalArtworkRequires: [
    "REFERENCES_APPROVED",
    "VISUAL_FACT_SHEET",
    "FIDELITY_PASS",
    "HUMAN_APPROVAL",
  ] as const,
} as const

export const explorerStampKinds = ["LANDMARK_EXPLORER"] as const
export type ExplorerStampKind = (typeof explorerStampKinds)[number]

export const stampWorkflowStatuses = [
  "DRAFT",
  "REFERENCE_REVIEW",
  "ART_REVIEW",
  "HUMAN_APPROVED",
  "READY",
  "NEEDS_REFERENCE_REVIEW",
  "REFERENCE_INCOMPLETE",
  "MANUAL_LOCK",
] as const
export type StampWorkflowStatus = (typeof stampWorkflowStatuses)[number]

export const referenceSourceKinds = [
  "BENEFITSI_MEDIA",
  "OFFICIAL_OPERATOR",
  "CITY_TOURISM",
  "WIKIMEDIA_OPEN_DATA",
  "REPUTABLE_VERIFICATION",
] as const
export type StampReferenceSourceKind = (typeof referenceSourceKinds)[number]

export const confidenceLevels = ["HIGH", "MEDIUM", "LOW"] as const
export type ConfidenceLevel = (typeof confidenceLevels)[number]

export const fidelityResults = ["PASS", "NEEDS_REVISION", "FAIL"] as const
export type StampFidelityResult = (typeof fidelityResults)[number]

export const editionTypes = [
  "STANDARD",
  "SPECIAL_EDITION",
  "LIMITED_EDITION",
  "EVENT_EDITION",
  "SEASONAL_EDITION",
  "ANNIVERSARY_EDITION",
  "SERIES_PIECE",
  "LEGACY_EDITION",
] as const
export type StampEditionType = (typeof editionTypes)[number]

export type StampReference = {
  id: string
  url: string
  title: string
  sourceKind: StampReferenceSourceKind
  viewpoint?: string | null
  author?: string | null
  license?: string | null
  licenseUrl?: string | null
  checkedAt: string
  notes?: string | null
}

export type VisualFact = {
  key: string
  observation: string
  confidence: ConfidenceLevel
  sourceReferenceIds: string[]
  critical?: boolean
}

export type LandmarkVisualFactSheet = {
  landmarkName: string
  cityName: string
  primarySubject: string
  definingSilhouette: string
  dominantTowerArrangement: string
  roofTypes: string
  relativeBuildingHeights: string
  architecturalMasses: string
  facadeFeatures: string
  terrainContext: string
  foregroundBackground: string
  recognizableViewpoints: string[]
  mustNotInvent: string[]
  facts: VisualFact[]
}

export type StampEdition = {
  type: StampEditionType
  label?: string | null
  availabilityConstraint?: {
    kind: "EVENT" | "SEASON" | "ANNIVERSARY" | "ROUTE" | "OTHER"
    statement: string
    startsAt?: string | null
    endsAt?: string | null
    sourceReferenceIds: string[]
  } | null
  randomDropChance?: number | null
  rarity?: string | null
  lootbox?: boolean
}

export type StampDesignBrief = {
  place: string
  city: string
  collection: string
  edition: StampEdition
  references: string[]
  signatureFeatures: string[]
  viewpointComposition: string
  shape: string
  color: string
  typography: string
  ornamentation: string
  texture: string
  mustInclude: string[]
  mustNotInvent: string[]
  backSideContent: string[]
}

export type StampSeries = {
  seriesId: string
  numberOfPieces: number
  pieceNumber: number
  completionArtwork?: string | null
  unlockLogic?: string | null
  availability?: string | null
  editionWindow?: { startsAt: string; endsAt: string } | null
}

export type StampCuratorRunInput = {
  cityId: string
  placeId: string
  placeName?: string
  collection?: string
  references?: StampReference[]
  stampKind?: ExplorerStampKind | "PARTNER_LOYALTY"
}

export type StampGenerationRequest = {
  run: StampCuratorRunInput
  referencesApproved: boolean
  factSheet?: LandmarkVisualFactSheet | null
  designBrief?: StampDesignBrief | null
  requestedOutput: "CANDIDATES" | "FINAL"
  fidelityResult?: StampFidelityResult | null
  humanApproved: boolean
  manualLock: boolean
  artworkChanged?: boolean
}

export type ValidationResult = {
  valid: boolean
  errors: string[]
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function validateStampRunInput(input: StampCuratorRunInput): ValidationResult {
  const errors: string[] = []
  if (!nonEmpty(input.cityId)) errors.push("CITY_ID_REQUIRED")
  if (!nonEmpty(input.placeId)) errors.push("PLACE_ID_REQUIRED")
  if (input.stampKind === "PARTNER_LOYALTY") errors.push("LOYALTY_STAMP_OUT_OF_SCOPE")

  for (const reference of input.references ?? []) {
    if (!nonEmpty(reference.id)) errors.push("REFERENCE_ID_REQUIRED")
    if (!isHttpUrl(reference.url)) errors.push("REFERENCE_URL_INVALID")
    if (!nonEmpty(reference.title)) errors.push("REFERENCE_TITLE_REQUIRED")
    if (!nonEmpty(reference.checkedAt)) errors.push("REFERENCE_CHECKED_AT_REQUIRED")
    if (!referenceSourceKinds.includes(reference.sourceKind)) errors.push("REFERENCE_SOURCE_KIND_INVALID")
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export function validateReferenceProvenance(references: StampReference[]): ValidationResult {
  const errors: string[] = []
  const ids = new Set<string>()
  const urls = new Set<string>()

  for (const reference of references) {
    if (ids.has(reference.id)) errors.push("REFERENCE_ID_DUPLICATE")
    if (urls.has(reference.url)) errors.push("REFERENCE_URL_DUPLICATE")
    ids.add(reference.id)
    urls.add(reference.url)
    if (!isHttpUrl(reference.url)) errors.push("REFERENCE_URL_INVALID")
    if (!nonEmpty(reference.checkedAt)) errors.push("REFERENCE_CHECKED_AT_REQUIRED")
    const isConcreteWikimediaFile =
      reference.sourceKind === "WIKIMEDIA_OPEN_DATA" &&
      reference.title.trim().toLowerCase().startsWith("file:")
    if (isConcreteWikimediaFile && (!nonEmpty(reference.license) || !isHttpUrl(reference.licenseUrl))) {
      errors.push("OPEN_REFERENCE_LICENSE_REQUIRED")
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export function referenceReadiness(
  references: StampReference[],
  factSheet?: LandmarkVisualFactSheet | null,
): { status: "READY_FOR_CANDIDATES" | "NEEDS_REFERENCE_REVIEW" | "REFERENCE_INCOMPLETE"; reasons: string[] } {
  const reasons: string[] = []
  const uniqueUrls = new Set(references.map((reference) => reference.url))
  const sourceKinds = new Set(references.map((reference) => reference.sourceKind))

  if (uniqueUrls.size < 3) reasons.push("MINIMUM_THREE_DISTINCT_REFERENCES")
  if (sourceKinds.size < 2) reasons.push("MULTI_SOURCE_REFERENCE_SET_REQUIRED")
  if (!factSheet) reasons.push("VISUAL_FACT_SHEET_REQUIRED")

  const criticalLowFacts = (factSheet?.facts ?? []).filter(
    (fact) => fact.critical && fact.confidence === "LOW",
  )
  if (criticalLowFacts.length) reasons.push("CRITICAL_FACTS_HAVE_LOW_CONFIDENCE")

  if (reasons.some((reason) => reason === "MINIMUM_THREE_DISTINCT_REFERENCES" || reason === "MULTI_SOURCE_REFERENCE_SET_REQUIRED" || reason === "VISUAL_FACT_SHEET_REQUIRED")) {
    return { status: "REFERENCE_INCOMPLETE", reasons }
  }
  if (criticalLowFacts.length) return { status: "NEEDS_REFERENCE_REVIEW", reasons }
  return { status: "READY_FOR_CANDIDATES", reasons }
}

export function validateEdition(edition: StampEdition): ValidationResult {
  const errors: string[] = []
  if (!editionTypes.includes(edition.type)) errors.push("EDITION_TYPE_INVALID")

  if (edition.type === "LIMITED_EDITION" && !edition.availabilityConstraint) {
    errors.push("LIMITED_EDITION_REQUIRES_AVAILABILITY_CONSTRAINT")
  }
  if (edition.randomDropChance !== undefined && edition.randomDropChance !== null) {
    errors.push("RANDOM_SCARCITY_NOT_ALLOWED")
  }
  if (edition.rarity !== undefined && edition.rarity !== null) errors.push("GAME_RARITY_NOT_ALLOWED")
  if (edition.lootbox === true) errors.push("LOOTBOX_NOT_ALLOWED")

  if (edition.availabilityConstraint && !nonEmpty(edition.availabilityConstraint.statement)) {
    errors.push("AVAILABILITY_STATEMENT_REQUIRED")
  }
  if (edition.availabilityConstraint && edition.availabilityConstraint.sourceReferenceIds.length === 0) {
    errors.push("AVAILABILITY_SOURCE_REQUIRED")
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export function validateSeriesPiece(series: StampSeries): ValidationResult {
  const errors: string[] = []
  if (!nonEmpty(series.seriesId)) errors.push("SERIES_ID_REQUIRED")
  if (!Number.isInteger(series.numberOfPieces) || series.numberOfPieces < 1) errors.push("SERIES_SIZE_INVALID")
  if (!Number.isInteger(series.pieceNumber) || series.pieceNumber < 1 || series.pieceNumber > series.numberOfPieces) {
    errors.push("SERIES_PIECE_NUMBER_INVALID")
  }
  if (series.editionWindow && series.editionWindow.startsAt >= series.editionWindow.endsAt) {
    errors.push("SERIES_EDITION_WINDOW_INVALID")
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export function generationDecision(request: StampGenerationRequest): {
  allowed: boolean
  status: "CANDIDATES_READY" | "FINAL_READY" | "NEEDS_REFERENCE_REVIEW" | "REFERENCE_INCOMPLETE" | "BLOCKED"
  reasons: string[]
} {
  const reasons: string[] = []
  const inputValidation = validateStampRunInput(request.run)
  if (!inputValidation.valid) reasons.push(...inputValidation.errors)
  const provenanceValidation = validateReferenceProvenance(request.run.references ?? [])
  if (!provenanceValidation.valid) reasons.push(...provenanceValidation.errors)

  const readiness = referenceReadiness(request.run.references ?? [], request.factSheet)
  reasons.push(...readiness.reasons)

  if (readiness.status === "REFERENCE_INCOMPLETE") {
    return { allowed: false, status: "REFERENCE_INCOMPLETE", reasons: [...new Set(reasons)] }
  }
  if (!provenanceValidation.valid) {
    return { allowed: false, status: "REFERENCE_INCOMPLETE", reasons: [...new Set(reasons)] }
  }
  if (readiness.status === "NEEDS_REFERENCE_REVIEW" || !request.referencesApproved) {
    reasons.push("REFERENCES_NOT_HUMAN_APPROVED")
    return { allowed: false, status: "NEEDS_REFERENCE_REVIEW", reasons: [...new Set(reasons)] }
  }
  if (!inputValidation.valid) return { allowed: false, status: "BLOCKED", reasons: [...new Set(reasons)] }

  if (request.requestedOutput === "CANDIDATES") {
    return { allowed: true, status: "CANDIDATES_READY", reasons: [...new Set(reasons)] }
  }

  if (!request.designBrief) reasons.push("DESIGN_BRIEF_REQUIRED")
  if (request.fidelityResult !== "PASS") reasons.push("FIDELITY_PASS_REQUIRED")
  if (!request.humanApproved) reasons.push("HUMAN_APPROVAL_REQUIRED")
  if (reasons.length) return { allowed: false, status: "BLOCKED", reasons: [...new Set(reasons)] }
  if (request.manualLock && request.artworkChanged) reasons.push("MANUAL_LOCK_PROTECTS_SELECTED_ARTWORK")
  if (reasons.length) return { allowed: false, status: "BLOCKED", reasons: [...new Set(reasons)] }
  return { allowed: true, status: "FINAL_READY", reasons: [] }
}

export function buildImageGenerationPrompt(
  brief: StampDesignBrief,
  factSheet: LandmarkVisualFactSheet,
): string {
  return [
    "Create an original Benefitsi Entdeckerstempel illustration.",
    "Use the supplied/researched landmark references to preserve the real architectural silhouette and defining proportions.",
    "Create an original illustrative interpretation, not a copy or tracing of any single photograph.",
    `Landmark: ${brief.place}; city: ${brief.city}; collection: ${brief.collection}.`,
    `Composition: ${brief.viewpointComposition}.`,
    `Fact-sheet silhouette: ${factSheet.definingSilhouette}.`,
    `Signature features: ${brief.signatureFeatures.join("; ")}.`,
    `Must include: ${brief.mustInclude.join("; ")}.`,
    `Must not invent: ${brief.mustNotInvent.join("; ")}.`,
    `Shape: ${brief.shape}. Color: ${brief.color}. Typography: ${brief.typography}.`,
    `Texture: ${brief.texture}. Keep the landmark readable at small collector-stamp size.`,
  ].join("\n")
}

export function canTransitionStamp(options: {
  from: StampWorkflowStatus
  to: StampWorkflowStatus
  humanApproved: boolean
  fidelityResult: StampFidelityResult | null
  manualLock: boolean
  artworkChanged: boolean
}): ValidationResult {
  const errors: string[] = []
  if (options.manualLock && options.artworkChanged) errors.push("MANUAL_LOCK_PROTECTS_SELECTED_ARTWORK")
  if (options.to === "HUMAN_APPROVED" && !options.humanApproved) errors.push("HUMAN_APPROVAL_REQUIRED")
  if (options.to === "READY") {
    if (!options.humanApproved) errors.push("HUMAN_APPROVAL_REQUIRED")
    if (options.fidelityResult !== "PASS") errors.push("FIDELITY_PASS_REQUIRED")
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export function isLoyaltyStamp(kind: unknown): kind is "PARTNER_LOYALTY" {
  return kind === "PARTNER_LOYALTY"
}

export function isExplorerStamp(kind: unknown): kind is ExplorerStampKind {
  return typeof kind === "string" && explorerStampKinds.includes(kind as ExplorerStampKind)
}
