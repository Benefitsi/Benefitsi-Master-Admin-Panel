import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MicrositeCommerceActions, MicrositeIntegrationProvider } from '../components/microsite/microsite-integration.tsx'
import { micrositeCommerceActions } from '../lib/commerce/microsite-actions.ts'

const partnerId = '44444444-4444-4444-8444-444444444444'
const catalog = {provider:{partner_id:partnerId,food_ordering_enabled:true},offerings:[{kind:'food_pickup',slots:[{starts_at:'2099-01-01T12:00:00Z',remaining:5}]},{kind:'table',slots:[{starts_at:'2099-01-01T12:00:00Z',remaining:2}]}]}
test('booking actions belong to the requested partner and only available offerings',()=>{
 const result = micrositeCommerceActions(catalog,partnerId,'https://benefitsi.de')
 assert.deepEqual(result.map(a=>a.label),['Essen bestellen','Tisch reservieren'])
 assert.equal(result[0].href,`https://benefitsi.de/buchen/${partnerId}?kind=food_pickup`)
 assert.deepEqual(micrositeCommerceActions(catalog,'other','https://benefitsi.de'),[])
 assert.deepEqual(micrositeCommerceActions({...catalog,offerings:[{kind:'table',slots:[{starts_at:'2000-01-01',remaining:2}]}]},partnerId,'https://benefitsi.de'),[])
 assert.deepEqual(micrositeCommerceActions({...catalog,offerings:[{kind:'table',slots:[{starts_at:'2099-01-01',remaining:0}]}]},partnerId,'https://benefitsi.de'),[])
})
test('the original renderer action slot renders booking links and leaves disabled partners empty',()=>{
 const render = actions => renderToStaticMarkup(createElement(MicrositeIntegrationProvider,{value:{commerceActions:actions}},createElement(MicrositeCommerceActions)))
 assert.equal(render([]),'')
 const html=render(micrositeCommerceActions(catalog,partnerId,'https://benefitsi.de'))
 assert.match(html,/Essen bestellen/)
 assert.match(html,/Tisch reservieren/)
 assert.doesNotMatch(html,/knobidonerpizza|damichele-landau/)
})

test('admin-controlled ordering hides food actions without disabling table reservations',()=>{
 for(const enabled of [false,undefined,null,'true']) {
  const value={...catalog,provider:{...catalog.provider,food_ordering_enabled:enabled}}
  assert.deepEqual(micrositeCommerceActions(value,partnerId,'https://benefitsi.de').map(a=>a.kind),['table'])
 }
})
