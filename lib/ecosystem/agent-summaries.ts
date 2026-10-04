import registry from "../../ops/agent-runtime/profile-registry.json"
import { contractTimestampMs, type AgentProfile, type AgentScope } from "../agent-control"
import type { AgentControlData } from "../agent-control-data"

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
  evidence: "observed" | "configured"
  observedAt: string | null
  freshness: "fresh" | "stale" | "invalid" | "unavailable" | "unobserved"
  freshnessLabel: string
  lastRunAt: string | null
  lastRunStatus: "succeeded" | "failed" | "idle" | "partial" | "unknown"
  lastRunLabel: string
  lastRunScheduleId: string | null
  href: string
  workspaceHref: string | null
}

const MAX_FUTURE_MS = 5 * 60 * 1000
const STALE_AFTER_MS = 90 * 60 * 1000
const isProfileId = (id: string) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id)
const agentDetails: Record<string, { name: string; workspaceHref: string }> = {
  ben: { name: "Ben", workspaceHref: "/automation" },
  "benefitsi-content": { name: "Content-Agent", workspaceHref: "/partners" },
  "benefitsi-seo": { name: "SEO-Agent", workspaceHref: "/seo" },
  "city-annweiler": { name: "Stadt-Agent Annweiler", workspaceHref: "/city-operations" },
  "stamp-curator": { name: "Stempel-Kurator", workspaceHref: "/city-pages" },
  studio: { name: "Studio", workspaceHref: "/agents" },
  "benefitsi-menu": { name: "Menü-Agent", workspaceHref: "/partners" },
  "benefitsi-finance": { name: "Buchhaltung & Steuern", workspaceHref: "/analytics" },
}

export function agentProfileAnchor(id: string): string | null {
  return isProfileId(id) ? `agent-${id}` : null
}

export function agentProfileHref(id: string) {
  const anchor = agentProfileAnchor(id)
  return anchor ? `/agents?agent=${encodeURIComponent(id)}#${anchor}` : "/agents"
}

function configuredAgent(id: string, purpose: string, freshness: AgentSummary["freshness"], mode = "Konfiguriert"): AgentSummary {
  const details = agentDetails[id]
  return {
    id, name: details?.name ?? id, purpose, scope: "benefitsi", model: null,
    status: "unknown", statusLabel: "Konfiguriert · Lauf unbekannt", mode,
    cadence: mode === "Auf Abruf" ? "Bei Bedarf" : "Takt nicht nachgewiesen",
    evidence: "configured", observedAt: null, freshness, freshnessLabel: freshnessLabel(freshness),
    lastRunAt: null, lastRunStatus: "unknown", lastRunLabel: "Kein Laufnachweis", lastRunScheduleId: null,
    href: agentProfileHref(id), workspaceHref: details?.workspaceHref ?? null,
  }
}

/** Configuration, observation age and the last dated outcome are independent evidence. */
export function buildAgentSummaries(data: AgentControlData): AgentSummary[] {
  const freshness = runtimeFreshness(data)
  const configuredFreshness = freshness === "fresh" || freshness === "stale" ? "unobserved" : freshness
  const summaries = new Map<string, AgentSummary>()
  for (const profile of registry.profiles.filter(item => item.scope === "benefitsi")) {
    const mode = profile.id === "benefitsi-content" ? "Auf Abruf"
      : profile.hermesJobIds.length || profile.launchdSchedules.length ? "Zeitplan konfiguriert" : "Konfiguriert"
    summaries.set(profile.id, configuredAgent(profile.id, profile.purpose, configuredFreshness, mode))
  }
  // docs/ai-menu-import.md documents this on-demand capability. The registry
  // predates it; neither configuration nor its documented model proves a run.
  summaries.set("benefitsi-menu", configuredAgent(
    "benefitsi-menu",
    "Überträgt Speisekarten aus Fotos oder PDF in einen editierbaren Entwurf zur manuellen Bestätigung.",
    configuredFreshness,
    "Auf Abruf",
  ))

  if (data.cities.state === "available") {
    for (const city of data.cities.items) {
      for (const [id, purpose] of [
        [city.cityProfile, `Bereitet Quellen und Inhalte für ${city.cityName ?? "die zugeordnete Stadt"} vor.`],
        [city.orchestratorProfile, "Koordiniert die konfigurierten Stadtaufträge und deren Prüfung."],
      ]) {
        if (id && isProfileId(id) && !summaries.has(id)) {
          const summary = configuredAgent(id, purpose ?? "Konfiguriertes Stadtprofil.", configuredFreshness)
          summary.workspaceHref = "/city-operations"
          summaries.set(id, summary)
        }
      }
    }
  }

  if (freshness === "fresh" || freshness === "stale") {
    for (const profile of data.runtime.snapshot?.profiles ?? []) {
      if (!isProfileId(profile.id)) continue
      const configured = summaries.get(profile.id)
      const details = agentDetails[profile.id]
      const lastRun = lastObservedRun(profile, data)
      summaries.set(profile.id, {
        id: profile.id, name: details?.name ?? profile.id, purpose: configured?.purpose ?? profile.purpose,
        scope: profile.scope, model: profile.model, ...profileState(profile, freshness, lastRun.lastRunStatus),
        mode: profile.automation === "scheduled" ? "Automatisch geplant" : profile.automation === "manual" ? "Auf Abruf" : "Planung unbekannt",
        cadence: profileCadence(profile), evidence: "observed", observedAt: data.runtime.snapshot!.observedAt,
        freshness, freshnessLabel: freshnessLabel(freshness), ...lastRun,
        href: agentProfileHref(profile.id),
        workspaceHref: configured?.workspaceHref ?? (profile.citySlug ? "/city-operations" : null),
      })
    }
  }
  return [...summaries.values()]
}

function runtimeFreshness(data: AgentControlData): Exclude<AgentSummary["freshness"], "unobserved"> {
  if (data.runtime.state === "invalid" || data.runtime.state === "unavailable") return data.runtime.state
  const observed = contractTimestampMs(data.runtime.snapshot?.observedAt)
  const checked = contractTimestampMs(data.checkedAt)
  if (observed === null || checked === null || observed > checked + MAX_FUTURE_MS) return "invalid"
  return data.runtime.state === "stale" || checked - observed > STALE_AFTER_MS ? "stale" : "fresh"
}

function freshnessLabel(value: AgentSummary["freshness"]) {
  return value === "fresh" ? "Beobachtung aktuell" : value === "stale" ? "Beobachtung veraltet"
    : value === "invalid" ? "Beobachtung nicht auswertbar" : value === "unavailable" ? "Beobachtung nicht verfügbar"
      : "Nicht im Snapshot beobachtet"
}

function lastObservedRun(profile: AgentProfile, data: AgentControlData): Pick<AgentSummary, "lastRunAt" | "lastRunStatus" | "lastRunLabel" | "lastRunScheduleId"> {
  const checked = contractTimestampMs(data.checkedAt)
  const observed = contractTimestampMs(data.runtime.snapshot?.observedAt)
  const latest = checked === null || observed === null ? undefined : profile.schedules
    .filter(schedule => {
      const at = contractTimestampMs(schedule.lastRunAt)
      return at !== null && at <= Math.min(checked, observed) + MAX_FUTURE_MS
    })
    .sort((left, right) => Date.parse(right.lastRunAt!) - Date.parse(left.lastRunAt!))[0]
  if (!latest) return { lastRunAt: null, lastRunStatus: "unknown", lastRunLabel: "Kein Laufnachweis", lastRunScheduleId: null }
  const status = latest.lastStatus?.toLowerCase()
  const lastRunStatus = status === "ok" || status === "succeeded" ? "succeeded"
    : status === "failed" || status === "error" ? "failed" : status === "queue_empty" ? "idle"
      : status === "partial" ? "partial" : "unknown"
  const lastRunLabel = lastRunStatus === "succeeded" ? "Letzter beobachteter Lauf erfolgreich"
    : lastRunStatus === "failed" ? "Letzter beobachteter Lauf fehlgeschlagen"
      : lastRunStatus === "idle" ? "Letzter beobachteter Lauf: Leerlauf"
        : lastRunStatus === "partial" ? "Teilweise abgeschlossen" : "Ergebnis des letzten Laufs nicht nachgewiesen"
  return { lastRunAt: latest.lastRunAt, lastRunStatus, lastRunLabel, lastRunScheduleId: latest.id }
}

function profileState(profile: AgentProfile, freshness: "fresh" | "stale", lastRun: AgentSummary["lastRunStatus"]): Pick<AgentSummary, "status" | "statusLabel"> {
  if (freshness === "stale") return { status: "stale", statusLabel: "Beobachtung veraltet" }
  if (lastRun === "failed") return { status: "attention", statusLabel: "Letzter beobachteter Lauf fehlgeschlagen" }
  if (profile.runtimeHealth === "failed") return { status: "attention", statusLabel: "Lauffehler beobachtet" }
  if (profile.contextHealth === "missing") return { status: "attention", statusLabel: "Kontextdatei fehlt" }
  if (profile.contextHealth === "over_limit") return { status: "attention", statusLabel: "Kontextlimit überschritten" }
  if (profile.runtimeHealth === "ok" && (lastRun === "succeeded" || lastRun === "idle")) return { status: "ok", statusLabel: lastRun === "idle" ? "Leerlauf beobachtet" : "Letzter Lauf erfolgreich" }
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
