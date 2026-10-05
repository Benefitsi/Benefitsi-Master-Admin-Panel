import contract from "./generated/partner-visit-levels.json"
import { allPartnerCategories, normalizePartnerCategories, normalizePartnerCategory } from "./partner-categories"

export type VisitFrequency = "high" | "medium" | "low"
export const visitFrequencies: VisitFrequency[] = ["high", "medium", "low"]
export const visitFrequencyLabels: Record<VisitFrequency, string> = {
  high: "Hoch", medium: "Mittel", low: "Niedrig",
}
export type VisitLevelPartner = {
  id: string
  name: string | null
  category: string[] | null
  level_frequency: string | null
}

const aliases = contract.aliases as Record<string, VisitFrequency>

export function frequencyForValue(value: string | null | undefined): VisitFrequency {
  const key = value?.trim().toLowerCase() ?? ""
  return Object.hasOwn(aliases, key) ? aliases[key] : contract.defaultFrequency as VisitFrequency
}

export function hasConfiguredFrequency(value: string | null | undefined) {
  return Object.hasOwn(aliases, value?.trim().toLowerCase() ?? "")
}

export function getVisitLevelCategories(partners: VisitLevelPartner[]) {
  const categories = new Set(allPartnerCategories)
  for (const partner of partners) {
    const normalized = normalizePartnerCategories(partner.category)
    for (const category of normalized.length ? normalized : [""]) categories.add(category)
  }
  return [...categories].sort((a, b) => a.localeCompare(b, "de"))
}

export function summarizeCategoryFrequencies(partners: VisitLevelPartner[], category: string) {
  const normalizedCategory = normalizePartnerCategory(category) ?? ""
  const matching = partners.filter(partner => {
    const categories = normalizePartnerCategories(partner.category)
    return normalizedCategory ? categories.includes(normalizedCategory) : categories.length === 0
  })
  return visitFrequencies.map(frequency => {
    const configuredPartners = matching.filter(partner => frequencyForValue(partner.level_frequency) === frequency)
    return {
      frequency,
      partners: configuredPartners,
      fallbackCount: configuredPartners.filter(partner => !hasConfiguredFrequency(partner.level_frequency)).length,
    }
  }).filter(group => group.partners.length > 0)
}

export function levelRanges(frequency: VisitFrequency) {
  const levels = contract.scales[frequency]
  return levels.map((level, index) => ({
    ...level,
    maximumVisits: levels[index + 1] ? levels[index + 1].minimumVisits - 1 : null,
  }))
}

export function visitRangeLabel(minimum: number, maximum: number | null) {
  return maximum === null ? `ab ${minimum}` : maximum === minimum ? `${minimum}` : `${minimum}–${maximum}`
}

export function visitLevelsHref(category?: string, frequency?: VisitFrequency) {
  const query = new URLSearchParams()
  if (category !== undefined) query.set("category", normalizePartnerCategory(category) ?? "")
  if (frequency) query.set("frequency", frequency)
  return `/partners/visit-levels${query.size ? `?${query}` : ""}`
}
