import { ecosystemCatalog, tierCatalog } from "./catalog"
import type { AgentSummary } from "./agent-summaries"
import type { EcosystemPage } from "./directory"

export type EcosystemSearchEntry = {
  id: string
  title: string
  description: string
  href: string
  publicHref?: string | null
  kind: "area" | "feature" | "tier" | "agent" | "page"
}

const areas = [
  ["Übersicht", "Kennzahlen, Aufgaben, Ziele und Ecosystem", "/"],
  ["Partner", "Profile, Angebote, Deals und Microsites verwalten", "/partners"],
  ["Stadtportale", "Städte, Orte und Entdeckerstempel", "/city-pages"],
  ["Prüfung & Freigaben", "Stadtquellen, Inhalte und City-Operationen", "/city-operations"],
  ["Magazin", "Artikel und Redaktion", "/editorial"],
  ["Medien", "Bilder und Medienbibliothek", "/media"],
  ["Wissen", "Dokumentation und Wissensquellen", "/wissen"],
  ["Buchungen", "Reservierungen und Termine", "/bookings"],
  ["Essensbestellungen", "Online-Bestellungen und Abholung", "/commerce"],
  ["Agentenübersicht", "Agents, Modelle und Laufnachweise", "/agents"],
  ["Aufträge & Abläufe", "Automation, Fehler und menschliche Freigaben", "/automation"],
  ["Geschäftszahlen", "Analytics, Statistik und Auswertung", "/analytics"],
  ["SEO & Sichtbarkeit", "Suchmaschinen und technische Prüfungen", "/seo"],
  ["System", "Integrationen und Betriebsstatus", "/system"],
] as const

export const baseSearchEntries: EcosystemSearchEntry[] = [
  ...areas.map(([title, description, href]) => ({ id: `area:${href}`, title, description, href, kind: "area" as const })),
  ...ecosystemCatalog.map(entry => ({
    id: `feature:${entry.id}`, title: entry.title,
    description: `${entry.description} · ${entry.audience} · ${entry.availability}`,
    href: entry.href, kind: "feature" as const,
  })),
  ...tierCatalog.map(tier => ({
    id: `tier:${tier.id}`, title: `${tier.audience} ${tier.name}`,
    description: tier.description, href: tier.href, kind: "tier" as const,
  })),
]

export function agentSearchEntries(agents: Pick<AgentSummary, "id" | "name" | "purpose" | "href">[]): EcosystemSearchEntry[] {
  return agents.map(agent => ({
    id: `agent:${agent.id}`, title: agent.name, description: agent.purpose,
    href: agent.href, kind: "agent",
  }))
}

export function pageSearchEntries(pages: EcosystemPage[]): EcosystemSearchEntry[] {
  return pages.map(page => ({
    id: `page:${page.id}`, title: page.title,
    description: `${page.kind} · ${page.description} · ${page.status}`,
    href: page.adminHref, publicHref: page.href, kind: "page",
  }))
}

function normalized(value: string) {
  return value.toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss")
}

/** Search only the authenticated page's existing catalog and loaded inventory. */
export function searchEcosystem(entries: EcosystemSearchEntry[], query: string): EcosystemSearchEntry[] {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return entries.map((entry, index) => {
    const title = normalized(entry.title)
    const content = `${title} ${normalized(entry.description)}`
    return { entry, index, matches: words.every(word => content.includes(word)), score: words.reduce((sum, word) => sum + (title.startsWith(word) ? 3 : title.includes(word) ? 2 : 0), 0) }
  }).filter(item => item.matches)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.entry)
}
