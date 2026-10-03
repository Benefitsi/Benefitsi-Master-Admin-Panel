import registry from "../../ops/agent-runtime/profile-registry.json"
import { contractTimestampMs, type AgentProfile, type AgentScope } from "../agent-control"
import type { AgentControlData } from "../agent-control-data"
import type { AnalyticsDataQuality, AnalyticsMetricUnit, AnalyticsTimeSeries } from "../analytics/contracts"
import type { BusinessAnalyticsLoadResult } from "../analytics/loader"
import { formatAnalyticsValue, redactFinanceData } from "../analytics/normalize"

export type AgentSummary = {
  id: string
  name: string
  purpose: string
  scope: AgentScope
  model: string | null
  status: "ok" | "attention" | "unknown" | "stale"
  statusLabel: string
  mode: string
  cadence: string
  lastRunAt: string | null
  href: string
}

export type OverviewAnalytics = {
  state: BusinessAnalyticsLoadResult["state"]
  asOf: string | null
  kpis: {
    key: string
    label: string
    value: number | null
    formatted: string
    unit: AnalyticsMetricUnit
    quality: AnalyticsDataQuality
  }[]
  series: AnalyticsTimeSeries | null
  caveats: string[]
}

const agentDetails: Record<string, { name: string; href: string }> = {
  ben: { name: "Ben", href: "/automation" },
  "benefitsi-content": { name: "Content-Agent", href: "/partners" },
  "benefitsi-seo": { name: "SEO-Agent", href: "/seo" },
  "city-annweiler": { name: "Stadt-Agent Annweiler", href: "/city-operations" },
  "stamp-curator": { name: "Stempel-Kurator", href: "/city-pages" },
  studio: { name: "Studio", href: "/agents" },
  "benefitsi-menu": { name: "Menü-Agent", href: "/partners" },
}

function configuredAgent(id: string, purpose: string, mode = "Konfiguriert"): AgentSummary {
  const details = agentDetails[id]
  return {
    id, name: details?.name ?? id, purpose, scope: "benefitsi", model: null,
    status: "unknown", statusLabel: "Konfiguriert · Lauf unbekannt", mode,
    cadence: mode === "Auf Abruf" ? "Bei Bedarf" : "Takt nicht nachgewiesen",
    lastRunAt: null, href: details?.href ?? "/agents",
  }
}

/** Registry entries describe configured roles, never running processes. */
export function buildAgentSummaries(data: AgentControlData): AgentSummary[] {
  const summaries = new Map<string, AgentSummary>()
  for (const profile of registry.profiles.filter(item => item.scope === "benefitsi")) {
    const mode = profile.id === "benefitsi-content" ? "Auf Abruf"
      : profile.hermesJobIds.length || profile.launchdSchedules.length ? "Zeitplan konfiguriert" : "Konfiguriert"
    summaries.set(profile.id, configuredAgent(profile.id, profile.purpose, mode))
  }
  // The menu pipeline was added after the runtime registry. Its capability is
  // documented in docs/ai-menu-import.md; only a snapshot can prove a run.
  summaries.set("benefitsi-menu", configuredAgent(
    "benefitsi-menu",
    "Überträgt Speisekarten aus Fotos oder PDF in einen editierbaren Entwurf zur manuellen Bestätigung.",
    "Auf Abruf",
  ))

  if (data.cities.state === "available") {
    for (const city of data.cities.items) {
      for (const [id, purpose] of [
        [city.cityProfile, `Bereitet Quellen und Inhalte für ${city.cityName ?? "die zugeordnete Stadt"} vor.`],
        [city.orchestratorProfile, "Koordiniert die konfigurierten Stadtaufträge und deren Prüfung."],
      ]) {
        if (id && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id) && !summaries.has(id)) {
          const summary = configuredAgent(id, purpose ?? "Konfiguriertes Stadtprofil.")
          summary.href = "/city-operations"
          summaries.set(id, summary)
        }
      }
    }
  }

  if (data.runtime.state === "fresh" || data.runtime.state === "stale") {
    for (const profile of data.runtime.snapshot?.profiles ?? []) {
      const details = agentDetails[profile.id]
      const state = profileState(profile, data.runtime.state)
      const runTimes = profile.schedules.map(item => item.lastRunAt)
        .filter((value): value is string => validTimestamp(value) !== null)
        .filter(value => Date.parse(value) <= Date.parse(data.checkedAt) + 5 * 60 * 1000)
        .sort((left, right) => Date.parse(right) - Date.parse(left))
      summaries.set(profile.id, {
        id: profile.id, name: details?.name ?? profile.id, purpose: profile.purpose,
        scope: profile.scope, model: profile.model, ...state,
        mode: profile.automation === "scheduled" ? "Automatisch geplant" : profile.automation === "manual" ? "Auf Abruf" : "Planung unbekannt",
        cadence: profileCadence(profile), lastRunAt: runTimes[0] ?? null,
        href: details?.href ?? (profile.citySlug ? "/city-operations" : "/agents"),
      })
    }
  }
  return [...summaries.values()]
}

function profileState(profile: AgentProfile, freshness: "fresh" | "stale"): Pick<AgentSummary, "status" | "statusLabel"> {
  if (freshness === "stale") return { status: "stale", statusLabel: "Beobachtung veraltet" }
  if (profile.runtimeHealth === "failed") return { status: "attention", statusLabel: "Lauf fehlgeschlagen" }
  if (profile.contextHealth === "missing") return { status: "attention", statusLabel: "Kontextdatei fehlt" }
  if (profile.contextHealth === "over_limit") return { status: "attention", statusLabel: "Kontextlimit überschritten" }
  if (profile.runtimeHealth === "ok") return { status: "ok", statusLabel: "Letzter Lauf erfolgreich" }
  return { status: "unknown", statusLabel: "Kein aktueller Laufnachweis" }
}

function profileCadence(profile: AgentProfile) {
  const enabled = profile.schedules.filter(item => item.enabled === true)
  const cadences = [...new Set(enabled.map(item => item.cadence).filter((value): value is string => Boolean(value)))]
  if (cadences.length) return cadences.join(" · ")
  if (profile.schedules.length && profile.schedules.every(item => item.enabled === false)) return "Zeitpläne deaktiviert"
  if (profile.automation === "manual" && !profile.schedules.length) return "Bei Bedarf"
  return "Takt nicht nachgewiesen"
}

/** Compact only the permission-filtered analytics contract; never estimate gaps. */
export function selectOverviewAnalytics(result: BusinessAnalyticsLoadResult): OverviewAnalytics {
  if (!("payload" in result)) return emptyAnalytics(result.state)
  if (!result.permissions.businessAnalyticsRead) return emptyAnalytics("forbidden")

  const payload = result.permissions.financeRead ? result.payload : redactFinanceData(result.payload)
  const sections = [payload.sections.overview, payload.sections.engagement]
  const uniqueKpis = new Map(sections.flatMap(section => section.kpis).map(item => [item.key, item]))
  const selectedKpis = [...uniqueKpis.values()].slice(0, 4)
  const kpis = selectedKpis.map(item => {
    const value = item.availability === "not_measurable" ? null : finiteValue(item.value)
    return {
      key: item.key, label: item.label, value,
      formatted: formatAnalyticsValue(value, item.unit, item.formattedValue),
      unit: item.unit, quality: value === null ? "missing" as const : item.quality,
    }
  })
  const candidates = sections.flatMap(section => section.series).map(item => ({
    ...item,
    points: item.points.map(point => ({
      ...point, value: finiteValue(point.value), comparisonValue: finiteValue(point.comparisonValue),
    })),
  }))
  const series = candidates.find(item => item.points.some(point => point.value !== null)) ?? null
  const caveats = [...new Set([...payload.caveats, ...sections.flatMap(section => section.caveats)])]
  if (payload.freshness.status === "stale") caveats.push("Der Datenstand ist veraltet.")
  if (payload.freshness.status === "missing") caveats.push("Ein aktueller Datenstand ist nicht nachgewiesen.")
  if (payload.freshness.status === "partial") caveats.push("Die Datenquellen sind nur teilweise aktuell oder verfügbar.")

  return {
    state: result.state,
    asOf: validTimestamp(payload.freshness.asOf) ?? validTimestamp(series?.asOf ?? null)
      ?? selectedKpis.map(item => validTimestamp(item.asOf)).find(value => value !== null) ?? null,
    kpis, series, caveats,
  }
}

function emptyAnalytics(state: OverviewAnalytics["state"]): OverviewAnalytics {
  return { state, asOf: null, kpis: [], series: null, caveats: [] }
}

function finiteValue(value: number | null) { return typeof value === "number" && Number.isFinite(value) ? value : null }
function validTimestamp(value: string | null) { return contractTimestampMs(value) === null ? null : value }
