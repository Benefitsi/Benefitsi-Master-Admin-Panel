export const SEO_PENDING_JOB_STATUSES = ["queued", "claimed"] as const

export type SeoJobLike = {
  job_type: string
  status: string
  error_code?: string | null
}

export function isSeoJobPending(status: string) {
  return SEO_PENDING_JOB_STATUSES.includes(
    status as (typeof SEO_PENDING_JOB_STATUSES)[number],
  )
}

export function describeSeoJob(job: SeoJobLike) {
  if (job.status === "queued") {
    return {
      label: "Wartet auf Hermes",
      detail: "Der Job ist angelegt und wartet auf den SEO-Worker.",
      pending: true,
      tone: "queued" as const,
    }
  }

  if (job.status === "claimed") {
    return {
      label: "Hermes verarbeitet",
      detail: "Der SEO-Agent hat den Job übernommen und schreibt die Ergebnisse.",
      pending: true,
      tone: "running" as const,
    }
  }

  if (job.status === "agent_completed") {
    return {
      label: "Ergebnisse gespeichert",
      detail: "Die Messung wurde gespeichert. Die Ansicht lädt die neuen Daten.",
      pending: false,
      tone: "completed" as const,
    }
  }

  if (job.status === "needs_human") {
    return {
      label: "Menschliche Prüfung nötig",
      detail: "Hermes hat einen Vorschlag abgelegt; es ist keine automatische Veröffentlichung erfolgt.",
      pending: false,
      tone: "review" as const,
    }
  }

  if (job.status === "failed") {
    return {
      label: "Worker-Fehler",
      detail: job.error_code || "Der Hermes-Job ist fehlgeschlagen.",
      pending: false,
      tone: "failed" as const,
    }
  }

  if (job.status === "cancelled") {
    return {
      label: "Abgebrochen",
      detail: "Der Job wurde abgebrochen und hat keine neuen Messwerte geschrieben.",
      pending: false,
      tone: "failed" as const,
    }
  }

  return {
    label: job.status,
    detail: "Der Job befindet sich in einem unbekannten Status.",
    pending: false,
    tone: "queued" as const,
  }
}
