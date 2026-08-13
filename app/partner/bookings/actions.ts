"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireProviderBooking } from "@/lib/bookings/provider-data"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function requestProviderCancellation(formData: FormData) {
  const bookingId =
    typeof formData.get("bookingId") === "string"
      ? String(formData.get("bookingId")).trim()
      : ""
  const reason =
    typeof formData.get("reason") === "string"
      ? String(formData.get("reason")).trim().slice(0, 1000)
      : ""
  if (!UUID_PATTERN.test(bookingId) || reason.length < 3) {
    redirect("/partner/bookings?error=validation")
  }

  const context = await requireProviderBooking(bookingId)
  const result = await context.admin.rpc("request_booking_cancellation", {
    p_booking_id: bookingId,
    p_actor_type: "provider",
    p_actor_id: context.session.user.id,
    p_actor_profile:
      context.session.profile?.display_name ||
      context.session.user.email ||
      "Benefitsi Partner",
    p_reason: reason,
  })
  if (result.error) redirect("/partner/bookings?error=cancellation")

  revalidatePath("/partner/bookings")
  revalidatePath("/bookings")
  redirect("/partner/bookings?success=cancellation_requested")
}
