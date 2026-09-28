import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
export type GoogleProvider = 'gsc' | 'gbp'
export const GOOGLE_SCOPES: Record<GoogleProvider,string> = {
  gsc:'https://www.googleapis.com/auth/webmasters.readonly',
  gbp:'https://www.googleapis.com/auth/business.manage',
}
function encryptionKey(key: string) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key)) throw Error('invalid_encryption_key')
  const bytes=Buffer.from(key,'base64')
  if (bytes.length!==32) throw Error('invalid_encryption_key')
  return bytes
}
export function sealSeoSecret(value:string,key:string,context:string) {
  if (!value || value.length>8192) throw Error('invalid_secret')
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',encryptionKey(key),iv)
  cipher.setAAD(Buffer.from(`benefitsi-seo-v1:${context}`))
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()])
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.')
}
export function openSeoSecret(value:string,key:string,context:string) {
  const [version,iv,tag,encrypted,...rest]=value.split('.')
  if (version!=='v1'||!iv||!tag||!encrypted||rest.length||value.length>24000) throw Error('invalid_secret')
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(key),Buffer.from(iv,'base64url'))
  decipher.setAuthTag(Buffer.from(tag,'base64url'))
  decipher.setAAD(Buffer.from(`benefitsi-seo-v1:${context}`))
  return Buffer.concat([decipher.update(Buffer.from(encrypted,'base64url')),decipher.final()]).toString('utf8')
}
export function seoWorkerAuthorized(provided:string|null,secret:string|undefined) {
  if (!secret||secret.length<32||!provided) return false
  const a=Buffer.from(provided),b=Buffer.from(`Bearer ${secret}`)
  return a.length===b.length&&timingSafeEqual(a,b)
}
export function seoOAuthOrigin(value:string) {
  if(value!=='https://admin.benefitsi.de') throw Error('invalid_oauth_origin')
  return value
}
export function createGoogleAuthorization(provider:GoogleProvider,clientId:string,origin:string) {
  seoOAuthOrigin(origin)
  const state=randomBytes(32).toString('base64url'), verifier=randomBytes(48).toString('base64url')
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
  for (const [key,value] of Object.entries({
    client_id:clientId,redirect_uri:origin+'/api/seo/google/callback',response_type:'code',scope:GOOGLE_SCOPES[provider],
    state,access_type:'offline',prompt:'consent',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',
  })) url.searchParams.set(key,value)
  return {url:url.href,state,stateHash:createHash('sha256').update(state).digest('hex'),verifier}
}
export function validateOAuthState(state:string,cookie:string,row:{owner_id:string;expires_at:string;used_at:string|null}|null,owner:string,now=new Date()) {
  const a=Buffer.from(state),b=Buffer.from(cookie)
  return !!state && a.length===b.length && timingSafeEqual(a,b) && !!row && row.owner_id===owner && !row.used_at && Date.parse(row.expires_at)>now.getTime()
}
