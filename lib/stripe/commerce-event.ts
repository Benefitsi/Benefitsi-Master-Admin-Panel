/** Retry late-payment refunds through the same idempotent merchant refund boundary. */
export async function settleCommercePayment(value: unknown, settle: (bookingId: string) => Promise<void>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid payment result")
  const result = value as Record<string, unknown>
  if (!result.ok || !result.booking || typeof result.booking !== "object" || Array.isArray(result.booking)) {
    throw new Error("Payment transition was not confirmed")
  }
  const booking = result.booking as Record<string, unknown>
  if (booking.payment_state === "refund_pending") {
    if (typeof booking.id !== "string" || !booking.id) throw new Error("Refund booking identity missing")
    await settle(booking.id)
  }
}
