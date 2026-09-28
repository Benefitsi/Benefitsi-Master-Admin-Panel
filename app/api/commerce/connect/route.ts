import { NextResponse } from "next/server"
import { commerceError, requestBody } from "@/lib/commerce/http"
import { record, uuid } from "@/lib/commerce/requests"
import { requireBookingBaseUrl } from "@/lib/stripe/config"
import { beginCommerceOnboarding, syncCommerceMerchant } from "@/lib/stripe/commerce-connect"

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== requireBookingBaseUrl()) throw new Error("unauthorized")
    const providerId = uuid(record(await requestBody(request)).providerId)
    return Response.json({ onboarding_url: await beginCommerceOnboarding(providerId) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return commerceError(error) }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const destination = new URL("/partner/commerce", requireBookingBaseUrl())
  try {
    const providerId = uuid(query.get("provider"))
    destination.searchParams.set("provider", providerId)
    const mode = query.get("mode")
    if (mode !== "refresh" && mode !== "return") throw new Error("invalid_callback")
    await syncCommerceMerchant(providerId)
    if (mode === "refresh") return NextResponse.redirect(await beginCommerceOnboarding(providerId))
    destination.searchParams.set("connect", "returned")
  } catch {
    destination.searchParams.set("error", "connect")
  }
  return NextResponse.redirect(destination)
}
