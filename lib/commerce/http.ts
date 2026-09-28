import 'server-only'
import { timingSafeEqual } from 'node:crypto'
export function requireCommerceProxy(request:Request) {
  if(process.env.BENEFITSI_COMMERCE_ENABLED!=='true') throw new Error('commerce_disabled')
  const expected=process.env.BENEFITSI_BOOKING_PROXY_SECRET?.trim()||''
  const actual=request.headers.get('x-benefitsi-booking-secret')||''
  if(expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual))) throw new Error('unauthorized')
}
export async function requestBody(request:Request) {
  if(!request.headers.get('content-type')?.includes('application/json')) throw new Error('invalid_content_type')
  const reader=request.body?.getReader()
  if(!reader) throw new Error('invalid_request')
  let size=0;const chunks:Uint8Array[]=[]
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();throw new Error('request_too_large')}chunks.push(value)}}finally{reader.releaseLock()}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
export function webOrigin() {
  const url=new URL(process.env.BENEFITSI_BOOKING_WEB_ORIGIN||'https://benefitsi.de')
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('invalid_web_origin')
  return url.origin
}
export function commerceError(error:unknown) {
  const message=error instanceof Error?error.message:'unknown'
  if(message==='commerce_disabled') return Response.json({error:'Buchungen sind noch nicht freigeschaltet.'},{status:503})
  if(message==='food_ordering_disabled') return Response.json({error:'Dieser Partner nimmt derzeit keine Online-Bestellungen an.'},{status:409})
  if(message==='unauthorized') return Response.json({error:'Nicht autorisiert.'},{status:401})
  if(message==='not_found') return Response.json({error:'Buchung oder Angebot nicht gefunden.'},{status:404})
  if(message==='request_too_large') return Response.json({error:'Anfrage ist zu groß.'},{status:413})
  // Do not expose SQL, customer details, account IDs, or internal exceptions.
  return Response.json({error:'Die Anfrage konnte nicht abgeschlossen werden. Bitte Verfügbarkeit und Angaben prüfen und erneut versuchen.'},{status:409})
}
