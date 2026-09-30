'use server';
import { redirect } from 'next/navigation';
import { createPartnerCheckout, createPartnerPortal, cancelPartnerSubscription } from '@/lib/stripe/partner-billing';
export async function partnerBillingAction(form: FormData) {
    const partner = String(form.get('partner_id') || ''), action = String(form.get('operation') || '');
    let url = `/partner/billing?partner=${encodeURIComponent(partner)}`;
    try {
        if (action === 'checkout') {
            if (form.get('agreement') !== 'accepted')
                throw Error('agreement_required');
            const result = await createPartnerCheckout(partner, String(form.get('offer')), Number(form.get('version')), String(form.get('terms_version')));
            if ('url' in result)
                url = result.url;
        }
        else if (action === 'portal') {
            const result = await createPartnerPortal(partner);
            if ('url' in result)
                url = result.url;
        }
        else if (action === 'cancel')
            await cancelPartnerSubscription(partner, String(form.get('offer')));
        else
            throw Error('invalid_action');
    }
    catch {
        url += '&billing_error=unavailable';
    }
    redirect(url);
}
