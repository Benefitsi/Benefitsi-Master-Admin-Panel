"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const allowedInterests = new Set([
  "events",
  "family",
  "food",
  "culture",
  "clubs",
  "notices",
])

function value(formData: FormData, key: string, maxLength: number) {
  const item = formData.get(key)
  return typeof item === "string" ? item.trim().slice(0, maxLength) : ""
}

function path(citySlug: string) {
  return `/city-pages/${encodeURIComponent(citySlug)}/newsletter`
}

function actor(session: Awaited<ReturnType<typeof requireAdmin>>["adminSession"]) {
  return {
    id: session.user.id,
    profile:
      session.profile?.display_name ||
      session.profile?.email ||
      session.user.email ||
      "Benefitsi Admin",
  }
}

function identifiers(formData: FormData, editionRequired = true) {
  const cityId = value(formData, "cityId", 80)
  const citySlug = value(formData, "citySlug", 180)
  const editionId = value(formData, "editionId", 80)
  if (
    !UUID_PATTERN.test(cityId) ||
    !citySlug ||
    (editionRequired && !UUID_PATTERN.test(editionId))
  ) {
    throw new Error("Ungültige Newsletter-Anfrage.")
  }
  return { cityId, citySlug, editionId }
}

export async function requestNewsletterDraft(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const { cityId, citySlug } = identifiers(formData, false)
  const admin = createAdminClient()
  const identity = actor(adminSession)
  const { error } = await admin.rpc("request_city_newsletter_draft", {
    p_city_id: cityId,
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
  })

  if (error) redirect(`${path(citySlug)}?error=draft_request`)
  revalidatePath(path(citySlug))
  redirect(`${path(citySlug)}?success=draft_requested`)
}

export async function saveNewsletterEdition(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const { cityId, citySlug, editionId } = identifiers(formData)
  const subject = value(formData, "subject", 180)
  const preheader = value(formData, "preheader", 240)
  const intro = value(formData, "intro", 2000)
  const sections = [1, 2, 3]
    .map((index) => ({
      title: value(formData, `section${index}Title`, 180),
      body: value(formData, `section${index}Body`, 2000),
      label: value(formData, `section${index}Label`, 80),
      href: value(formData, `section${index}Href`, 1000),
    }))
    .filter((section) => section.title || section.body)
    .map((section) => ({
      title: section.title,
      body: section.body,
      ...(section.label ? { label: section.label } : {}),
      ...(section.href ? { href: section.href } : {}),
    }))
  const audienceInterests = Array.from(allowedInterests).filter(
    (interest) => formData.get(`interest-${interest}`) === "on",
  )

  if (
    subject.length < 5 ||
    intro.length < 20 ||
    sections.length < 1 ||
    sections.some(
      (section) =>
        section.title.length < 3 ||
        section.body.length < 20 ||
        (section.href &&
          !section.href.startsWith("/stadt/") &&
          !section.href.startsWith("/partner/") &&
          !section.href.startsWith("https://")),
    )
  ) {
    redirect(`${path(citySlug)}?error=content`)
  }

  const admin = createAdminClient()
  const identity = actor(adminSession)
  const { error } = await admin.rpc("save_city_newsletter_edition", {
    p_edition_id: editionId,
    p_city_id: cityId,
    p_subject: subject,
    p_preheader: preheader,
    p_intro: intro,
    p_sections: sections,
    p_audience_interests: audienceInterests,
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
  })

  if (error) redirect(`${path(citySlug)}?error=save`)
  revalidatePath(path(citySlug))
  redirect(`${path(citySlug)}?success=saved`)
}

export async function approveNewsletterEdition(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const { cityId, citySlug, editionId } = identifiers(formData)
  const note = value(formData, "note", 1000)
  if (note.length < 10) redirect(`${path(citySlug)}?error=approval_note`)

  const admin = createAdminClient()
  const identity = actor(adminSession)
  const { error } = await admin.rpc("approve_city_newsletter_edition", {
    p_edition_id: editionId,
    p_city_id: cityId,
    p_actor_id: identity.id,
    p_actor_profile: identity.profile,
    p_note: note,
  })

  if (error) redirect(`${path(citySlug)}?error=approve`)
  revalidatePath(path(citySlug))
  redirect(`${path(citySlug)}?success=approved`)
}
