import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { GOOGLE_SCOPES, openSeoSecret, type GoogleProvider } from './google-auth'
import type { GoogleCredentials } from './collectors/types'

export const SEO_ORIGIN='https://admin.benefitsi.de'
export function googleOAuthEnvironment() {
  const clientId=process.env.SEO_GOOGLE_CLIENT_ID?.trim()??''
  const clientSecret=process.env.SEO_GOOGLE_CLIENT_SECRET?.trim()??''
  const encryptionKey=process.env.SEO_TOKEN_ENCRYPTION_KEY?.trim()??''
  return {clientId,clientSecret,encryptionKey,ready:!!clientId&&!!clientSecret&&/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey)}
}
export async function loadGoogleCredentials(provider:GoogleProvider):Promise<GoogleCredentials|null> {
  const env=googleOAuthEnvironment()
  if(!env.ready)return null
  const {data,error}=await createAdminClient().from('seo_google_connections').select('encrypted_refresh_token,scopes').eq('provider',provider).abortSignal(AbortSignal.timeout(12000)).maybeSingle()
  if(error)throw Error('connection_storage')
  if(!data)return null
  if(!Array.isArray(data.scopes)||!data.scopes.includes(GOOGLE_SCOPES[provider]))throw Error('connection_scope')
  return {clientId:env.clientId,clientSecret:env.clientSecret,refreshToken:openSeoSecret(data.encrypted_refresh_token,env.encryptionKey,provider)}
}
export async function googleConnectionReadiness() {
  const {data,error}=await createAdminClient().from('seo_google_connections').select('provider,connected_at').abortSignal(AbortSignal.timeout(12000))
  if(error)throw Error('connection_storage')
  return {oauthReady:googleOAuthEnvironment().ready,gsc:data?.find(r=>r.provider==='gsc')?.connected_at??null,gbp:data?.find(r=>r.provider==='gbp')?.connected_at??null}
}
