import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSession } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { createGoogleAuthorization, sealSeoSecret } from '@/lib/seo/google-auth'
import { googleOAuthEnvironment, SEO_ORIGIN } from '@/lib/seo/google-connection'

export const runtime='nodejs'
export async function POST(request:Request) {
  const session=await getAdminSession()
  if(!session?.isAdmin)return NextResponse.json({error:'unauthorized'},{status:401})
  if(request.headers.get('origin')!==SEO_ORIGIN)return NextResponse.json({error:'invalid_origin'},{status:403})
  try{
    const form=await request.formData(),provider=form.get('provider')
    if(provider!=='gsc'&&provider!=='gbp')return NextResponse.json({error:'invalid_provider'},{status:400})
    const env=googleOAuthEnvironment()
    if(!env.ready)return NextResponse.redirect(`${SEO_ORIGIN}/seo/automatisierung?notice=google_setup`,303)
    const auth=createGoogleAuthorization(provider,env.clientId,SEO_ORIGIN)
    const client=createAdminClient()
    const {error}=await client.from('seo_google_oauth_states').insert({
      state_hash:auth.stateHash,owner_id:session.user.id,provider,
      encrypted_verifier:sealSeoSecret(auth.verifier,env.encryptionKey,`oauth:${auth.stateHash}`),expires_at:new Date(Date.now()+10*60_000).toISOString(),
    }).abortSignal(AbortSignal.timeout(12000))
    if(error)throw Error('oauth_storage')
    const jar=await cookies()
    jar.set('benefitsi_seo_oauth',auth.state,{httpOnly:true,secure:true,sameSite:'lax',path:'/api/seo/google',maxAge:600})
    return NextResponse.redirect(auth.url,303)
  }catch{return NextResponse.redirect(`${SEO_ORIGIN}/seo/automatisierung?notice=google_error`,303)}
}
