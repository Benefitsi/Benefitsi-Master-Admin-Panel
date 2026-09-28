import { commercePartner } from "@/lib/commerce/partner"
import { commerceError, requestBody } from "@/lib/commerce/http"
import { record, uuid } from "@/lib/commerce/requests"
import { requirePartnerBaseUrl } from "@/lib/stripe/config"
import { createSoftwareSubscription, createSoftwareBillingPortal } from "@/lib/stripe/software-billing"

export async function POST(request: Request) {
  try {
    const origin = requirePartnerBaseUrl()
    if (request.headers.get("origin") !== origin) throw new Error("unauthorized")
    const body = record(await requestBody(request))
    const providerId = uuid(body.providerId)
    const { session } = await commercePartner(providerId)
    const url = body.action === "portal"
      ? await createSoftwareBillingPortal(providerId, origin)
      : await createSoftwareSubscription(providerId, session.user.email || "", origin)
    return Response.json({ checkout_url: url }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return commerceError(error)
  }
}
