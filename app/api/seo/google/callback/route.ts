import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSession } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { GOOGLE_SCOPES, openSeoSecret, sealSeoSecret, validateOAuthState, type GoogleProvider } from '@/lib/seo/google-auth'
import { googleOAuthEnvironment, SEO_ORIGIN } from '@/lib/seo/google-connection'
import { requestJson } from '@/lib/seo/collectors/http'

export const runtime='nodejs'
export async function GET(request:Request) {
  const session=await getAdminSession()
  if(!session?.isAdmin)return NextResponse.json({error:'unauthorized'},{status:401})
  const jar=await cookies(),saved=jar.get('benefitsi_seo_oauth')?.value??''
  jar.set('benefitsi_seo_oauth','',{httpOnly:true,secure:true,sameSite:'lax',path:'/api/seo/google',maxAge:0})
  const done=(notice:string)=>NextResponse.redirect(`${SEO_ORIGIN}/seo/automatisierung?notice=${notice}`,303)
  try{
    const url=new URL(request.url),state=url.searchParams.get('state')??'',code=url.searchParams.get('code')??''
    if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!code||code.length>8192||url.searchParams.has('error'))return done('google_error')
    const env=googleOAuthEnvironment()
    if(!env.ready)return done('google_setup')
    const hash=createHash('sha256').update(state).digest('hex'),client=createAdminClient()
    const {data:row,error}=await client.from('seo_google_oauth_states').select('owner_id,provider,expires_at,used_at,encrypted_verifier').eq('state_hash',hash).abortSignal(AbortSignal.timeout(12000)).maybeSingle()
    if(error||!validateOAuthState(state,saved,row,session.user.id)||!row)return done('google_state')
    const provider=row.provider as GoogleProvider
    if(provider!=='gsc'&&provider!=='gbp')return done('google_state')
    // The conditional update is the replay lock, including concurrent callbacks.
    const consumed=await client.from('seo_google_oauth_states').update({used_at:new Date().toISOString()}).eq('state_hash',hash).eq('owner_id',session.user.id).is('used_at',null).gt('expires_at',new Date().toISOString()).select('state_hash').abortSignal(AbortSignal.timeout(12000)).maybeSingle()
    if(consumed.error||!consumed.data)return done('google_state')
    const verifier=openSeoSecret(row.encrypted_verifier,env.encryptionKey,`oauth:${hash}`)
    const token=await requestJson('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
        client_id:env.clientId,client_secret:env.clientSecret,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:`${SEO_ORIGIN}/api/seo/google/callback`,
      }),
    },{},15000,100000)
    const scopes=typeof token.scope==='string'?token.scope.split(/\s+/).filter(Boolean):[]
    const required=GOOGLE_SCOPES[provider]
    if(scopes.length!==1||scopes[0]!==required)return done('google_scope')
    if(typeof token.refresh_token!=='string'||!token.refresh_token)return done('google_refresh')
    const stored=await client.from('seo_google_connections').upsert({provider,encrypted_refresh_token:sealSeoSecret(token.refresh_token,env.encryptionKey,provider),scopes,connected_by:session.user.id,connected_at:new Date().toISOString()},{onConflict:'provider'}).abortSignal(AbortSignal.timeout(12000))
    if(stored.error)return done('google_error')
    return done('google_connected')
  }catch{return done('google_error')}
}
