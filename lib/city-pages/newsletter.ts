import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

type JsonRow = Record<string, unknown>

export type NewsletterSection = {
  title: string
  body: string
  label?: string
  href?: string
}

export type NewsletterEdition = {
  id: string
  cityId: string
  editionKey: string
  status: string
  subject: string
  preheader: string
  intro: string
  sections: NewsletterSection[]
  audienceInterests: string[]
  approvedAt: string | null
  approvedByProfile: string | null
  createdAt: string
  updatedAt: string
  audit: Array<{
    id: string
    action: string
    actorProfile: string | null
    details: JsonRow
    createdAt: string
  }>
}

export type CityNewsletterData = {
  city: { id: string; name: string; slug: string } | null
  editions: NewsletterEdition[]
  subscribers: { confirmed: number; pending: number; unsubscribed: number }
  deliveryConfigured: boolean
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

function sections(value: unknown): NewsletterSection[] {
  return rows(value)
    .map((item) => ({
      title: text(item.title)?.trim() ?? "",
      body: text(item.body)?.trim() ?? "",
      label: text(item.label)?.trim() || undefined,
      href: text(item.href)?.trim() || undefined,
    }))
    .filter((item) => item.title && item.body)
}

export async function loadCityNewsletterData(
  citySlug: string,
): Promise<CityNewsletterData> {
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
    return {
      city: null,
      editions: [],
      subscribers: { confirmed: 0, pending: 0, unsubscribed: 0 },
      deliveryConfigured: false,
    }
  }

  const [editionsResult, subscribersResult] = await Promise.all([
    admin
      .from("city_newsletter_editions")
      .select(
        "id,city_id,edition_key,status,subject,preheader,intro,sections,audience_interests,approved_at,approved_by_profile,created_at,updated_at",
      )
      .eq("city_id", cityResult.data.id)
      .order("created_at", { ascending: false })
      .limit(52),
    admin
      .from("city_newsletter_subscriptions")
      .select("status")
      .eq("city_id", cityResult.data.id)
      .limit(20000),
  ])
  if (editionsResult.error) {
    throw new Error(
      `Newsletter-Ausgaben konnten nicht geladen werden: ${editionsResult.error.message}`,
    )
  }
  if (subscribersResult.error) {
    throw new Error(
      `Newsletter-Abonnements konnten nicht geladen werden: ${subscribersResult.error.message}`,
    )
  }

  const editionRows = rows(editionsResult.data)
  const editionIds = editionRows.map((row) => String(row.id))
  const auditResult = editionIds.length
    ? await admin
        .from("city_newsletter_edition_audit")
        .select("id,edition_id,action,actor_profile,details,created_at")
        .in("edition_id", editionIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null }
  if (auditResult.error) {
    throw new Error(
      `Newsletter-Audit konnte nicht geladen werden: ${auditResult.error.message}`,
    )
  }

  const auditByEdition = new Map<string, NewsletterEdition["audit"]>()
  for (const row of rows(auditResult.data)) {
    const editionId = String(row.edition_id)
    const entries = auditByEdition.get(editionId) ?? []
    entries.push({
      id: String(row.id),
      action: String(row.action),
      actorProfile: text(row.actor_profile),
      details:
        row.details && typeof row.details === "object" && !Array.isArray(row.details)
          ? (row.details as JsonRow)
          : {},
      createdAt: String(row.created_at),
    })
    auditByEdition.set(editionId, entries)
  }

  const subscriberRows = rows(subscribersResult.data)
  const count = (status: string) =>
    subscriberRows.filter((row) => row.status === status).length

  return {
    city: {
      id: String(cityResult.data.id),
      name: String(cityResult.data.name),
      slug: String(cityResult.data.slug),
    },
    editions: editionRows.map((row) => ({
      id: String(row.id),
      cityId: String(row.city_id),
      editionKey: String(row.edition_key),
      status: String(row.status),
      subject: String(row.subject ?? ""),
      preheader: String(row.preheader ?? ""),
      intro: String(row.intro ?? ""),
      sections: sections(row.sections),
      audienceInterests: Array.isArray(row.audience_interests)
        ? row.audience_interests.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      approvedAt: text(row.approved_at),
      approvedByProfile: text(row.approved_by_profile),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      audit: auditByEdition.get(String(row.id)) ?? [],
    })),
    subscribers: {
      confirmed: count("confirmed"),
      pending: count("pending"),
      unsubscribed: count("unsubscribed"),
    },
    deliveryConfigured: Boolean(
      process.env.RESEND_API_KEY && process.env.NEWSLETTER_FROM_EMAIL,
    ),
  }
}
