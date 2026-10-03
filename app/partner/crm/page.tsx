import {PartnerDashboard} from '@/components/partner/partner-dashboard'
import {PartnerCrmLoader} from '@/components/partner/partner-crm-loader'
import {partnerPageContext} from '@/lib/partners/page-context'
import {readCrmDashboard,readCrmDeals,crmError,type CrmRead,type CrmDeals} from '@/lib/partners/crm'
export const dynamic='force-dynamic'
export default async function PartnerCrmPage({searchParams}:{searchParams:Promise<{partner?:string}>}) {
  const ctx=await partnerPageContext((await searchParams).partner)
  let initial:CrmRead|null=null,initialError=''
  let deals:CrmDeals={status:'unavailable',message:'Aktive Vorteile sind aktuell nicht verfügbar.'}
  try{initial=await readCrmDashboard(ctx.client,ctx.partnerId);if(initial.status==='ready')deals=await readCrmDeals(ctx.client,ctx.partnerId)}catch(error){initialError=crmError(error).message}
  return <PartnerDashboard {...ctx} active="crm"><PartnerCrmLoader key={`${ctx.partnerId}:${ctx.session.user.id}`} partnerId={ctx.partnerId} actorId={ctx.session.user.id} initial={initial} deals={deals} initialError={initialError}/></PartnerDashboard>
}
