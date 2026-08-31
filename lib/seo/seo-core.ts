export const DEFAULT_SEO_SCORE_WEIGHTS = {
  technical: 0.2,
  organic: 0.3,
  local: 0.25,
  contentEntity: 0.15,
  aiVisibility: 0.1,
} as const

export type SeoScoreComponentInput = {
  score: number | null
  available: boolean
  confidence?: number
}

export type SeoScoreInput = {
  technical: SeoScoreComponentInput
  organic: SeoScoreComponentInput
  local: SeoScoreComponentInput
  contentEntity: SeoScoreComponentInput
  aiVisibility: SeoScoreComponentInput
  formulaVersion?: string
}

export type SeoScoreComponent = {
  score: number | null
  available: boolean
  confidence: number
  weight: number
}

export type SeoScoreSnapshot = {
  formulaVersion: string
  weights: typeof DEFAULT_SEO_SCORE_WEIGHTS
  components: Record<keyof typeof DEFAULT_SEO_SCORE_WEIGHTS, SeoScoreComponent>
  overall: number | null
  coverage: number
  confidence: number
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max)
}

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function normalizedComponent(
  key: keyof typeof DEFAULT_SEO_SCORE_WEIGHTS,
  input: SeoScoreComponentInput,
): SeoScoreComponent {
  const weight = DEFAULT_SEO_SCORE_WEIGHTS[key]
  const available = Boolean(input.available && input.score !== null && Number.isFinite(input.score))
  return {
    score: available ? round(clamp(input.score as number)) : null,
    available,
    confidence: available ? round(clamp(input.confidence ?? 0, 0, 1), 2) : 0,
    weight,
  }
}

export function calculateSeoScores(input: SeoScoreInput): SeoScoreSnapshot {
  const components = {
    technical: normalizedComponent("technical", input.technical),
    organic: normalizedComponent("organic", input.organic),
    local: normalizedComponent("local", input.local),
    contentEntity: normalizedComponent("contentEntity", input.contentEntity),
    aiVisibility: normalizedComponent("aiVisibility", input.aiVisibility),
  } satisfies SeoScoreSnapshot["components"]

  const componentValues = Object.values(components)
  const availableWeight = componentValues
    .filter((component) => component.available)
    .reduce((sum, component) => sum + component.weight, 0)
  const weightedScore = componentValues.reduce(
    (sum, component) =>
      sum + (component.available ? (component.score ?? 0) * component.weight : 0),
    0,
  )
  const weightedConfidence = componentValues.reduce(
    (sum, component) =>
      sum + (component.available ? component.confidence * component.weight : 0),
    0,
  )

  return {
    formulaVersion: input.formulaVersion ?? "v1",
    weights: DEFAULT_SEO_SCORE_WEIGHTS,
    components,
    overall: availableWeight > 0 ? round(weightedScore / availableWeight) : null,
    coverage: round(availableWeight, 2),
    confidence: round(availableWeight > 0 ? weightedConfidence / availableWeight : 0, 2),
  }
}
