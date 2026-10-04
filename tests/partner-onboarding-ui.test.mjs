import assert from 'node:assert/strict'
import test from 'node:test'
import {createElement as h} from 'react'
import {renderToStaticMarkup as render} from 'react-dom/server'
import {billing,loadUi,partnerId} from './helpers/partner-ui-fixtures.mjs'
const {PartnerOnboarding}=loadUi('components/partner/partner-plan-panel.tsx')
function fixture(active=false){
 const data=billing(active)
 data.onboarding_microsite={slug:'synthetic-demo',status:'published',published_version_id:'version'}
 if(active){data.entitlements.state='manual_grant';data.subscription.source='admin_freegrant'}
 return data
}
const html=data=>render(h(PartnerOnboarding,{data,partnerId,onSaved:()=>{}}))
test('free partner gets explicit 14-day start, no public link before entitlement',()=>{
 const body=html(fixture())
 assert.match(body,/Onboarding jetzt starten/)
 assert.match(body,/<option value="14" selected="">/)
 assert.match(body,/kein automatischer Wechsel/)
 assert.doesNotMatch(body,/href="https:\/\/benefitsi.de\/partner\//)
})
test('active onboarding has public microsite, bounded extension and separate stop action',()=>{
 const body=html(fixture(true))
 assert.match(body,/href="https:\/\/benefitsi.de\/partner\/synthetic-demo"/)
 assert.match(body,/Onboarding verlängern/)
 assert.match(body,/Onboarding jetzt beenden/)
 assert.match(body,/name="expected_until" value="2026-10-30T00:00:00Z"/)
})
test('commercial, pending or unpublished partners cannot accidentally start a trial',()=>{
 const commercial=billing(true),pending=fixture(),unpublished=fixture()
 pending.billing_cases=[{state:'pending'}];unpublished.onboarding_microsite=null
 for(const data of [commercial,pending,unpublished])assert.doesNotMatch(html(data),/Onboarding jetzt starten|Onboarding verlängern/)
 const denied=fixture(true);denied.entitlements.features['microsite.publish']=false
 assert.doesNotMatch(html(denied),/href="https:\/\/benefitsi.de\/partner\//)
})
test('expiry offers a deliberate restart and retains history without a public link',()=>{
 const data=fixture(true);data.entitlements.state='free';data.entitlements.features['microsite.publish']=false
 const body=html(data)
 assert.match(body,/Onboarding beendet/);assert.match(body,/Onboarding jetzt starten/)
 assert.doesNotMatch(body,/Onboarding jetzt beenden|Öffentliche Microsite ansehen/)
})
