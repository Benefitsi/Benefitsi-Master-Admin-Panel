import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAieoMeasurement, AIEO_STAGES } from '../lib/analytics/aieo-measurement.ts';
const scope={from:'2026-10-01T22:00:00.000Z',until:'2026-10-06T22:00:00.000Z',environment:'production',cityId:null};
const fixture=()=>({source:'benefitsi_aieo_observations_v1',from:scope.from,until_exclusive:scope.until,environment:scope.environment,city_id:null,coverage:'consented_observations',conversion_rate:null,stages:Object.fromEntries(Object.keys(AIEO_STAGES).map(key=>[key,{events:4,observed_actors:2,ai_referral_events:1}])),backend_consented:{visit_confirmed:3,redemption_confirmed:1}});
test('normalizes explicit counts and keeps AI referrals, native observations and backend completions separate',()=>{
 const value=normalizeAieoMeasurement(fixture(),scope);
 assert.equal(value.stages[0].events,4);assert.equal(value.stages[0].aiReferralEvents,1);assert.equal(value.confirmedRedemptions,1);
 assert.equal(value.stages.find(row=>row.key==='native_entries').actors,2);
});
test('missing, impossible or wrong-scope metrics never turn into a successful zero',()=>{
 for(const change of [r=>{delete r.stages.native_entries},r=>{delete r.backend_consented.visit_confirmed},r=>{r.stages.web_page_views.observed_actors=7},r=>{r.stages.web_page_views.ai_referral_events=7},r=>{r.city_id='other'},r=>{r.environment='test'},r=>{r.stages.web_page_views.events='0'},r=>{r.conversion_rate=.5}]) {const r=fixture();change(r);assert.throws(()=>normalizeAieoMeasurement(r,scope));}
});
