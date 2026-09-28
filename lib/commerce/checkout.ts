import { record, safeBookingResult } from './requests'
export type CheckoutInput = {bookingId:string;reference:string;accountId:string;totalAmount:number;currency:string;email:string;expiresAt:string;successUrl:string;cancelUrl:string;idempotencyKey:string;idempotentReplay:boolean}
type Session = {id?:string;url:string|null;status?:string|null}
export type CheckoutDependencies = {
  readSession:(id:string,account:string)=>Promise<Session>;
  createSession:(input:CheckoutInput)=>Promise<Session>;
  attachSession:(booking:Record<string,unknown>,sessionId:string)=>Promise<void>;
  expireSession:(id:string,account:string)=>Promise<unknown>;
}
export async function checkoutBooking(value:unknown,origin:string,deps:CheckoutDependencies) {
  const result=record(value),booking=record(result.booking),response:{ok:boolean;replayed:boolean;booking:Record<string,unknown>;checkout_url?:string}=safeBookingResult(result)
  if(booking.payment_method!=='online'|| !['hold','pending','payment_pending'].includes(String(booking.state)) || !['pending','unpaid'].includes(String(booking.payment_state))) return response
  const account=String(booking.stripe_account_id),id=String(booking.id)
  if(booking.stripe_checkout_session_id) {
    const session=await deps.readSession(String(booking.stripe_checkout_session_id),account)
    if(session.status==='expired') {await deps.expireSession(String(booking.stripe_checkout_session_id),account);throw new Error('checkout_expired')}
    if(session.status==='open'&&session.url) response.checkout_url=session.url
    return response
  }
  const status=new URL(`/buchung/${encodeURIComponent(String(booking.public_reference))}`,origin)
  status.searchParams.set('token',String(booking.public_token))
  const customer=record(booking.customer)
  const created=await deps.createSession({bookingId:id,reference:String(booking.public_reference),accountId:account,totalAmount:Number(booking.total_amount),currency:String(booking.currency),email:String(customer.email),expiresAt:String(booking.hold_expires_at),successUrl:status.toString(),cancelUrl:status.toString(),idempotencyKey:`commerce-checkout-${id}`,idempotentReplay:result.replayed===true})
  if(!created.id) throw new Error('checkout_unavailable')
  const session={...created,...await deps.readSession(created.id,account)}
  if(session.status==='expired'&&session.id) {await deps.expireSession(session.id,account);throw new Error('checkout_expired')}
  if(session.status==='complete') return response
  if(!session.id||!session.url) throw new Error('checkout_unavailable')
  try {await deps.attachSession(booking,session.id)} catch(error) {
    await deps.expireSession(session.id,account)
    throw error
  }
  response.checkout_url=session.url
  return response
}

/** A committed booking must remain reachable even if the payment service fails. */
export async function recoverableCheckout(value:unknown,origin:string,deps:CheckoutDependencies) {
  try {return {...await checkoutBooking(value,origin,deps),checkout_error:undefined as string|undefined}}
  catch {return {...safeBookingResult(value),checkout_url:undefined as string|undefined,checkout_error:'Die Buchung wurde gespeichert. Die Zahlung konnte noch nicht geöffnet werden. Du kannst sie hier erneut versuchen oder die Buchung stornieren.'}}
}
