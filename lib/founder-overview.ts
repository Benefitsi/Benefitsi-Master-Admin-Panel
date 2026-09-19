export type FounderCount = { value: number | null; unavailable: boolean }
export type FounderSnapshot = {
  checkedAt: string
  activePartners: FounderCount
  failedJobs: FounderCount
  pendingReviews: FounderCount
  overdueSources: FounderCount
  cityRun: { status: string; finishedAt: string | null } | null
  cityRunUnavailable: boolean
  pipeline?: { technicalOk: boolean | null; lastRunAt: string | null; researchCheckedAt: string | null } | null
}
export type FounderAction = { id: string; title: string; detail: string; href: string; priority: number }

export function normalizeFounderCount(result: { count: number | null; error: unknown }): FounderCount {
  const valid = !result.error && result.count !== null &&
    Number.isSafeInteger(result.count) && result.count >= 0
  return { value: valid ? result.count : null, unavailable: !valid }
}
export function founderActions(snapshot: FounderSnapshot): FounderAction[] {
  const actions: FounderAction[] = []
  if ([snapshot.activePartners, snapshot.failedJobs, snapshot.pendingReviews, snapshot.overdueSources].some(item => item.unavailable)) {
    actions.push({ id: "source-gap", title: "Fehlende Datenverbindung prüfen", detail: "Mindestens eine Betriebsquelle konnte nicht gelesen werden. Unbekannte Werte sind keine Nullwerte.", href: "/system", priority: 0 })
  }
  if ((snapshot.failedJobs.value ?? 0) > 0) {
    actions.push({ id: "failed-jobs", title: "Fehlgeschlagene Aufträge prüfen", detail: `${snapshot.failedJobs.value} Aufträge haben den Status fehlgeschlagen. Ursache prüfen, bevor ein Auftrag erneut startet.`, href: "/automation", priority: 1 })
  }
  const pipeline = pipelineHealth(snapshot)
  if (pipeline === "failed" || pipeline === "stale") {
    actions.push({ id: "pipeline", title: "M1-Stadtpipeline prüfen", detail: pipeline === "failed" ? "Der technische Status meldet einen Fehler." : "Heartbeat oder zugrunde liegende Recherche ist älter als 48 Stunden.", href: "/system", priority: 1 })
  }
  const health = cityRunHealth(snapshot)
  if (health === "failed") {
    actions.push({ id: "city-failed", title: "City-Lauf prüfen", detail: "Der letzte erfasste City-Lauf meldet einen Fehler oder ein unvollständiges Ergebnis.", href: "/automation", priority: 1 })
  }
  if ((snapshot.pendingReviews.value ?? 0) > 0) {
    actions.push({ id: "reviews", title: "Aufträge zur Prüfung öffnen", detail: `${snapshot.pendingReviews.value} Aufträge benötigen eine menschliche Entscheidung.`, href: "/automation", priority: 2 })
  }
  if ((snapshot.overdueSources.value ?? 0) > 0) {
    actions.push({ id: "sources", title: "Fällige Stadtquellen prüfen", detail: `${snapshot.overdueSources.value} aktive Quellen haben ihren nächsten Prüftermin überschritten.`, href: "/city-operations", priority: 3 })
  }
  if (health === "stale" || health === "unknown") {
    actions.push({ id: "city-freshness", title: "City-Laufnachweis aktualisieren", detail: health === "stale" ? "Der letzte erfolgreiche Lauf liegt über 48 Stunden zurück. Rhythmus und fachliches Ergebnis prüfen." : "Ein aktueller abgeschlossener City-Lauf ist nicht nachgewiesen.", href: "/automation", priority: 4 })
  }
  actions.push({ id: "partner-preparation", title: "Nächsten Partner vorbereiten", detail: "Daten, Angebot, Medienrechte und Mitarbeiterablauf prüfen. Ein Profil ist noch keine bestätigte Partnerschaft.", href: "/#partners", priority: 5 })
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 3)
}
export function cityRunHealth(snapshot: FounderSnapshot): "ok" | "failed" | "stale" | "unknown" {
  if (snapshot.cityRunUnavailable || !snapshot.cityRun) return "unknown"
  const run = snapshot.cityRun
  if (run.status === "failed" || run.status === "partial") return "failed"
  if (run.status !== "succeeded" || !run.finishedAt) return "unknown"
  const age = Date.parse(snapshot.checkedAt) - Date.parse(run.finishedAt)
  if (!Number.isFinite(age) || age < 0) return "unknown"
  return age > 48 * 60 * 60 * 1000 ? "stale" : "ok"
}

export function pipelineHealth(snapshot: FounderSnapshot): "ok" | "failed" | "stale" | "unknown" {
  const pipeline = snapshot.pipeline
  if (!pipeline || pipeline.technicalOk === null) return "unknown"
  if (!pipeline.technicalOk) return "failed"
  const ages = [pipeline.lastRunAt, pipeline.researchCheckedAt].map(value =>
    value ? Date.parse(snapshot.checkedAt) - Date.parse(value) : NaN)
  if (ages.some(age => !Number.isFinite(age) || age < 0)) return "unknown"
  return ages.some(age => age > 48 * 60 * 60 * 1000) ? "stale" : "ok"
}
