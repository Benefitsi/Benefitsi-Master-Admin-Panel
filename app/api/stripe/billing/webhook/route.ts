import { getStripeTestClient } from "@/lib/stripe/config"
import { applySoftwareBillingEvent } from "@/lib/stripe/software-billing"

export async function POST(request: Request) {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET?.trim()
  const signature = request.headers.get("stripe-signature")
  if (!secret?.startsWith("whsec_") || !signature) return Response.json({ error: "Signaturkonfiguration fehlt." }, { status: 400 })
  const payload = await request.text()
  let event
  try { event = getStripeTestClient().webhooks.constructEvent(payload, signature, secret) }
  catch { return Response.json({ error: "Ungültige Signatur." }, { status: 400 }) }
  if (event.livemode || event.account) return Response.json({ error: "Nur Plattform-Testereignisse erlaubt." }, { status: 403 })
  try { return Response.json(await applySoftwareBillingEvent(event)) }
  catch { return Response.json({ error: "Abonnementstatus konnte nicht verarbeitet werden." }, { status: 500 }) }
}
