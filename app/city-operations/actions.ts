"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/admin"
import { canPublishReview, isCityContentType, pendingClubSourceReviews } from "@/lib/city-operations/contracts"
import { loadCityReviewDetail } from "@/lib/city-operations/data"
import { createAdminClient } from "@/lib/supabase/admin"
import { refreshPublicCity } from "@/lib/city-pages/public-revalidation"

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

export async function resolveCityClubSourceReview(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const identifiers = validateIdentifiers(formData)
  const path = detailPath(identifiers.contentType, identifiers.contentId)
  const note = requiredText(formData, "note", 2001)
  const receiptKey = requiredText(formData, "receiptKey", 301)
  const sourceSha256 = requiredText(formData, "sourceSha256", 65)
  // Keep PostgreSQL microseconds intact; a JS Date roundtrip can lose the CAS version.
  const expectedUpdatedAt = requiredText(formData, "expectedUpdatedAt", 80)
  if (!note || note.length > 2000) redirect(`${path}?error=source_review_note`)
  if (identifiers.contentType !== "clubs" || !receiptKey || receiptKey.length > 300 ||
    !/^[a-f0-9]{64}$/.test(sourceSha256) || !expectedUpdatedAt) {
    redirect(`${path}?error=source_review`)
  }
  const detail = await loadCityReviewDetail("clubs", identifiers.contentId)
  if (!detail.record || detail.record.reviewId !== identifiers.reviewId ||
    detail.record.updatedAt !== expectedUpdatedAt ||
    !pendingClubSourceReviews(detail.record).some((issue) =>
      issue.receiptKey === receiptKey && issue.sourceSha256 === sourceSha256)) {
    redirect(`${path}?error=source_review_stale`)
  }
  const admin = createAdminClient()
  const { error } = await admin.rpc("resolve_city_club_source_review", {
    p_review_id: identifiers.reviewId,
    p_receipt_key: receiptKey,
    p_source_sha256: sourceSha256,
    p_expected_updated_at: expectedUpdatedAt,
    p_actor_id: adminSession.user.id,
    p_note: note,
  })
  if (error) redirect(`${path}?error=source_review`)
  revalidatePath("/city-operations")
  revalidatePath(path)
  redirect(`${path}?success=source_review_resolved`)
}

export async function publishCityContent(formData: FormData) {
  const { adminSession } = await requireAdmin()
  const identifiers = validateIdentifiers(formData)
  const detail = await loadCityReviewDetail(
    identifiers.contentType,
    identifiers.contentId,
  )

  if (
    !detail.record ||
    detail.record.reviewId !== identifiers.reviewId ||
    !canPublishReview(detail.record)
  ) {
    redirect(
      `${detailPath(identifiers.contentType, identifiers.contentId)}?error=publish_gate`,
    )
  }

  const note = requiredText(formData, "note", 2000)
  const actor = adminActor(adminSession)
  const admin = createAdminClient()
  const { error } = await admin.rpc("publish_reviewed_city_content", {
    p_review_id: identifiers.reviewId,
    p_actor_id: actor.actorId,
    p_actor_profile: actor.actorProfile,
    p_note: note || null,
  })

  if (error) {
    redirect(
      `${detailPath(identifiers.contentType, identifiers.contentId)}?error=publish`,
    )
  }

  revalidatePath("/city-operations")
  revalidatePath(detailPath(identifiers.contentType, identifiers.contentId))
  revalidatePath(`/stadt/${detail.record.citySlug}`)
  const refresh = await refreshPublicCity(detail.record.citySlug, detail.record.cityId)
  redirect(
    `${detailPath(identifiers.contentType, identifiers.contentId)}?success=published${refresh === "ok" ? "" : `&warning=refresh_${refresh}`}`,
  )
}
