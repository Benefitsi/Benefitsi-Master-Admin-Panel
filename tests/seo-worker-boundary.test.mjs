import test from 'node:test'
import assert from 'node:assert/strict'
import {portalRoute} from '../lib/portal-routing.ts'
import {seoWorkerAuthorized} from '../lib/seo/google-auth.ts'
test('SEO worker uses its bearer gate only on the admin origin; partner origin stays denied',()=>{
 assert.equal(portalRoute('admin.benefitsi.de','/api/seo/collect','POST').kind,'machine')
 assert.equal(portalRoute('partner.benefitsi.de','/api/seo/collect','POST').kind,'deny')
 assert.equal(portalRoute('admin.benefitsi.de','/api/seo/google/connect','POST').kind,'admin')
 assert.equal(portalRoute('admin.benefitsi.de','/api/seo/google/callback','GET').kind,'admin')
 assert.equal(seoWorkerAuthorized(null,'test-secret-with-over-thirty-two-characters'),false)
 assert.equal(seoWorkerAuthorized('Bearer wrong','test-secret-with-over-thirty-two-characters'),false)
})
