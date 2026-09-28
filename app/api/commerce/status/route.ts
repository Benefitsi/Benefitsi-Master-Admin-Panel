import { requireCommerceProxy, commerceError, requestBody } from '@/lib/commerce/http'
import { guestBooking, resumeGuestPayment } from '@/lib/commerce/service'
import { record } from '@/lib/commerce/requests'
export async function GET(request:Request) {try {requireCommerceProxy(request);const q=new URL(request.url).searchParams;return Response.json(await guestBooking({reference:q.get('reference'),token:q.get('token')}),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})}catch(error){return commerceError(error)}}
export async function POST(request:Request) {
  try {
    requireCommerceProxy(request)
    const body=record(await requestBody(request))
    if(body.action!==undefined&&body.action!=='cancel'&&body.action!=='resume_payment') throw new Error('invalid_action')
    const result=body.action==='resume_payment'?await resumeGuestPayment(body):await guestBooking(body,true)
    return Response.json(result,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
  }catch(error){return commerceError(error)}
}
