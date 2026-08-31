type FindingSignal = {
  category?: string | null
  severity?: string | null
  title?: string | null
  recommendation?: string | null
}

type RoadmapInput = {
  technicalScore?: number | null
  organicScore?: number | null
  localScore?: number | null
  contentEntityScore?: number | null
  aiVisibilityScore?: number | null
  coverage?: number | null
  localProviderUnavailable?: boolean
  aiProviderUnavailable?: boolean
  findings?: FindingSignal[]
  hasExperiments?: boolean
}

export type SeoActionStep = {
  title: string
  action: string
  doneWhen: string
  scoreImpact: string
}

export type SeoActionPlan = {
  priority: string
  headline: string
  summary: string
  scoreAreas: string[]
  steps: SeoActionStep[]
}

const normalized = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase("de-DE")

function priorityFor(severity: string | null | undefined) {
  if (normalized(severity) === "critical" || normalized(severity) === "high") return "Sofort"
  if (normalized(severity) === "medium") return "Hoch"
  if (normalized(severity) === "low") return "Geplant"
  return "Prüfen"
}

function micrositePlan(priority: string): SeoActionPlan {
  return {
    priority,
    headline: "Microsite veröffentlichen und Indexierbarkeit herstellen",
    summary: "Die öffentliche Seite ist die wichtigste Voraussetzung für belastbare Technik- und Sichtbarkeitswerte.",
    scoreAreas: ["Technik", "Organisch", "Inhalt & Entität"],
    steps: [
      {
        title: "Öffentliche Microsite bereitstellen",
        action: "Den Microsite-Entwurf über den bestehenden Freigabeprozess veröffentlichen. Falls die Seite absichtlich nicht öffentlich sein soll, das SEO-Ziel deaktivieren.",
        doneWhen: "Die kanonische URL antwortet mit HTTP 200 und eine veröffentlichte Version ist vorhanden.",
        scoreImpact: "Verbessert voraussichtlich die technische Basis und verhindert, dass organische Sichtbarkeit an einer fehlenden Seite scheitert.",
      },
      {
        title: "Indexierbarkeit verifizieren",
        action: "Canonical, robots.txt, Sitemap, interne Verlinkung und strukturierte Daten der veröffentlichten URL prüfen.",
        doneWhen: "Die URL ist crawlbar, canonicalisiert auf sich selbst und in der Sitemap bzw. internen Verlinkung auffindbar.",
        scoreImpact: "Stärkt Technik, organische Sichtbarkeit und die Entitäts-Bewertung.",
      },
      {
        title: "Vergleichsbasis neu messen",
        action: "Nach der Veröffentlichung einen vollständigen Audit mit Score-Snapshot und Keyword-Set ausführen.",
        doneWhen: "Ein neuer Audit- und Score-Snapshot mit Abdeckung und Vertrauensgrad ist gespeichert.",
        scoreImpact: "Macht die Verbesserung messbar und schafft die Vergleichsbasis für Veränderungsprüfungen.",
      },
    ],
  }
}

function baselinePlan(priority: string): SeoActionPlan {
  return {
    priority,
    headline: "Messbare Vergleichsbasis für die Bewertung herstellen",
    summary: "Ohne einen vorherigen Audit- und Score-Snapshot kann die Entwicklung nicht belastbar bewertet werden.",
    scoreAreas: ["Organisch", "Technik", "Monitoring"],
    steps: [
      {
        title: "Audit als Vergleichsbasis ausführen",
        action: "Einen vollständigen Audit mit dem aktiven Keyword-Set starten und den Score-Snapshot speichern.",
        doneWhen: "Audit, Score und Abdeckung sind für dasselbe Ziel und denselben Zeitpunkt gespeichert.",
        scoreImpact: "Erhöht nicht automatisch den Score, macht aber Fortschritte und Rückgänge erstmals verlässlich sichtbar.",
      },
      {
        title: "Keyword-Set schärfen",
        action: "Marken-, Leistungs- und Ortsbegriffe prüfen und nur relevante Suchintentionen im aktiven Set behalten.",
        doneWhen: "Jedes Keyword hat Sprache, Gerät und Ort; irrelevante oder doppelte Begriffe sind entfernt.",
        scoreImpact: "Verbessert die Aussagekraft der organischen Messung.",
      },
      {
        title: "Nächste Veränderungsprüfung planen",
        action: "Nach einer dokumentierten Änderung den nächsten Hermes-Lauf abwarten und die Bewegung mit der Vergleichsbasis vergleichen.",
        doneWhen: "Die Veränderungsprüfung referenziert einen vorherigen vergleichbaren Snapshot.",
        scoreImpact: "Verhindert, dass Maßnahmen ohne messbaren Vorher-Nachher-Vergleich bewertet werden.",
      },
    ],
  }
}

function providerPlan(priority: string): SeoActionPlan {
  return {
    priority,
    headline: "Anbieter für vollständige Sichtbarkeit anbinden",
    summary: "Lokale und AI-Werte bleiben ohne Anbieter bewusst leer; die fehlenden Dimensionen werden nicht als Null gewertet.",
    scoreAreas: ["Lokal", "AI-Sichtbarkeit", "Abdeckung"],
    steps: [
      {
        title: "Local-/Maps-Anbieter konfigurieren",
        action: "DataForSEO oder einen freigegebenen Maps-Anbieter mit eingeschränktem SEO-Zugriff hinterlegen.",
        doneWhen: "Ein lokaler Job liefert einen Snapshot mit Ort, Anbieter, Abdeckung und Vertrauensgrad.",
        scoreImpact: "Füllt die lokale Dimension und erhöht die messbare Abdeckung.",
      },
      {
        title: "AI-Sichtbarkeits-Anbieter konfigurieren",
        action: "SE Ranking, DataForSEO AI oder einen kompatiblen Anbieter für Erwähnungen und Zitate hinterlegen.",
        doneWhen: "Ein AI-Job speichert die Anzahl der Suchanfragen, Erwähnungen, Zitate und Anbieter-Metadaten.",
        scoreImpact: "Füllt die AI-Dimension und macht GEO-Experimente überprüfbar.",
      },
      {
        title: "Messung erneut ausführen",
        action: "Nach der Konfiguration einen vollständigen Audit-Zyklus starten und die neuen Dimensionen vergleichen.",
        doneWhen: "Lokale und AI-Messstände sind gespeichert und im Dashboard sichtbar.",
        scoreImpact: "Erhöht die Abdeckung; der Score wird nur aus tatsächlich gemessenen Dimensionen normalisiert.",
      },
    ],
  }
}

function geoPlan(priority: string): SeoActionPlan {
  return {
    priority,
    headline: "GEO-Hypothese kontrolliert testen",
    summary: "Die Hypothese ist ein reversibler Entwurf und darf erst nach menschlicher Freigabe auf einer öffentlichen Seite getestet werden.",
    scoreAreas: ["AI-Sichtbarkeit", "Inhalt & Entität"],
    steps: [
      {
        title: "Ausgangswert sichern",
        action: "Vor der Änderung AI-Zitierrate, Erwähnungen und die relevanten Queries mit einem konfigurierten Anbieter erfassen.",
        doneWhen: "Ein AI-Ausgangs-Snapshot mit Query-Anzahl und Vertrauensgrad ist gespeichert.",
        scoreImpact: "Verhindert, dass ein Effekt ohne Ausgangswert behauptet wird.",
      },
      {
        title: "Antwort-zuerst-Block als Entwurf ergänzen",
        action: "Entität, Angebot, Ort und belastbare Quellen in einem klaren Antwort-/Quellenblock strukturieren; keine versteckten oder manipulativen Inhalte.",
        doneWhen: "Der Entwurf ist menschlich geprüft und die sichtbaren Aussagen sind durch Quellen gedeckt.",
        scoreImpact: "Kann die Zitierbarkeit unterstützen; ein Rankingeffekt wird nicht versprochen.",
      },
      {
        title: "Nachtest und Rücknahme",
        action: "Nach dem definierten Testfenster erneut messen und den Entwurf bei schlechterer Messung zurücknehmen.",
        doneWhen: "Nachtest und Entscheidung sind dokumentiert; die Rücknahme ist jederzeit möglich.",
        scoreImpact: "Überführt die Hypothese in eine belastbare Entscheidung statt in eine dauerhafte Vermutung.",
      },
    ],
  }
}

export function getSeoActionPlan(finding: FindingSignal): SeoActionPlan {
  const title = normalized(finding.title)
  const recommendation = normalized(finding.recommendation)
  const priority = priorityFor(finding.severity)

  if (
    title.includes("no published benefitsi microsite") ||
    title.includes("availability/indexability") ||
    recommendation.includes("microsite draft")
  ) {
    return micrositePlan(priority)
  }
  if (title.includes("no prior baseline") || title.includes("baseline") || recommendation.includes("baseline seo audit")) {
    return baselinePlan(priority)
  }
  if (normalized(finding.category).includes("ai") || normalized(finding.category).includes("geo") || title.includes("citation")) {
    return geoPlan(priority)
  }

  if (normalized(finding.category).includes("local")) return providerPlan(priority)
  return baselinePlan(priority)
}

export function getSeoScoreRoadmap(input: RoadmapInput): SeoActionPlan[] {
  const findings = input.findings ?? []
  const plans: SeoActionPlan[] = []
  const hasTechnicalBlocker = findings.some((finding) => normalized(finding.category).includes("technical") || normalized(finding.title).includes("microsite"))
  const hasWeakTechnicalScore = input.technicalScore !== null && input.technicalScore !== undefined && input.technicalScore < 80

  if (hasTechnicalBlocker || hasWeakTechnicalScore) {
    plans.push(micrositePlan("Sofort"))
  }
  const needsBaseline = (
    input.organicScore === null ||
    input.organicScore === undefined ||
    input.organicScore < 60 ||
    input.coverage === null ||
    input.coverage === undefined ||
    input.coverage < 0.8
  ) || findings.some((finding) => normalized(finding.title).includes("baseline"))
  if (needsBaseline) {
    plans.push(baselinePlan("Hoch"))
  }
  if (input.localProviderUnavailable || input.aiProviderUnavailable) {
    plans.push(providerPlan("Danach"))
  }
  if (input.hasExperiments) {
    plans.push(geoPlan("Zum Schluss"))
  }
  return plans.length > 0 ? plans : [baselinePlan("Prüfen")]
}
