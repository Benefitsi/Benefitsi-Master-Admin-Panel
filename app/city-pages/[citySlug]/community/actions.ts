"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const allowedStatuses = new Set(["approved", "rejected", "archived"])

function value(formData: FormData, key: string, maxLength: number) {
  const item = formData.get(key)
  return typeof item === "string" ? item.trim().slice(0, maxLength) : ""
}

function inboxPath(citySlug: string) {
  return `/city-pages/${encodeURIComponent(citySlug)}/community`
}

export async function moderateCommunitySubmission(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const cityId = value(formData, "cityId", 80)
  const citySlug = value(formData, "citySlug", 180)
  const submissionId = value(formData, "submissionId", 80)
  const status = value(formData, "status", 30)
  const privateNote = value(formData, "privateNote", 2000)
  const publicMessage = value(formData, "publicMessage", 1000)

  if (
    !UUID_PATTERN.test(cityId) ||
    !UUID_PATTERN.test(submissionId) ||
    !citySlug ||
    !allowedStatuses.has(status)
  ) {
    throw new Error("Ungültige Moderationsanfrage.")
  }

  if (!privateNote) {
    redirect(`${inboxPath(citySlug)}?error=private_note`)
  }

  const actorProfile =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Benefitsi Admin"
  const admin = createAdminClient()
  const { error } = await admin.rpc("moderate_city_community_submission", {
    p_submission_id: submissionId,
    p_city_id: cityId,
    p_status: status,
    p_actor_id: adminSession.user.id,
    p_actor_profile: actorProfile,
    p_private_note: privateNote,
    p_public_message: publicMessage || null,
  })

  if (error) {
    redirect(`${inboxPath(citySlug)}?error=moderation`)
  }

  revalidatePath(inboxPath(citySlug))
  revalidatePath(`/city-pages/${citySlug}`)
  redirect(`${inboxPath(citySlug)}?success=${encodeURIComponent(status)}`)
}
