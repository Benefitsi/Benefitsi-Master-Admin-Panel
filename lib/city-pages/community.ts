import "server-only"

import { isHistoricalMeetup, pendingNativeMeetups } from "./community-moderation"
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
  hostUserId: string | null
  eventEndsAt: string | null
  capacity: number | null
  targetAudience: string | null
  costDescription: string | null
  activityType: string | null
  eventTimezone: string | null
  publishedRecordId: string | null
  eventStartsAt: string | null
  eventLocation: string | null
  sourceUrl: string | null
  status: string
  reviewNotes: string | null
  publicStatusMessage: string | null
  createdAt: string
  updatedAt: string
  audit: CommunityAuditEntry[]
  linkedMeetup: NativeCommunityMeetup | null
}

export type NativeCommunityMeetup = {
  id: string
  cityId: string
  canonicalSlug: string | null
  title: string
  description: string
  hostUserId: string | null
  hostDisplayName: string | null
  linkedSubmission: boolean
  startsAt: string | null
  endsAt: string | null
  meetingPoint: string | null
  capacity: number | null
  targetAudience: string | null
  costDescription: string | null
  activityType: string | null
  moderationStatus: string
  lifecycleStatus: string
  visibility: string
  locationPrivacy: string | null
  createdAt: string
  reports: CommunityMeetupReport[]
}

export type CommunityMeetupReport = {
  id: string
  reason: string
  details: string | null
  createdAt: string
}

export type CityCommunityInbox = {
  city: { id: string; name: string; slug: string } | null
  submissions: CommunitySubmission[]
  nativeMeetups: NativeCommunityMeetup[]
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
    return { city: null, submissions: [], nativeMeetups: [], warnings: [] }
  }

  const submissionsResult = await admin
    .from("city_community_submissions")
    .select(
      "id,city_id,public_reference,kind,title,description,contact_name,contact_email,event_starts_at,event_ends_at,event_location,host_user_id,capacity,target_audience,cost_description,activity_type,event_timezone,published_record_id,source_url,status,review_notes,public_status_message,created_at,updated_at",
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
  if (submissionRows.length === 250) warnings.push("Die Einreichungen erreichen die Anzeigegrenze. Weitere Einreichungen können fehlen.")
  if (auditResult.error) {
    warnings.push("Der Statusverlauf konnte nicht geladen werden.")
  }

  // Reports have no city_id. The inner meetup relation scopes the private read.
  const reportsResult = await admin.from("city_meetup_reports")
    .select("id,meetup_id,reason,details,created_at,city_meetups!inner(city_id)")
    .eq("status", "PENDING")
    .eq("city_meetups.city_id", cityResult.data.id)
    .order("created_at", { ascending: true })
    .limit(251)
  if (reportsResult.error) warnings.push("Offene Meldungen konnten nicht geladen werden. Die Inbox ist unvollständig.")
  const reportRows = reportsResult.error ? [] : rows(reportsResult.data).slice(0, 250)
  if (!reportsResult.error && rows(reportsResult.data).length > 250) warnings.push("Mehr als 250 offene Meldungen: Die Inbox zeigt nur einen Teil. Bitte weitere Meldungen gesondert prüfen.")
  const reportedIds = [...new Set(reportRows.map(row => text(row.meetup_id)).filter((id): id is string => Boolean(id)))]
  const reportMeetupsResult = reportedIds.length ? await admin.from("city_meetups")
    .select("id,city_id,canonical_slug,title,description,host_user_id,start_at,end_at,meeting_point_label,max_participants,age_range,cost_description,activity_type,moderation_status,lifecycle_status,visibility,location_privacy,created_at")
    .eq("city_id", cityResult.data.id)
    .in("id", reportedIds) : { data: [], error: null }
  if (reportMeetupsResult.error || (!reportMeetupsResult.error && rows(reportMeetupsResult.data).length !== reportedIds.length)) warnings.push("Gemeldete Treffen konnten nicht vollständig geladen werden. Die Inbox ist unvollständig.")
  const reportsByMeetup = new Map<string, CommunityMeetupReport[]>()
  for (const row of reportRows) {
    const id = text(row.meetup_id)
    if (!id) continue
    const entries = reportsByMeetup.get(id) ?? []
    entries.push({ id: String(row.id), reason: String(row.reason).slice(0, 40), details: text(row.details)?.slice(0, 2000) ?? null, createdAt: String(row.created_at) })
    reportsByMeetup.set(id, entries)
  }

  // Query all linked IDs independently of the paginated inbox, so an older
  // web submission cannot also appear as a new app proposal.
  const nativeResult = await admin.from("city_meetups")
    .select("id,city_id,canonical_slug,title,description,host_user_id,start_at,end_at,meeting_point_label,max_participants,age_range,cost_description,activity_type,moderation_status,lifecycle_status,visibility,location_privacy,created_at")
    .eq("city_id", cityResult.data.id)
    .in("moderation_status", ["PENDING", "FLAGGED"])
    .order("created_at", { ascending: true })
    .limit(250)
  if (!nativeResult.error && rows(nativeResult.data).length === 250) warnings.push("Die App-Treffen erreichen die Anzeigegrenze. Weitere Treffen können fehlen.")
  const combinedRows = new Map<string, JsonRow>()
  for (const row of [...(nativeResult.error ? [] : rows(nativeResult.data)), ...(reportMeetupsResult.error ? [] : rows(reportMeetupsResult.data))]) combinedRows.set(String(row.id), row)
  const nativeIds = [...combinedRows.keys()]
  const linksResult = nativeIds.length ? await admin.from("city_community_submissions")
    .select("published_record_id").eq("city_id", cityResult.data.id)
    .in("published_record_id", nativeIds) : {data: [], error: null}
  if (nativeResult.error) warnings.push("Die App-Vorschläge konnten nicht geladen werden. Gemeldete Treffen und Einreichungen bleiben verfügbar.")
  if (linksResult.error) warnings.push("Die Zuordnung zu Einreichungen konnte nicht geprüft werden. App-Treffen und ihre privaten Meldungen werden bis zur nächsten erfolgreichen Prüfung ausgeblendet, um doppelte Moderation zu vermeiden.")
  const nativeRows = linksResult.error ? [] : [...combinedRows.values()]
  const hostIds = [...new Set(nativeRows.map(row => text(row.host_user_id)).filter((id): id is string => Boolean(id)))]
  const hostsResult = hostIds.length ? await admin.from("users").select("id,display_name").in("id", hostIds) : {data: [], error: null}
  if (hostsResult.error) warnings.push("Öffentliche Gastgebernamen konnten nicht geladen werden. Es werden keine Ersatzidentitäten erzeugt.")
  const hostNames = new Map(rows(hostsResult.data).map(row => [String(row.id), text(row.display_name)]))
  const linkedRecordIds = new Set(rows(linksResult.data).map(row => String(row.published_record_id)))
  const allPendingMeetups: NativeCommunityMeetup[] = nativeRows.map(row => ({
    id: String(row.id), cityId: String(row.city_id), canonicalSlug: text(row.canonical_slug),
    title: String(row.title), description: String(row.description ?? ""),
    linkedSubmission: linkedRecordIds.has(String(row.id)),
    hostUserId: text(row.host_user_id), hostDisplayName: hostNames.get(String(row.host_user_id)) ?? null,
    startsAt: text(row.start_at), endsAt: text(row.end_at), meetingPoint: text(row.meeting_point_label),
    capacity: typeof row.max_participants === "number" ? row.max_participants : null,
    targetAudience: text(row.age_range), costDescription: text(row.cost_description), activityType: text(row.activity_type),
    moderationStatus: String(row.moderation_status), lifecycleStatus: String(row.lifecycle_status),
    visibility: String(row.visibility), locationPrivacy: text(row.location_privacy), createdAt: String(row.created_at),
    reports: reportsByMeetup.get(String(row.id)) ?? [],
  }))
  const displayedLinkedIds = submissionRows.map(row => text(row.published_record_id)).filter((id): id is string => Boolean(id))
  const eligibleMeetups = allPendingMeetups.filter(meetup => (
    meetup.reports.length > 0 || (pendingNativeMeetups([meetup], []).length > 0 && !isHistoricalMeetup(meetup))
  ))
  const nativeMeetups = eligibleMeetups.filter(meetup => !displayedLinkedIds.includes(meetup.id))
  const pendingById = new Map(eligibleMeetups.map(meetup => [meetup.id, meetup]))
  const linkedOwnerByMeetup = new Map<string, JsonRow>()
  for (const row of submissionRows) {
    const meetupId = text(row.published_record_id)
    if (!meetupId || !pendingById.has(meetupId)) continue
    const current = linkedOwnerByMeetup.get(meetupId)
    const pending = row.status === "needs_review"
    if (!current || (pending && current.status !== "needs_review") ||
        (pending === (current.status === "needs_review") && String(row.id) < String(current.id))) {
      linkedOwnerByMeetup.set(meetupId, row)
    }
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
      hostUserId: text(row.host_user_id),
      eventEndsAt: text(row.event_ends_at),
      capacity: typeof row.capacity === "number" ? row.capacity : null,
      targetAudience: text(row.target_audience),
      costDescription: text(row.cost_description),
      activityType: text(row.activity_type),
      eventTimezone: text(row.event_timezone),
      publishedRecordId: text(row.published_record_id),
      eventLocation: text(row.event_location),
      sourceUrl: text(row.source_url),
      status: String(row.status),
      reviewNotes: text(row.review_notes),
      publicStatusMessage: text(row.public_status_message),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      audit: auditBySubmission.get(String(row.id)) ?? [],
      linkedMeetup: linkedOwnerByMeetup.get(String(row.published_record_id))?.id === row.id
        ? pendingById.get(String(row.published_record_id)) ?? null : null,
    })),
    nativeMeetups,
    warnings,
  }
}
