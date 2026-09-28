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
  if(['account_login_required','invalid_account_token','invalid_app_user','invalid_app_ticket','invalid_app_session','deal_authentication_required'].includes(message)) return Response.json({error:'Die Kontoverbindung ist abgelaufen. Bitte in der App zurückgehen und Bestellen erneut öffnen.'},{status:401})
  const dealErrors:Record<string,string>={
    deal_cart_ineligible:'Für diesen Deal fehlen passende Speisen im Warenkorb. Bei 2 für 1 werden mindestens zwei benötigt.',
    deal_min_spend:'Der Mindestbestellwert für diesen Deal ist noch nicht erreicht.',
    commerce_live_deals_not_enabled:'Deals bei Online-Bestellungen sind aktuell nur im Testmodus verfügbar.',
    deal_premium_required:'Für diesen Deal benötigst du Benefitsi Premium.',
    deal_test_limit:'Dieser Deal wurde bereits verwendet oder ist für eine andere Testbestellung reserviert.',
    deal_test_global_limit:'Dieser Deal ist für weitere Testbestellungen nicht mehr verfügbar.',
    deal_test_trial_used:'Dein Probe-Deal ist bereits verwendet oder für eine Testbestellung reserviert.',
    deal_trial_already_used:'Dein Probe-Deal wurde bereits verwendet.',
    deal_not_configured:'Dieser Deal ist noch nicht für Bestellungen eingerichtet.',
    deal_unavailable:'Dieser Deal ist nicht mehr verfügbar. Bitte prüfe deine Auswahl.',
  }
  if(dealErrors[message]||/^(deal_|invalid_deal_)/.test(message)) return Response.json({error:dealErrors[message]||'Dieser Deal kann derzeit nicht genutzt werden. Bitte prüfe die Bedingungen oder wähle ohne Deal.'},{status:409})
  // Do not expose SQL, customer details, account IDs, or internal exceptions.
  return Response.json({error:'Die Anfrage konnte nicht abgeschlossen werden. Bitte Verfügbarkeit und Angaben prüfen und erneut versuchen.'},{status:409})
}
