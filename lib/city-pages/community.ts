import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

type JsonRow = Record<string, unknown>

export type CommunityAuditEntry = {
  id: string
  action: string
  fromStatus: string | null
  toStatus: string
  actorProfile: string | null
  privateNote: string | null
  publicMessage: string | null
  createdAt: string
}

export type CommunitySubmission = {
  id: string
  cityId: string
  reference: string | null
  kind: string
  title: string
  description: string
  contactName: string
  contactEmail: string
  eventStartsAt: string | null
  eventLocation: string | null
  sourceUrl: string | null
  status: string
  reviewNotes: string | null
  publicStatusMessage: string | null
  createdAt: string
  updatedAt: string
  audit: CommunityAuditEntry[]
}

export type CityCommunityInbox = {
  city: { id: string; name: string; slug: string } | null
  submissions: CommunitySubmission[]
  warnings: string[]
}

function rows(value: unknown): JsonRow[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonRow =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : []
}

function text(value: unknown) {
  return typeof value === "string" ? value : null
}

export async function loadCityCommunityInbox(
  citySlug: string,
): Promise<CityCommunityInbox> {
  const admin = createAdminClient()
  const cityResult = await admin
    .from("cities")
    .select("id,name,slug")
    .eq("slug", citySlug)
    .maybeSingle()

  if (cityResult.error) {
    throw new Error(`Stadt konnte nicht geladen werden: ${cityResult.error.message}`)
  }
  if (!cityResult.data) {
    return { city: null, submissions: [], warnings: [] }
  }

  const submissionsResult = await admin
    .from("city_community_submissions")
    .select(
      "id,city_id,public_reference,kind,title,description,contact_name,contact_email,event_starts_at,event_location,source_url,status,review_notes,public_status_message,created_at,updated_at",
    )
    .eq("city_id", cityResult.data.id)
    .order("created_at", { ascending: false })
    .limit(250)

  if (submissionsResult.error) {
    throw new Error(
      `Community-Einreichungen konnten nicht geladen werden: ${submissionsResult.error.message}`,
    )
  }

  const submissionRows = rows(submissionsResult.data)
  const submissionIds = submissionRows.map((row) => String(row.id))
  const auditResult = submissionIds.length
    ? await admin
        .from("city_community_submission_audit")
        .select(
          "id,submission_id,action,from_status,to_status,actor_profile,private_note,public_message,created_at",
        )
        .in("submission_id", submissionIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null }

  const warnings: string[] = []
  if (auditResult.error) {
    warnings.push("Der Statusverlauf konnte nicht geladen werden.")
  }

  const auditBySubmission = new Map<string, CommunityAuditEntry[]>()
  for (const row of rows(auditResult.data)) {
    const submissionId = String(row.submission_id)
    const entries = auditBySubmission.get(submissionId) ?? []
    entries.push({
      id: String(row.id),
      action: String(row.action),
      fromStatus: text(row.from_status),
      toStatus: String(row.to_status),
      actorProfile: text(row.actor_profile),
      privateNote: text(row.private_note),
      publicMessage: text(row.public_message),
      createdAt: String(row.created_at),
    })
    auditBySubmission.set(submissionId, entries)
  }

  return {
    city: {
      id: String(cityResult.data.id),
      name: String(cityResult.data.name),
      slug: String(cityResult.data.slug),
    },
    submissions: submissionRows.map((row) => ({
      id: String(row.id),
      cityId: String(row.city_id),
      reference: text(row.public_reference),
      kind: String(row.kind),
      title: String(row.title),
      description: String(row.description),
      contactName: String(row.contact_name),
      contactEmail: String(row.contact_email),
      eventStartsAt: text(row.event_starts_at),
      eventLocation: text(row.event_location),
      sourceUrl: text(row.source_url),
      status: String(row.status),
      reviewNotes: text(row.review_notes),
      publicStatusMessage: text(row.public_status_message),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      audit: auditBySubmission.get(String(row.id)) ?? [],
    })),
    warnings,
  }
}
