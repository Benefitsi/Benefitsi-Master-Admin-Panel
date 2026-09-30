import { handlePartnerBillingWebhook } from '@/lib/stripe/partner-billing';
export async function POST(request: Request) {
    const signature = request.headers.get('stripe-signature');
    if (!signature)
        return Response.json({ error: 'Signatur fehlt.' }, { status: 400 });
    try {
        return Response.json(await handlePartnerBillingWebhook(await request.text(), signature));
    }
    catch (error) {
        const invalid = error instanceof Error && ['billing_invalid_signature', 'billing_event_environment_mismatch'].includes(error.message);
        return Response.json({ error: invalid ? 'Ungültiges Abrechnungsereignis.' : 'Abrechnung muss erneut abgeglichen werden.' }, { status: invalid ? 400 : 503 });
    }
}
