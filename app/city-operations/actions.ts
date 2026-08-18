"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import {
  canHumanPublishReview,
  canStartHumanPublication,
  isCityContentType,
} from "@/lib/city-operations/contracts"
import { loadCityReviewDetail } from "@/lib/city-operations/data"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requiredText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function detailPath(contentType: string, contentId: string) {
  return `/city-operations/${contentType}/${contentId}`
}

function validateIdentifiers(formData: FormData) {
  const reviewId = requiredText(formData, "reviewId", 80)
  const contentId = requiredText(formData, "contentId", 80)
  const contentType = requiredText(formData, "contentType", 40)

  if (
    !UUID_PATTERN.test(reviewId) ||
    !UUID_PATTERN.test(contentId) ||
    !isCityContentType(contentType)
  ) {
    throw new Error("Ungültige Review-Anfrage.")
  }

  return { reviewId, contentId, contentType }
}

function adminActor(adminSession: Awaited<ReturnType<typeof requireAdmin>>["adminSession"]) {
  return {
    actorId: adminSession.user.id,
    actorProfile:
      adminSession.profile?.display_name ||
      adminSession.profile?.email ||
      adminSession.user.email ||
      "Benefitsi Admin",
  }
}

async function transitionReview(
  formData: FormData,
  action: "request_correction" | "reject",
) {
  const { adminSession } = await requireAdmin()
  const identifiers = validateIdentifiers(formData)
  const note = requiredText(formData, "note", 2000)

  if (!note) {
    redirect(`${detailPath(identifiers.contentType, identifiers.contentId)}?error=note`)
  }

  const actor = adminActor(adminSession)
  const admin = createAdminClient()
  const { error } = await admin.rpc("transition_city_content_review", {
    p_review_id: identifiers.reviewId,
    p_action: action,
    p_actor_id: actor.actorId,
    p_actor_profile: actor.actorProfile,
    p_note: note,
  })

  if (error) {
    redirect(
      `${detailPath(identifiers.contentType, identifiers.contentId)}?error=transition`,
    )
  }

  revalidatePath("/city-operations")
  revalidatePath(detailPath(identifiers.contentType, identifiers.contentId))
  redirect(
    `${detailPath(identifiers.contentType, identifiers.contentId)}?success=${action}`,
  )
}

export async function requestCityReviewCorrection(formData: FormData) {
  return transitionReview(formData, "request_correction")
}

export async function rejectCityReview(formData: FormData) {
  return transitionReview(formData, "reject")
}

export async function publishCityContent(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const identifiers = validateIdentifiers(formData)
  const detail = await loadCityReviewDetail(
    identifiers.contentType,
    identifiers.contentId,
  )

  if (!detail.record || detail.record.reviewId !== identifiers.reviewId) {
    redirect(
      `${detailPath(identifiers.contentType, identifiers.contentId)}?error=human_publish_gate`,
    )
  }

  const note = requiredText(formData, "note", 2000)
  const manualVerificationSource = requiredText(
    formData,
    "manual_verification_source",
    2000,
  )
  const manualVerificationNote = requiredText(
    formData,
    "manual_verification_note",
    2000,
  )
  const manualVerificationConfirmed =
    formData.get("manual_verification_confirmed") === "on"

  if (!canStartHumanPublication(detail.record)) {
    redirect(
      `${detailPath(identifiers.contentType, identifiers.contentId)}?error=human_publish_gate`,
    )
  }

  if (
    !canHumanPublishReview(detail.record, {
      source: manualVerificationSource,
      note: manualVerificationNote,
      confirmed: manualVerificationConfirmed,
    })
  ) {
    redirect(
      `${detailPath(identifiers.contentType, identifiers.contentId)}?error=manual_verification_required`,
    )
  }

  const actor = adminActor(adminSession)
  const admin = createAdminClient()
  const { error } = await admin.rpc("human_publish_city_content", {
    p_review_id: identifiers.reviewId,
    p_actor_id: actor.actorId,
    p_actor_profile: actor.actorProfile,
    p_note: note || null,
    p_manual_verification_source: manualVerificationSource || null,
    p_manual_verification_note: manualVerificationNote || null,
  })

  if (error) {
    redirect(
      `${detailPath(identifiers.contentType, identifiers.contentId)}?error=human_publish`,
    )
  }

  revalidatePath("/city-operations")
  revalidatePath(detailPath(identifiers.contentType, identifiers.contentId))
  revalidatePath(`/stadt/${detail.record.citySlug}`)
  redirect(
    `${detailPath(identifiers.contentType, identifiers.contentId)}?success=human_published`,
  )
}
