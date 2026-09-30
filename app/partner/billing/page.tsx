import { PartnerDashboard } from '@/components/partner/partner-dashboard';
import { PartnerPlanSummary } from '@/components/partner/partner-plan-panel';
import { partnerPageContext } from '@/lib/partners/page-context';
import { PartnerBillingControls } from '@/components/partner/partner-billing-controls';
import { readBilling } from '@/lib/partners/entitlements';
export const dynamic = 'force-dynamic';
export default async function BillingPage({ searchParams, }: {
    searchParams: Promise<{
        partner?: string;
        billing_error?: string;
    }>;
}) {
    const ctx = await partnerPageContext((await searchParams).partner);
    const params = await searchParams;
    let readiness = null;
    if (ctx.rights.role === 'owner') {
        const result = await ctx.client.rpc('get_partner_billing_readiness', { p_partner_id: ctx.partnerId });
        readiness = result.data;
        if (readiness && process.env.BENEFITSI_PARTNER_BILLING_ENABLED !== 'true')
            readiness = { ...readiness, enabled: false };
    }
    let data;
    try {
        data = await readBilling(ctx.client, ctx.partnerId);
    }
    catch { }
    return (<PartnerDashboard {...ctx} active="billing">
      {ctx.rights.role === 'owner' && <PartnerBillingControls partner={ctx.partnerId} offers={data?.catalog.offers || []} readiness={readiness} currentOffers={[...(data?.pending_founder ? [data.pending_founder.offer_code] : []), ...(data?.subscription?.offer && data.subscription.state !== 'canceled' ? [data.subscription.offer.offer_code] : []), ...(data?.addons || []).filter(a => a.state !== 'canceled').map(a => a.offer_code)]} pendingOffers={data?.pending_founder ? [data.pending_founder.offer_code] : []} canBuyAddons={!!data?.subscription && data.subscription.source === 'subscription' && ['active', 'trialing'].includes(data.subscription.state) && !data.subscription.cancel_at_period_end && data.entitlements.plan_code === 'pro'} error={!!params.billing_error}/>}
      {data ? (<PartnerPlanSummary data={data}/>) : (<div role="alert" className="rounded-xl bg-amber-50 p-5">
          Tarifdaten konnten nicht geladen werden. Bitte versuche es erneut.
        </div>)}
    </PartnerDashboard>);
}
