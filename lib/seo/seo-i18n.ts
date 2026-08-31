type FindingLike = {
  category?: string | null
  severity?: string | null
  status?: string | null
  evidence_class?: string | null
  title?: string | null
  description?: string | null
  recommendation?: string | null
}

type ExperimentLike = {
  experiment_type?: string | null
  hypothesis?: string | null
  target_metric?: string | null
  status?: string | null
  rollback_note?: string | null
}

export type LocalizedFinding = {
  category: string
  severity: string
  status: string
  evidenceClass: string
  title: string
  description: string
  recommendation: string
}

export type LocalizedExperiment = {
  type: string
  hypothesis: string
  targetMetric: string
  status: string
  rollbackNote: string
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technik",
  organic: "Organisch",
  local: "Lokal",
  local_maps: "Lokal / Maps",
  content_entity: "Inhalt & Entität",
  ai_visibility: "AI-Sichtbarkeit",
  backlinks: "Backlinks",
  schema: "Strukturierte Daten",
  sitemap: "Sitemap",
  geo: "GEO",
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  domain: "Domain",
  city_page: "Stadtseite",
  partner_microsite: "Partner-Microsite",
  partner_microsite_page: "Partner-Microsite",
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Kritisch",
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
  info: "Info",
}

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  accepted: "Angenommen",
  resolved: "Behoben",
  experimental: "Experimentell",
  draft: "Entwurf",
  running: "Läuft",
  completed: "Abgeschlossen",
  partial: "Teilweise",
  failed: "Fehlgeschlagen",
  agent_completed: "Agent abgeschlossen",
  needs_human: "Menschliche Prüfung",
  cancelled: "Abgebrochen",
}

const EVIDENCE_LABELS: Record<string, string> = {
  verified: "Verifiziert",
  plausible: "Plausibel",
  experimental: "Experimentell",
  unsupported: "Nicht belegt",
}

const EXPERIMENT_TYPE_LABELS: Record<string, string> = {
  citation_probe: "Zitierbarkeitstest",
  answer_first: "Antwort-zuerst-Test",
  source_citation_block: "Quellenblock-Test",
  llms_txt_probe: "llms.txt-Test",
}

const METRIC_LABELS: Record<string, string> = {
  "AI citation rate": "AI-Zitierrate",
  "AI mention rate": "AI-Erwähnungsrate",
  "organic visibility": "Organische Sichtbarkeit",
  "local visibility": "Lokale Sichtbarkeit",
  "rank position": "Ranking-Position",
}

const VISIBILITY_KIND_LABELS: Record<string, string> = {
  organic: "Organisch",
  local: "Lokal",
  ai: "AI",
  news: "News",
}

function labelFor(value: string | null | undefined, labels: Record<string, string>) {
  const key = (value ?? "").trim().toLowerCase()
  return labels[key] ?? value ?? "—"
}

function translateFindingTitle(title: string | null | undefined) {
  const value = title?.trim() ?? ""
  const normalized = value.toLocaleLowerCase("de-DE")

  if (normalized.includes("active seo target has no published benefitsi microsite")) {
    return "Aktives SEO-Ziel hat keine veröffentlichte Benefitsi-Microsite"
  }
  if (normalized.includes("partner microsite availability/indexability blocker")) {
    return "Problem bei Verfügbarkeit und Indexierbarkeit der Partner-Microsite besteht weiter"
  }
  if (normalized.includes("drift check has no prior baseline")) {
    return "Drift-Prüfung hat noch keine Vergleichsbasis"
  }
  return value || "SEO-Finding"
}

function translateRecommendation(recommendation: string | null | undefined) {
  const value = recommendation?.trim() ?? ""
  const normalized = value.toLocaleLowerCase("de-DE")

  if (normalized.includes("create/submit a microsite draft")) {
    return "Microsite-Entwurf über den bestehenden Freigabeprozess erstellen und erst nach menschlicher Prüfung veröffentlichen."
  }
  if (normalized.includes("verify the published microsite route/availability")) {
    return "Öffentliche Microsite-Route und Verfügbarkeit prüfen, Ziel verknüpfen oder die veröffentlichte Version wiederherstellen; danach den Audit erneut ausführen."
  }
  if (normalized.includes("run a baseline seo audit")) {
    return "Nach der Veröffentlichung einen Baseline-Audit und Score-Snapshot ausführen, damit die nächste Drift-Prüfung Veränderungen vergleichen kann."
  }
  return value
}

export function localizeSeoFinding(finding: FindingLike): LocalizedFinding {
  return {
    category: labelFor(finding.category, CATEGORY_LABELS),
    severity: labelFor(finding.severity, SEVERITY_LABELS),
    status: labelFor(finding.status, STATUS_LABELS),
    evidenceClass: labelFor(finding.evidence_class, EVIDENCE_LABELS),
    title: translateFindingTitle(finding.title),
    description: finding.description?.trim() ?? "",
    recommendation: translateRecommendation(finding.recommendation),
  }
}

function translateHypothesis(hypothesis: string | null | undefined) {
  const value = hypothesis?.trim() ?? ""
  const normalized = value.toLocaleLowerCase("de-DE")
  if (
    normalized.includes("answer-first entity") ||
    normalized.includes("answer-first-entity") ||
    normalized.includes("antwort-zuerst entity") ||
    normalized.includes("antwort-zuerst-entity")
  ) {
    return "Ein Antwort-zuerst-Entitäts- und Quellenblock könnte die Zitierbarkeit verbessern, ohne einen Rankingeffekt zu behaupten."
  }
  return value || "Unbenannte GEO-Hypothese"
}

function translateRollbackNote(note: string | null | undefined) {
  return (note?.trim() ?? "")
    .replace(/\bDraft\b/gi, "Entwurf")
    .replace(/\bRollback\b/gi, "Rücknahme")
}

export function localizeSeoExperiment(experiment: ExperimentLike): LocalizedExperiment {
  return {
    type: labelFor(experiment.experiment_type, EXPERIMENT_TYPE_LABELS),
    hypothesis: translateHypothesis(experiment.hypothesis),
    targetMetric: METRIC_LABELS[experiment.target_metric ?? ""] ?? experiment.target_metric ?? "—",
    status: labelFor(experiment.status, STATUS_LABELS),
    rollbackNote: translateRollbackNote(experiment.rollback_note),
  }
}

export function localizeSeoCategory(value: string | null | undefined) {
  return labelFor(value, CATEGORY_LABELS)
}

export function localizeSeoSeverity(value: string | null | undefined) {
  return labelFor(value, SEVERITY_LABELS)
}

export function localizeSeoStatus(value: string | null | undefined) {
  return labelFor(value, STATUS_LABELS)
}

export function localizeSeoEvidenceClass(value: string | null | undefined) {
  return labelFor(value, EVIDENCE_LABELS)
}

export function localizeSeoTargetType(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase().replaceAll(" ", "_")
  return TARGET_TYPE_LABELS[normalized] ?? value?.replaceAll("_", " ") ?? "—"
}

export function localizeSeoMetric(value: string | null | undefined) {
  return METRIC_LABELS[value ?? ""] ?? value ?? "—"
}

export function localizeSeoVisibilityKind(value: string | null | undefined) {
  return labelFor(value, VISIBILITY_KIND_LABELS)
}

export function localizeSeoAuditSummary(summary: string | null | undefined) {
  const value = summary?.trim() ?? ""
  const normalized = value.toLocaleLowerCase("de-DE")

  if (normalized.includes("no score drift detected")) {
    return "Keine Score-Abweichung gegenüber der letzten gespeicherten Baseline. Das unveränderte Problem bleibt die Veröffentlichung und Indexierbarkeit der Microsite; externe Provider sind weiterhin nicht verfügbar."
  }
  if (normalized.includes("drift check completed but cannot calculate movement")) {
    return "Drift-Prüfung abgeschlossen, aber eine Bewegung kann noch nicht berechnet werden: Für dieses Ziel gibt es keine unabhängige frühere Vergleichsbasis."
  }
  if (normalized.startsWith("verified blocker:")) {
    return value.replace(/^verified blocker:/i, "Verifizierter Blocker:")
  }
  return value
}
