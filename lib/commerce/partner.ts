import 'server-only'
import { redirect } from 'next/navigation'
import { getPartnerPortalSession, canManagePartner } from '@/lib/partner-portal'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uuid } from './requests'
import { readPickupSlots } from './pickup-slots'
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
  const rightsResult=provider ? await (await createClient()).rpc('get_partner_entitlements',{p_partner_id:provider.partner_id}) : null
  const intakeActive=!rightsResult?.error && rightsResult?.data?.features?.commerce===true
  return {session,admin,providers,provider,partners:partnerResult.data||[],intakeActive}
}
export async function commerceDashboard(providerId?:string) {
  const context=await commercePartner(providerId)
  if(!context.provider) return {...context,offerings:[],resources:[],menu:[],slots:[],bookings:[],deals:[],dealRules:[],dealConfigurationAvailable:false}
  const id=context.provider.id
  const results=await Promise.all(['commerce_offerings','commerce_resources','commerce_menu_items','commerce_slots','commerce_bookings'].map(table=>table==='commerce_slots'?readPickupSlots(context.admin,id):context.admin.from(table).select('*').eq('provider_id',id).order('created_at',{ascending:false}).limit(table==='commerce_bookings'?250:1000)))
  if(results.some(r=>r.error)) throw new Error('commerce_migration_required')
  let deals:Record<string,unknown>[]=[],dealRules:Record<string,unknown>[]=[],dealConfigurationAvailable=false
  if(context.provider.test_mode) {
    const [available,configured]=await Promise.all([
      context.admin.from('deals').select('id,partner_id,public_title,reward_item,customer_description,terms,type,discount_type,active,benefit_category').eq('partner_id',context.provider.partner_id).eq('active',true).eq('benefit_category','direct_selectable').in('discount_type',['2for1','item','fixed','percent']).order('created_at',{ascending:false}),
      context.admin.from('commerce_deal_rules').select('provider_id,deal_id,enabled,menu_item_ids').eq('provider_id',id),
    ])
    if(!available.error&&!configured.error) {deals=available.data||[];dealRules=configured.data||[];dealConfigurationAvailable=true}
  }
  return {...context,offerings:results[0].data||[],resources:results[1].data||[],menu:results[2].data||[],slots:results[3].data||[],bookings:results[4].data||[],deals,dealRules,dealConfigurationAvailable}
}
