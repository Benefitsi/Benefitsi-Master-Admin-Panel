import assert from 'node:assert/strict'
import test from 'node:test'
import { portalRoute, sessionCookieOptions } from '../lib/portal-routing.ts'

const cases=[
 ['partner.benefitsi.de','/','GET','redirect','https://partner.benefitsi.de/partner'],
 ['partner.benefitsi.de','/login','GET','redirect','https://partner.benefitsi.de/partner/login'],
 ['partner.benefitsi.de','/partner/login','GET','public'],
 ['partner.benefitsi.de','/partner','GET','partner'],
 ['partner.benefitsi.de','/partner/commerce','POST','partner'],
 ['partner.benefitsi.de','/analytics','GET','deny'],
 ['partner.benefitsi.de','/api/bookings/export','GET','deny'],
 ['partner.benefitsi.de','/api/stripe/connect/onboarding','POST','deny'],
 ['partner.benefitsi.de','/api/automation/tick','POST','deny'],
 ['partner.benefitsi.de','/api/commerce/catalog','GET','deny'],
 ['partner.benefitsi.de','/api/commerce/connect','POST','partner'],
 ['partner.benefitsi.de','/api/commerce/subscription','POST','partner'],
 ['admin.benefitsi.de','/api/commerce/connect','POST','admin'],
 ['partner.benefitsi.de','/login/anything','POST','deny'],
 ['admin.benefitsi.de','/partner','GET','redirect','https://partner.benefitsi.de/partner'],
 ['admin.benefitsi.de','/partner','POST','deny'],
 ['admin.benefitsi.de','/analytics','GET','admin'],
 ['admin.benefitsi.de','/api/bookings/export','GET','admin'],
 ['admin.benefitsi.de','/login','POST','public'],
 ['admin.benefitsi.de','/login/anything','GET','admin'],
 ['admin.benefitsi.de','/api/automation/tick','POST','machine'],
 ['admin.benefitsi.de','/api/automation/unknown','POST','admin'],
 ['admin.benefitsi.de','/api/stripe/webhook','POST','machine'],
 ['admin.benefitsi.de','/api/commerce/catalog','GET','machine'],
 ['preview.vercel.app','/analytics','GET','admin'],
 ['preview.vercel.app','/partner','GET','partner'],
 ['localhost:3010','/partner','GET','partner'],
 ['partner.benefitsi.de','/analytics.png','GET','deny'],
 ['partner.benefitsi.de','/partner%2f..%2fanalytics','GET','deny'],
 ['partner.benefitsi.de','/benefitsi-logo-on-light.svg','GET','public'],
]
for(const [host,path,method,kind,url] of cases) test(`${host} ${method} ${path} is ${kind}`,()=>{
 const result=portalRoute(host,path,method)
 assert.equal(result.kind,kind)
 if(url)assert.equal(result.url,url)
})
test('production cookies are host-only, secure, root-scoped and distinct',()=>{
 const admin=sessionCookieOptions('admin.benefitsi.de')
 const partner=sessionCookieOptions('partner.benefitsi.de')
 assert.notEqual(admin.name,partner.name)
 for(const c of [admin,partner]) {assert.match(c.name,/^__Host-/);assert.equal(c.secure,true);assert.equal(c.path,'/');assert.equal(c.domain,undefined);assert.equal(c.sameSite,'lax')}
 assert.equal(sessionCookieOptions('localhost:3010').secure,false)
})
