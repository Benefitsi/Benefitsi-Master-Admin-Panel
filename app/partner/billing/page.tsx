import { PartnerDashboard } from '@/components/partner/partner-dashboard'
import { PartnerPlanSummary } from '@/components/partner/partner-plan-panel'
import { partnerPageContext } from '@/lib/partners/page-context'
import { readBilling } from '@/lib/partners/entitlements'
export const dynamic = 'force-dynamic'
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>
}) {
  const ctx = await partnerPageContext((await searchParams).partner)
  let data
  try {
    data = await readBilling(ctx.client, ctx.partnerId)
  } catch {}
  return (
    <PartnerDashboard {...ctx} active="billing">
      {data ? (
        <PartnerPlanSummary data={data} />
      ) : (
        <div role="alert" className="rounded-xl bg-amber-50 p-5">
          Tarifdaten konnten nicht geladen werden. Bitte versuche es erneut.
        </div>
      )}
    </PartnerDashboard>
  )
}
