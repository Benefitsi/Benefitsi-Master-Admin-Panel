import "server-only"
import type { createAdminClient } from "@/lib/supabase/admin"
import { assertBookingRealmBoundary, getBookingRealm, isBookingProviderAllowed } from "@/lib/stripe/booking-client"
type Admin = ReturnType<typeof createAdminClient>

/** Only persisted ownership can authorize a sandbox database mutation. */
export async function requireBookingProviderScope(admin: Admin, providerId: string) {
  assertBookingRealmBoundary()
  if (getBookingRealm() === "legacy") return
  const result = await admin.from("booking_providers").select("id,test_mode,stripe_account_id").eq("id", providerId).maybeSingle()
  const provider = result.data
  if (result.error || !provider || !isBookingProviderAllowed(provider.id, provider.stripe_account_id, provider.test_mode)) {
    throw new Error("Dieser Testanbieter ist nicht freigegeben.")
  }
}

export async function requireBookingObjectScope(admin: Admin, table: "booking_offers" | "bookings" | "commerce_bookings", objectId: string) {
  assertBookingRealmBoundary()
  if (getBookingRealm() === "legacy") return
  const result = await admin.from(table).select("provider_id").eq("id", objectId).maybeSingle()
  if (result.error || !result.data?.provider_id) throw new Error("Die Testbuchung ist nicht freigegeben.")
  await requireBookingProviderScope(admin, result.data.provider_id)
}

/** Provider-event SQL updates every matching assignment; require all of them in scope. */
export async function requireBookingMerchantProviderScope(admin: Admin, accountId: string): Promise<boolean> {
  assertBookingRealmBoundary()
  if (getBookingRealm() === "legacy") return true
  const result = await admin.from("booking_providers").select("id,test_mode,stripe_account_id").eq("stripe_account_id", accountId)
  if (result.error) throw new Error("Die Testhändlerzuordnung konnte nicht bestätigt werden.")
  const providers = result.data || []
  if (providers.some(provider => !isBookingProviderAllowed(provider.id, provider.stripe_account_id, provider.test_mode))) {
    throw new Error("Dieser Testanbieter ist nicht freigegeben.")
  }
  return providers.length > 0
}
