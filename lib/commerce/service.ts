import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDirectCheckout, retrieveDirectCheckout, expireDirectCheckout, refundDirectPayment } from '@/lib/stripe/direct-payments'
import { recoverableCheckout } from './checkout'
import { record, parseBookingRequest, safeBookingResult, parseGuestAccess, uuid } from './requests'
import { webOrigin } from './http'

export async function providerForPartner(partnerId:string) {
  const admin=createAdminClient()
  const result=await admin.from('booking_providers').select('id,partner_id,display_name').eq('partner_id',uuid(partnerId)).maybeSingle()
  if(result.error||!result.data) throw new Error('not_found')
  return {admin,provider:result.data}
}
export async function publicCatalog(partnerId:string) {
  const {admin,provider}=await providerForPartner(partnerId)
  const result=await admin.rpc('commerce_catalog',{p_provider_id:provider.id})
  if(result.error) throw new Error('catalog_failed')
  return result.data
}
export async function createCommerceBooking(value:unknown) {
  const input=parseBookingRequest(value)
  const {admin,provider}=await providerForPartner(input.partner_id)
  // SQL checks publication after resolving a matching idempotent replay.
  const offer=await admin.from('commerce_offerings').select('id').eq('id',input.offering_id).eq('provider_id',provider.id).maybeSingle()
  if(offer.error||!offer.data) throw new Error('not_found')
  const result=await admin.rpc('commerce_create_booking',{p_request:input})
  if(result.error) throw new Error(result.error.message === 'food_ordering_disabled' ? 'food_ordering_disabled' : 'booking_failed')
  return checkoutResult(admin,result.data)
}
async function expireElapsedHold(admin:ReturnType<typeof createAdminClient>,booking:Record<string,unknown>) {
  if(booking.state!=='payment_pending'||booking.payment_state!=='pending'||!booking.hold_expires_at||Date.parse(String(booking.hold_expires_at))>Date.now()) return
  const expired=await admin.rpc('commerce_apply_payment',{p_event:{event_id:`hold_expired_${booking.id}`,type:'expired',booking_id:booking.id,account_id:booking.stripe_account_id,amount_total:booking.total_amount,currency:booking.currency,livemode:false}})
  if(expired.error) throw new Error('checkout_cleanup_pending')
  Object.assign(booking,record(record(expired.data).booking))
}
async function checkoutResult(admin:ReturnType<typeof createAdminClient>,value:unknown) {
  const data=record(value),booking=record(data.booking)
  await expireElapsedHold(admin,booking)
  const response=await recoverableCheckout(data,webOrigin(),{
    readSession:retrieveDirectCheckout,
    createSession:async data=>createDirectCheckout({...data,currency:'eur'}),
    expireSession:async(id,account)=>{
      await expireDirectCheckout(id,account)
      const expired=await admin.rpc('commerce_apply_payment',{p_event:{event_id:`expire_${id}`,type:'expired',booking_id:booking.id,account_id:account,session_id:id,amount_total:booking.total_amount,currency:booking.currency,livemode:false}})
      if(expired.error) throw new Error('checkout_cleanup_pending')
    },
    attachSession:async (booking,id)=>{
      const attached=await admin.rpc('commerce_apply_payment',{p_event:{event_id:`attach_${id}`,type:'checkout_attached',booking_id:booking.id,account_id:booking.stripe_account_id,session_id:id,amount_total:booking.total_amount,currency:booking.currency,livemode:false}})
      if(attached.error||!record(attached.data).ok) throw new Error('checkout_attachment_failed')
    },
  })
  if(response.checkout_error) {
    // Cleanup may have changed state; keep the capability but return the current snapshot.
    const refreshed=await admin.from('commerce_bookings').select('*').eq('id',booking.id).single()
    if(!refreshed.error) response.booking=safeBookingResult({booking:{...refreshed.data,public_token:booking.public_token}}).booking
  }
  return response
}
export async function guestBooking(value:unknown,cancel=false) {
  const {reference,token}=parseGuestAccess(value),admin=createAdminClient()
  const result=await admin.rpc(cancel?'commerce_cancel_guest':'commerce_booking_status',{p_reference:reference,p_token:token})
  if(result.error||!result.data) throw new Error('not_found')
  if(cancel) {
    const booking=record(record(result.data).booking)
    await settleCancellation(admin,String(booking.id))
    const refreshed=await admin.rpc('commerce_booking_status',{p_reference:reference,p_token:token})
    if(refreshed.error) throw new Error('status_failed')
    return safeBookingResult(refreshed.data)
  }
  const publicBooking=record(record(result.data).booking)
  if(publicBooking.state==='payment_pending'&&publicBooking.hold_expires_at&&Date.parse(String(publicBooking.hold_expires_at))<=Date.now()) {
    const stored=await admin.from('commerce_bookings').select('*').eq('id',publicBooking.id).single()
    if(stored.error) throw new Error('status_failed')
    await expireElapsedHold(admin,stored.data)
    return safeBookingResult({booking:stored.data})
  }
  return safeBookingResult(result.data)
}
export async function resumeGuestPayment(value:unknown) {
  const {reference,token}=parseGuestAccess(value),admin=createAdminClient()
  // Establish the capability before reading any private Stripe/customer snapshot.
  const authorized=await admin.rpc('commerce_booking_status',{p_reference:reference,p_token:token})
  if(authorized.error||!authorized.data) throw new Error('not_found')
  const id=uuid(record(record(authorized.data).booking).id)
  const stored=await admin.from('commerce_bookings').select('*').eq('id',id).single()
  if(stored.error) throw new Error('not_found')
  return checkoutResult(admin,{ok:true,replayed:true,booking:{...stored.data,public_token:token}})
}
export async function settleCancellation(admin:ReturnType<typeof createAdminClient>,id:string) {
  const result=await admin.from('commerce_bookings').select('*').eq('id',uuid(id)).single()
  if(result.error) throw new Error(result.error.message === 'food_ordering_disabled' ? 'food_ordering_disabled' : 'booking_failed')
  const booking=result.data
  if(booking.payment_method!=='online') return
  if(booking.payment_state==='refund_pending'&&booking.stripe_payment_intent_id) {
    const refund=await refundDirectPayment({paymentIntentId:booking.stripe_payment_intent_id,accountId:booking.stripe_account_id,bookingId:id,idempotencyKey:`commerce-refund-${id}`})
    if(refund.status==='succeeded'&&refund.amount===booking.total_amount) {
      const applied=await admin.rpc('commerce_apply_payment',{p_event:{event_id:`refund_${refund.id}`,type:'refunded',booking_id:id,account_id:booking.stripe_account_id,payment_intent_id:booking.stripe_payment_intent_id,refund_id:refund.id,amount_total:refund.amount,currency:refund.currency,livemode:false}})
      if(applied.error) throw new Error('refund_pending')
    }
  } else if(booking.stripe_checkout_session_id&&['pending','unpaid'].includes(booking.payment_state)) {
    const session=await retrieveDirectCheckout(booking.stripe_checkout_session_id,booking.stripe_account_id)
    if(session.status==='open') await expireDirectCheckout(session.id,booking.stripe_account_id)
    if(session.status!=='complete') {
      const applied=await admin.rpc('commerce_apply_payment',{p_event:{event_id:`expire_${session.id}`,type:'expired',booking_id:id,account_id:booking.stripe_account_id,session_id:session.id,amount_total:booking.total_amount,currency:booking.currency,livemode:false}})
      if(applied.error) throw new Error('cancellation_pending')
    }
  }
}
