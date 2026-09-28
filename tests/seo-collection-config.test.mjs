import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCollectionSettings, normalizeFreeBudget, requestContextKey, collectionHealth } from '../lib/seo/collection-config.ts'
const target={canonical_url:'https://www.knobidonerpizza-annweiler.de/',provider_config:{comparison:{version:1,channel:'organic',subjectUrl:'https://www.knobidonerpizza-annweiler.de/',keywords:['Döner Annweiler'],location:'Annweiler am Trifels, DE',locale:'de-DE',device:'mobile',latitude:null,longitude:null,partnerSince:null,packageStartedOn:null,baseline:null}}}
test('settings reject Search Console property belonging to a different partner',()=>{
 assert.throws(()=>normalizeCollectionSettings({enabled:true,gsc_enabled:true,gsc_property:'sc-domain:other.de'},target),/property/)
 assert.equal(normalizeCollectionSettings({enabled:true,gsc_enabled:true,gsc_property:'sc-domain:knobidonerpizza-annweiler.de'},target).gsc_property,'sc-domain:knobidonerpizza-annweiler.de')
})
test('rank tracking requires a fixed organic comparison context',()=>{
 assert.throws(()=>normalizeCollectionSettings({rank_enabled:true}, {...target,provider_config:{}}),/comparison/)
 assert.equal(normalizeCollectionSettings({rank_enabled:true},target).rank_enabled,true)
 assert.throws(()=>normalizeCollectionSettings({rank_enabled:true},{...target,provider_config:{comparison:{...target.provider_config.comparison,channel:'maps',subjectUrl:'https://www.google.com/maps/place/a',latitude:49,longitude:7}}}),/maps/)
})
test('free allowance defaults to zero and cannot be enabled without explicit free-only confirmation',()=>{
 assert.deepEqual(normalizeFreeBudget({}),{monthly_request_limit:0,free_tier_confirmed:false})
 assert.throws(()=>normalizeFreeBudget({monthly_request_limit:1000}),/confirmation/)
 assert.throws(()=>normalizeFreeBudget({monthly_request_limit:4501,free_tier_confirmed:true}),/limit/)
 assert.deepEqual(normalizeFreeBudget({monthly_request_limit:4000,free_tier_confirmed:true}),{monthly_request_limit:4000,free_tier_confirmed:true})
})
test('cache shares identical search conditions but isolates device, location and locale',()=>{
 const c=target.provider_config.comparison
 assert.equal(requestContextKey(c,'Döner Annweiler'),requestContextKey({...c,subjectUrl:'https://other.de'},'Döner Annweiler'))
 assert.notEqual(requestContextKey(c,'Döner Annweiler'),requestContextKey({...c,device:'desktop'},'Döner Annweiler'))
 assert.notEqual(requestContextKey(c,'Döner Annweiler'),requestContextKey({...c,location:'Landau'},'Döner Annweiler'))
})
test('health never treats enabled as proof of a recent successful worker tick',()=>{
 const now=new Date('2026-09-28T09:00:00Z')
 assert.equal(collectionHealth({enabled:true,last_tick_finished_at:null,last_tick_error:null},[],now).some(x=>x.code==='worker_never_ran'),true)
 assert.equal(collectionHealth({enabled:true,last_tick_finished_at:'2026-09-28T06:00:00Z',last_tick_error:null},[],now).some(x=>x.code==='worker_stale'),true)
 assert.equal(collectionHealth({enabled:true,last_tick_finished_at:'2026-09-28T08:50:00Z',last_tick_error:null},[{status:'blocked',state:'auth_error',target_id:'one',kind:'gsc'}],now).some(x=>x.code==='provider_auth_error'),true)
})
