import 'server-only'
import { redirect } from 'next/navigation'
import { getPartnerPortalSession, canManagePartner } from '@/lib/partner-portal'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uuid } from './requests'
export async function commercePartner(providerId?:string) {
  if(process.env.BENEFITSI_COMMERCE_ENABLED!=='true') throw new Error('commerce_disabled')
  const session=await getPartnerPortalSession(await createClient())
  if(!session) redirect('/partner/login')
  if(!session.isAdmin&&!session.ownedPartnerIds.length) throw new Error('unauthorized')
  const admin=createAdminClient()
  let query=admin.from('booking_providers').select('id,partner_id,display_name,support_email,stripe_account_id,onboarding_status,charges_enabled,payouts_enabled,stripe_charge_model,test_mode,food_ordering_enabled')
  if(!session.isAdmin) query=query.in('partner_id',session.ownedPartnerIds)
  const result=await query
  if(result.error) throw new Error('providers_failed')
  const providers=result.data||[]
  const provider=providerId?providers.find(p=>p.id===uuid(providerId)):providers[0]
  if(providerId&&(!provider||(!session.isAdmin&&!canManagePartner(session,provider.partner_id)))) throw new Error('unauthorized')
  let partnerQuery=admin.from('partners').select('id,name,email').order('name')
  if(!session.isAdmin) partnerQuery=partnerQuery.in('id',session.ownedPartnerIds)
  const partnerResult=await partnerQuery
  if(partnerResult.error) throw new Error('partners_failed')
  return {session,admin,providers,provider,partners:partnerResult.data||[]}
}
export async function commerceDashboard(providerId?:string) {
  const context=await commercePartner(providerId)
  if(!context.provider) return {...context,offerings:[],resources:[],menu:[],slots:[],bookings:[]}
  const id=context.provider.id
  const results=await Promise.all(['commerce_offerings','commerce_resources','commerce_menu_items','commerce_slots','commerce_bookings'].map(table=>context.admin.from(table).select('*').eq('provider_id',id).order(table==='commerce_slots'?'starts_at':'created_at',{ascending:table==='commerce_slots'}).limit(table==='commerce_bookings'?250:1000)))
  if(results.some(r=>r.error)) throw new Error('commerce_migration_required')
  return {...context,offerings:results[0].data||[],resources:results[1].data||[],menu:results[2].data||[],slots:results[3].data||[],bookings:results[4].data||[]}
}
