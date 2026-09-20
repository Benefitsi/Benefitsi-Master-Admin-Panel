/** Editorial evidence is a draft input, never an authorization to publish. */
export type GuideEditorBlock = {
  id: string
  blockType: string
  sortOrder: number
  title?: string
  subtitle?: string
  text?: string
  items?: string[]
  relationIds?: string[]
  guideIds?: string[]
  quickFacts?: Record<string, unknown>[]
  timeline?: Record<string, unknown>[]
}
export type GuideSourceEvidence = {
  sourceType: "PRIMARY" | "TRUSTED_SECONDARY" | "INTERNAL"
  sourceUrl?: string
  sourceUpdatedAt?: string
  lastVerifiedAt: string
  confidence: "low" | "medium" | "high"
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "NEEDS_REVIEW" | "STALE"
  freshnessTtlDays: number
}
const blockTypes = new Set(["INTRO", "QUICK_FACTS", "TIMELINE", "ENTITY_CARDS", "PLACE_COLLECTION", "ROUTE_COLLECTION", "EVENT_COLLECTION", "MAP", "TEXT", "TIP", "INFO", "WARNING", "BENEFITSI", "STAMP", "DOWNLOAD", "RELATED_GUIDES", "FAQ", "CTA"])
function invalid(): never { throw new Error("invalid_guide_content") }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid()
}
function text(value: unknown, max: number, required = false): asserts value is string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid()
  // Guide text is Markdown text, not HTML. Link destinations are validated even
  // though the public renderer independently rejects dangerous protocols.
  if (/<\/?[a-z][^>]*>/i.test(value)) invalid()
  for (const match of value.matchAll(/!?\[[^\]]*\]\(\s*<?([^\s)>]+)/g)) {
    if (!safeGuideLink(match[1])) invalid()
  }
}
export function safeGuideLink(value: string) {
  if (/[\s\\\u0000-\u001f]/.test(value)) return false
  if (/^\/(?!\/)/.test(value)) return true
  try { return ["https:", "http:"].includes(new URL(value).protocol) } catch { return false }
}
function list(value: unknown, max = 80) {
  if (!Array.isArray(value) || value.length > max) invalid()
  value.forEach(item => text(item, 2000, true))
}
function timestamp(value: unknown) {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) || Number.isNaN(Date.parse(value))) invalid()
  if (value.length === 10 && new Date(value).toISOString().slice(0, 10) !== value) invalid()
}
export function parseGuideBlocks(raw: unknown): GuideEditorBlock[] {
  if (typeof raw !== "string" || raw.length > 180000) invalid()
  const value: unknown = JSON.parse(raw || "[]")
  if (!Array.isArray(value) || value.length > 60) invalid()
  const ids = new Set<string>()
  for (const candidate of value) {
    const block = object(candidate)
    keys(block, ["id", "blockType", "sortOrder", "title", "subtitle", "text", "items", "relationIds", "guideIds", "quickFacts", "timeline"])
    text(block.id, 120, true)
    if (ids.has(block.id)) invalid()
    ids.add(block.id)
    if (typeof block.blockType !== "string" || !blockTypes.has(block.blockType) || !Number.isInteger(block.sortOrder) || Number(block.sortOrder) < 0 || Number(block.sortOrder) > 9999) invalid()
    for (const key of ["title", "subtitle", "text"]) if (key in block) text(block[key], key === "text" ? 20000 : 500)
    for (const key of ["items", "relationIds", "guideIds"]) if (key in block) list(block[key])
    if ("quickFacts" in block) {
      if (!Array.isArray(block.quickFacts) || block.quickFacts.length > 30) invalid()
      for (const candidate of block.quickFacts) {
        const fact = object(candidate)
        keys(fact, ["label", "value", "icon"])
        text(fact.label, 200, true); text(fact.value, 1000, true)
        if ("icon" in fact && !["type", "duration", "audience", "highlights", "route", "benefits"].includes(String(fact.icon))) invalid()
      }
    }
    if ("timeline" in block) {
      if (!Array.isArray(block.timeline) || block.timeline.length > 30) invalid()
      for (const candidate of block.timeline) {
        const step = object(candidate)
        keys(step, ["id", "period", "label", "startTime", "endTime", "timePrecision", "title", "description", "relationIds"])
        text(step.id, 120, true); text(step.label, 500, true); text(step.title, 500, true); text(step.description, 5000)
        if (!["MORNING", "LATE_MORNING", "LUNCH", "AFTERNOON", "EVENING"].includes(String(step.period))) invalid()
        if ("timePrecision" in step && !["EXACT", "APPROXIMATE", "FLEXIBLE"].includes(String(step.timePrecision))) invalid()
        for (const key of ["startTime", "endTime"]) if (key in step && (typeof step[key] !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(step[key])))) invalid()
        list(step.relationIds)
      }
    }
  }
  return value as GuideEditorBlock[]
}
export function parseGuideSourceEvidence(raw: unknown): GuideSourceEvidence | Record<string, never> {
  if (typeof raw !== "string" || raw.length > 6000) invalid()
  const value = object(JSON.parse(raw || "{}"))
  if (!Object.keys(value).length) return {}
  keys(value, ["sourceType", "sourceUrl", "sourceUpdatedAt", "lastVerifiedAt", "confidence", "verificationStatus", "freshnessTtlDays"])
  if (!["PRIMARY", "TRUSTED_SECONDARY", "INTERNAL"].includes(String(value.sourceType)) || !["low", "medium", "high"].includes(String(value.confidence)) || !["UNVERIFIED", "VERIFIED", "NEEDS_REVIEW", "STALE"].includes(String(value.verificationStatus))) invalid()
  if ("sourceUrl" in value && (typeof value.sourceUrl !== "string" || value.sourceUrl.length > 2000 || !/^https?:\/\//.test(value.sourceUrl) || !safeGuideLink(value.sourceUrl))) invalid()
  timestamp(value.lastVerifiedAt)
  if ("sourceUpdatedAt" in value) timestamp(value.sourceUpdatedAt)
  if (!Number.isInteger(value.freshnessTtlDays) || Number(value.freshnessTtlDays) < 1 || Number(value.freshnessTtlDays) > 3650) invalid()
  return { ...value, verificationStatus: "NEEDS_REVIEW" } as GuideSourceEvidence
}
