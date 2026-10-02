import { timingSafeEqual } from 'node:crypto';
import { reconcileAllPartnerBilling } from '@/lib/stripe/partner-billing';
export async function POST(request: Request) {
    const expected = process.env.BENEFITSI_PARTNER_BILLING_RECONCILE_SECRET;
    const provided = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
    if (!expected || expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided)))
        return Response.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    try {
        const result = await reconcileAllPartnerBilling();
        return Response.json(result, { status: result.failed ? 503 : 200 });
    }
    catch {
        return Response.json({ error: 'Abgleich nicht verfügbar.' }, { status: 503 });
    }
}
