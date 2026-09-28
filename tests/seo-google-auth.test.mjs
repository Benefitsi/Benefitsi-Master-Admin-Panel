import test from 'node:test'
import assert from 'node:assert/strict'
import { sealSeoSecret, openSeoSecret, createGoogleAuthorization, validateOAuthState, seoWorkerAuthorized } from '../lib/seo/google-auth.ts'
const key=Buffer.alloc(32,7).toString('base64')
test('encrypted Google tokens require the correct key and provider binding',()=>{
 const encrypted=sealSeoSecret('private-refresh-token',key,'gsc')
 assert.equal(encrypted.includes('private-refresh-token'),false)
 assert.equal(openSeoSecret(encrypted,key,'gsc'),'private-refresh-token')
 assert.throws(()=>openSeoSecret(encrypted,Buffer.alloc(32,8).toString('base64'),'gsc'))
 assert.throws(()=>openSeoSecret(encrypted,key,'gbp'))
 assert.throws(()=>sealSeoSecret('token','short','gsc'))
})
test('Google authorization scopes and redirect are controlled server-side and use PKCE',()=>{
 const auth=createGoogleAuthorization('gsc','our-client','https://admin.benefitsi.de')
 const url=new URL(auth.url)
 assert.equal(url.origin,'https://accounts.google.com')
 assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/webmasters.readonly')
 assert.equal(url.searchParams.get('redirect_uri'),'https://admin.benefitsi.de/api/seo/google/callback')
 assert.equal(url.searchParams.get('code_challenge_method'),'S256')
 assert.equal(auth.state.length>=40,true)
 assert.throws(()=>createGoogleAuthorization('gsc','client','https://evil.example'))
})
test('OAuth callback rejects wrong cookie, owner, expired or consumed state',()=>{
 const now=new Date('2026-09-28T09:00:00Z')
 const row={owner_id:'admin-1',expires_at:'2026-09-28T09:05:00Z',used_at:null}
 assert.equal(validateOAuthState('abc','abc',row,'admin-1',now),true)
 assert.equal(validateOAuthState('abc','wrong',row,'admin-1',now),false)
 assert.equal(validateOAuthState('abc','abc',row,'admin-2',now),false)
 assert.equal(validateOAuthState('abc','abc',{...row,expires_at:'2026-09-28T08:59:00Z'},'admin-1',now),false)
 assert.equal(validateOAuthState('abc','abc',{...row,used_at:now.toISOString()},'admin-1',now),false)
})
test('worker rejects missing, short and non-ASCII bearer tokens without throwing',()=>{
 const secret='a'.repeat(40)
 assert.equal(seoWorkerAuthorized('Bearer '+secret,secret),true)
 for(const value of [null,'Bearer '+ 'b'.repeat(40),'Bearer '+ 'ä'.repeat(40)]) assert.equal(seoWorkerAuthorized(value,secret),false)
 assert.equal(seoWorkerAuthorized('Bearer short','short'),false)
})
