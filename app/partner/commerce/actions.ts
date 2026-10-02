'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { commercePartner } from '@/lib/commerce/partner'
import { parseConfiguration, configurationFormInput, uuid } from '@/lib/commerce/requests'
import { berlinDateTime } from '@/lib/commerce/time'
import { settleCancellation } from '@/lib/commerce/service'
const tables:Record<string,string>={offering:'commerce_offerings',resource:'commerce_resources',menu:'commerce_menu_items',slot:'commerce_slots'}
function value(form:FormData,name:string) {return String(form.get(name)||'')}
function destination(provider:string,error?:string) {return `/partner/commerce?provider=${encodeURIComponent(provider)}${error?'&error='+error:''}`}
export async function saveCommerceConfiguration(form:FormData) {
  let providerId=value(form,'provider_id')
  let failed=false
  try {
    const input=configurationFormInput(form)
    if(input.entity==='slot') {input.starts_at=berlinDateTime(value(form,'starts_at'));input.ends_at=berlinDateTime(value(form,'ends_at'))}
    const parsed=parseConfiguration(input),table=tables[parsed.entity]
    providerId=parsed.providerId
    const {admin}=await commercePartner(providerId)
    parsed.data.provider_id=providerId
    // Validate every referenced object in the same tenant before privileged writes.
    for(const [field,target] of [['offering_id','commerce_offerings'],['resource_id','commerce_resources']]) {
      if(parsed.data[field]) {
        const relation=await admin.from(target).select('id').eq('id',String(parsed.data[field])).eq('provider_id',providerId).maybeSingle()
        if(relation.error||!relation.data) throw new Error('invalid_relation')
      }
    }
    const id=value(form,'id')
    if(id) {
      delete parsed.data.active
      const saved=await admin.from(table).update(parsed.data).eq('id',uuid(id)).eq('provider_id',providerId).select('id').single()
      if(saved.error) throw new Error('save_failed')
    } else {
      const saved=await admin.from(table).insert(parsed.data)
      if(saved.error) throw new Error('save_failed')
    }
  } catch {failed=true}
  revalidatePath('/partner/commerce')
  redirect(destination(providerId,failed?'save':undefined))
}
export async function toggleCommerceConfiguration(form:FormData) {
  const providerId=value(form,'provider_id');let failed=false
  try {
    const {admin}=await commercePartner(providerId),table=tables[value(form,'entity')]
    if(!table) throw new Error('invalid_entity')
    const saved=await admin.from(table).update({active:value(form,'active')==='true'}).eq('id',uuid(value(form,'id'))).eq('provider_id',providerId).select('id').single()
    if(saved.error) throw new Error('save_failed')
  } catch {failed=true}
  revalidatePath('/partner/commerce');redirect(destination(providerId,failed?'save':undefined))
}
export async function saveFoodPickupTimes(form:FormData) {
  let providerId=value(form,'provider_id'),failed=false
  try {
    const input=configurationFormInput(form)
    if(input.entity!=='slot')throw Error('invalid_entity')
    input.starts_at=berlinDateTime(value(form,'starts_at'));input.ends_at=berlinDateTime(value(form,'ends_at'))
    const parsed=parseConfiguration(input)
    providerId=parsed.providerId
    const {admin}=await commercePartner(providerId)
    const saved=await admin.rpc('commerce_create_food_slot_series',{
      p_provider_id:providerId,p_offering_id:parsed.data.offering_id,p_resource_id:parsed.data.resource_id,
      p_starts_at:parsed.data.starts_at,p_ends_at:parsed.data.ends_at,p_capacity:parsed.data.capacity,
    })
    if(saved.error)throw Error('save_failed')
  }catch{failed=true}
  revalidatePath('/partner/commerce');redirect(destination(providerId,failed?'save':undefined))
}
export async function transitionCommerceBooking(form:FormData) {
  const providerId=value(form,'provider_id');let failed=false
  try {
    const {admin,session}=await commercePartner(providerId)
    const bookingId=uuid(value(form,'booking_id')),action=value(form,'action')
    if(!['accept','ready','complete','cancel','mark_paid','retry_refund'].includes(action)) throw new Error('invalid_action')
    const owned=await admin.from('commerce_bookings').select('id').eq('id',bookingId).eq('provider_id',providerId).single()
    if(owned.error) throw new Error('unauthorized')
    if(action!=='retry_refund') {
      const changed=await admin.rpc('commerce_transition_booking',{p_provider_id:providerId,p_booking_id:bookingId,p_action:action,p_actor_id:session.user.id})
      if(changed.error) throw new Error('transition_failed')
    }
    if(action==='cancel'||action==='retry_refund') await settleCancellation(admin,bookingId)
  } catch {failed=true}
  revalidatePath('/partner/commerce');redirect(destination(providerId,failed?'transition':undefined))
}

export async function openSoftwareBilling(form:FormData) {
  const providerId=value(form,'provider_id')
  const {provider}=await commercePartner(providerId)
  if(value(form,'billing_action')!=='portal') redirect(`/partner/billing?partner=${provider?.partner_id ?? ''}`)
  const {createSoftwareBillingPortal}=await import('@/lib/stripe/software-billing')
  const {requirePartnerBaseUrl}=await import('@/lib/stripe/config')
  let url=''
  try {url=await createSoftwareBillingPortal(providerId,requirePartnerBaseUrl())}catch {redirect(destination(providerId,'billing'))}
  redirect(url)
}


export async function enablePartnerCommerce(form:FormData) {
  const context=await commercePartner(),partnerId=uuid(value(form,'partner_id'))
  const partner=context.partners.find(p=>p.id===partnerId)
  if(!partner) throw new Error('unauthorized')
  let providerId=context.providers.find(p=>p.partner_id===partnerId)?.id
  if(!providerId) {
    const created=await context.admin.rpc('create_booking_provider',{p_partner_id:partner.id,p_display_name:partner.name,p_support_email:partner.email||context.session.user.email||null,p_actor_id:context.session.user.id,p_actor_profile:'Partner-Einrichtung'})
    if(created.error) {
      const existing=await context.admin.from('booking_providers').select('id').eq('partner_id',partner.id).maybeSingle()
      if(existing.error||!existing.data) redirect('/partner/commerce?error=setup')
      providerId=existing.data.id
    } else providerId=created.data.provider_id
  }
  revalidatePath('/partner/commerce');redirect(destination(String(providerId)))
}

export async function openMerchantOnboarding(form:FormData) {
  const providerId=value(form,'provider_id')
  const {beginCommerceOnboarding}=await import('@/lib/stripe/commerce-connect')
  let url=''
  try {url=await beginCommerceOnboarding(providerId)}catch {redirect(destination(providerId,'merchant'))}
  redirect(url)
}
