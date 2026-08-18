import {
  cityAgentModuleKeys,
  isCityAgentModuleKey,
  type CityAgentContentType,
  type CityAgentModuleKey,
  type CityAgentRiskLevel,
  type CityAgentSourceRow,
} from "./contracts"

export type CityAgentModuleDefinition = {
  key: CityAgentModuleKey
  label: string
  description: string
  cadenceMinutes: number
  priority: number
  defaultRisk: CityAgentRiskLevel
  outputTypes: CityAgentContentType[]
  sourceKeywords: string[]
  publishableInGuardedAuto: boolean
}

export const cityAgentModules: CityAgentModuleDefinition[] = [
  { key: "event", label: "Event Agent", description: "Entdeckt und vergleicht lokale Termine, Zeiten, Orte und Absagen.", cadenceMinutes: 360, priority: 80, defaultRisk: "high", outputTypes: ["city_event"], sourceKeywords: ["event", "veranstaltung", "markt", "calendar"], publishableInGuardedAuto: false },
  { key: "news", label: "News Agent", description: "Beobachtet kommunale Meldungen, Verkehr, Baustellen und wichtige Hinweise.", cadenceMinutes: 480, priority: 70, defaultRisk: "medium", outputTypes: ["city_guide", "city_newsletter"], sourceKeywords: ["news", "aktuell", "presse", "service", "notice"], publishableInGuardedAuto: false },
  { key: "discovery", label: "Discovery Agent", description: "Findet neue Orte und prüft sie gegen bestehende Entities und Geodaten.", cadenceMinutes: 1440, priority: 50, defaultRisk: "medium", outputTypes: ["city_place", "city_playground"], sourceKeywords: ["place", "sight", "tourism", "discovery"], publishableInGuardedAuto: false },
  { key: "business", label: "Business Agent", description: "Überwacht öffentliche Betriebsinformationen ohne vorschnelle Schließungsentscheidungen.", cadenceMinutes: 1440, priority: 60, defaultRisk: "high", outputTypes: ["city_partner_benefit"], sourceKeywords: ["business", "partner", "restaurant", "shop"], publishableInGuardedAuto: false },
  { key: "freshness", label: "Freshness Agent", description: "Ermittelt fällige Fakten anhand von TTL, Verifikation und Quellenalter.", cadenceMinutes: 1440, priority: 55, defaultRisk: "medium", outputTypes: ["city_place", "city_event", "city_route", "city_guide"], sourceKeywords: ["freshness", "verify", "opening", "price"], publishableInGuardedAuto: false },
  { key: "route", label: "Route Agent", description: "Prüft Routen, Geometrien, Sperrungen, Start/Ziel und Wegehinweise.", cadenceMinutes: 1440, priority: 60, defaultRisk: "high", outputTypes: ["city_route"], sourceKeywords: ["route", "trail", "wandern", "gpx", "outdoor"], publishableInGuardedAuto: false },
  { key: "seo_opportunity", label: "SEO Opportunity Agent", description: "Findet Suchintents und Content-Gaps, bevor neue URLs vorgeschlagen werden.", cadenceMinutes: 720, priority: 40, defaultRisk: "medium", outputTypes: ["city_guide", "city_event", "city_place"], sourceKeywords: ["seo", "search", "intent", "content"], publishableInGuardedAuto: false },
  { key: "editorial", label: "Editorial Agent", description: "Erstellt quellengebundene redaktionelle Entwürfe ohne erfundene Fakten.", cadenceMinutes: 1440, priority: 35, defaultRisk: "medium", outputTypes: ["city_guide", "city_newsletter"], sourceKeywords: ["editorial", "guide", "blog", "history"], publishableInGuardedAuto: false },
  { key: "media", label: "Media Agent", description: "Erkennt fehlende, schwache, falsche oder doppelte Medien; kopiert keine fremden Bilder.", cadenceMinutes: 1440, priority: 30, defaultRisk: "high", outputTypes: ["city_place", "city_event", "city_route", "city_guide"], sourceKeywords: ["media", "image", "photo", "commons"], publishableInGuardedAuto: false },
  { key: "qa", label: "QA Agent", description: "Kontrolliert Links, Canonicals, JSON-LD, Medien, Relations, 404 und Public Resolver.", cadenceMinutes: 1440, priority: 90, defaultRisk: "high", outputTypes: ["city_place", "city_event", "city_route", "city_guide"], sourceKeywords: ["qa", "quality", "canonical", "jsonld"], publishableInGuardedAuto: false },
  { key: "content_gap", label: "Content Gap Review", description: "Ordnet fehlende Informationen nach Suchwert und lokalem Nutzwert.", cadenceMinutes: 1440, priority: 35, defaultRisk: "medium", outputTypes: ["city_guide", "city_event", "city_place"], sourceKeywords: ["content-gap", "gap"], publishableInGuardedAuto: false },
  { key: "event_seo", label: "Event SEO Review", description: "Prüft Informationsbedarf rund um große und wiederkehrende Events.", cadenceMinutes: 1440, priority: 45, defaultRisk: "medium", outputTypes: ["city_event", "city_guide"], sourceKeywords: ["event-seo"], publishableInGuardedAuto: false },
  { key: "editorial_queue", label: "Editorial Queue Review", description: "Priorisiert bestehende Seiten, Guides, FAQs und interne Verlinkung.", cadenceMinutes: 1440, priority: 35, defaultRisk: "medium", outputTypes: ["city_guide"], sourceKeywords: ["editorial-queue"], publishableInGuardedAuto: false },
  { key: "full_seo", label: "Full SEO Review", description: "Wöchentlicher ganzheitlicher SEO- und Kannibalisierungscheck.", cadenceMinutes: 10080, priority: 30, defaultRisk: "medium", outputTypes: ["city_guide", "city_event", "city_place"], sourceKeywords: ["full-seo"], publishableInGuardedAuto: false },
  { key: "full_city_audit", label: "Full City Audit", description: "Wöchentlicher End-to-End-Audit über Quellen, Content, Public QA und Freshness.", cadenceMinutes: 10080, priority: 95, defaultRisk: "high", outputTypes: ["city_place", "city_event", "city_route", "city_guide"], sourceKeywords: ["full-audit"], publishableInGuardedAuto: false },
  { key: "evergreen_deep_recheck", label: "Evergreen Deep Recheck", description: "Monatliche Tiefenprüfung historischer und dauerhaft relevanter Inhalte.", cadenceMinutes: 43200, priority: 25, defaultRisk: "medium", outputTypes: ["city_place", "city_route", "city_guide"], sourceKeywords: ["evergreen"], publishableInGuardedAuto: false },
]

const modulesByKey = new Map(cityAgentModules.map((module) => [module.key, module]))

export function getCityAgentModule(key: unknown) {
  return isCityAgentModuleKey(key) ? modulesByKey.get(key) ?? null : null
}

export function getCityAgentModuleDefinitions() {
  return cityAgentModuleKeys.map((key) => modulesByKey.get(key)!).filter(Boolean)
}

export function moduleForSource(source: Pick<CityAgentSourceRow, "slug" | "parser_config" | "content_scope">): CityAgentModuleKey {
  const configured = source.parser_config.agentModule
  if (isCityAgentModuleKey(configured)) return configured

  const haystack = [source.slug, ...Object.keys(source.content_scope), ...Object.values(source.content_scope).filter((value): value is string => typeof value === "string")]
    .join(" ")
    .toLowerCase()
  if (/(event|veranstaltung|calendar|markt)/.test(haystack)) return "event"
  if (/(presse|aktuell|service|notice|news|verkehr|baustell)/.test(haystack)) return "news"
  if (/(business|partner|restaurant|shop)/.test(haystack)) return "business"
  if (/(route|trail|wandern|gpx|outdoor)/.test(haystack)) return "route"
  if (/(image|media|photo|commons)/.test(haystack)) return "media"
  if (/(history|histor|wiki)/.test(haystack)) return "editorial"
  return "discovery"
}

export function sourceBelongsToModule(source: Pick<CityAgentSourceRow, "slug" | "parser_config" | "content_scope">, moduleKey?: CityAgentModuleKey) {
  if (!moduleKey || ["full_city_audit", "full_seo", "evergreen_deep_recheck"].includes(moduleKey)) return true
  const configured = source.parser_config.agentModule
  if (isCityAgentModuleKey(configured)) return configured === moduleKey
  return moduleForSource(source) === moduleKey
}
