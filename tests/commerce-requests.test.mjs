import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBookingRequest, parseGuestAccess, parseConfiguration, safeBookingResult } from '../lib/commerce/requests.ts'
const provider = '11111111-1111-4111-8111-111111111111'
const offering = '22222222-2222-4222-8222-222222222222'
const slot = '33333333-3333-4333-8333-333333333333'
const request = { partner_id:provider,offering_id:offering,slot_id:slot,quantity:2,items:[],customer:{name:' Anna ',email:'ANNA@example.de',phone:'01234',notes:''},payment_method:'pay_on_site',idempotency_key:'retry-key-1234567890' }
test('normalizes contact data but never accepts browser-supplied totals or provider IDs',()=>{
 const parsed=parseBookingRequest({...request,total_amount:1,provider_id:slot})
 assert.equal(parsed.customer.name,'Anna'); assert.equal(parsed.customer.email,'anna@example.de')
 assert.equal('total_amount' in parsed,false); assert.equal('provider_id' in parsed,false)
})
test('rejects malformed IDs, fractional quantities, unknown payment types and invalid contact data',()=>{
 for(const change of [{quantity:1.5},{partner_id:'no'},{payment_method:'wallet'},{customer:{...request.customer,email:'bad'}},{idempotency_key:'short'}]) assert.throws(()=>parseBookingRequest({...request,...change}))
})
test('preserves item references and rejects duplicates and oversized carts',()=>{
 const item={menu_item_id:provider,quantity:2,extra_ids:['cheese']}
 assert.deepEqual(parseBookingRequest({...request,items:[item]}).items,[item])
 assert.throws(()=>parseBookingRequest({...request,items:[{...item,extra_ids:['cheese','cheese']}]}))
 assert.throws(()=>parseBookingRequest({...request,items:Array.from({length:51},()=>item)}))
})
test('guest lookup needs unguessable capability as well as reference',()=>{
 assert.throws(()=>parseGuestAccess({reference:'ABC123',token:'short'}))
 assert.deepEqual(parseGuestAccess({reference:'ABC123',token:'a'.repeat(64)}),{reference:'ABC123',token:'a'.repeat(64)})
})
test('configuration rejects impossible appointments, negative cents and invalid timestamps',()=>{
 assert.throws(()=>parseConfiguration({entity:'offering',provider_id:provider,kind:'appointment',title:'Haarschnitt',description:'',unit_amount:2500,duration_minutes:0,payment_modes:['pay_on_site']}))
 assert.throws(()=>parseConfiguration({entity:'menu',provider_id:provider,offering_id:offering,title:'Pizza',unit_amount:-1}))
 assert.throws(()=>parseConfiguration({entity:'slot',provider_id:provider,offering_id:offering,resource_id:slot,starts_at:'2027-01-01T13:00:00Z',ends_at:'2027-01-01T12:00:00Z',capacity:1}))
 const c=parseConfiguration({entity:'resource',provider_id:provider,kind:'table',name:'Tisch 1',capacity:4});assert.equal(c.data.capacity,4)
})
test('offering settings validate lead time and hero images for every booking kind',()=>{
 const config={entity:'offering',provider_id:provider,title:'Book here',unit_amount:0,duration_minutes:30,payment_modes:['pay_on_site']}
 for(const kind of ['food_pickup','table','appointment']) {
  const defaults=parseConfiguration({...config,kind}).data
  assert.equal(defaults.lead_time_minutes,0);assert.equal(defaults.hero_image_url,null)
  for(const lead_time_minutes of [0,'30',10080]) {
   const data=parseConfiguration({...config,kind,lead_time_minutes,hero_image_url:' https://images.example.test/hero.jpg '}).data
   assert.equal(data.lead_time_minutes,Number(lead_time_minutes));assert.equal(data.hero_image_url,'https://images.example.test/hero.jpg')
  }
  assert.equal(parseConfiguration({...config,kind,hero_image_url:'/commerce/hero.png'}).data.hero_image_url,'/commerce/hero.png')
  for(const lead_time_minutes of [-1,1.5,10081,'','bad',true]) assert.throws(()=>parseConfiguration({...config,kind,lead_time_minutes}))
  for(const hero_image_url of ['http://images.example.test/x','//other.test/x','/\\other.test/x','javascript:alert(1)','https://user:pass@example.test/x','https://example.test/a b','https://','https:///example.test/hero.jpg']) assert.throws(()=>parseConfiguration({...config,kind,hero_image_url}))
 }
})
test('offering form retains lead time and hero image settings through validated transport',async()=>{
 const {configurationFormInput}=await import('../lib/commerce/requests.ts')
 const form=new FormData()
 for(const [key,value] of Object.entries({entity:'offering',provider_id:provider,kind:'food_pickup',title:'Book here',unit_amount:'0',duration_minutes:'30',lead_time_minutes:'75',hero_image_url:'/commerce/hero.png',payment_modes:'pay_on_site',fulfillment_modes:'pickup'})) form.set(key,value)
 const data=parseConfiguration(configurationFormInput(form)).data
 assert.equal(data.lead_time_minutes,75);assert.equal(data.hero_image_url,'/commerce/hero.png')
 form.set('lead_time_minutes','75.5');assert.throws(()=>parseConfiguration(configurationFormInput(form)))
})
test('guest response strips personal data and payment account identifiers',()=>{
 const b=safeBookingResult({ok:true,booking:{id:provider,public_reference:'ABC123',public_token:'a'.repeat(64),state:'confirmed',total_amount:1000,stripe_account_id:'acct_secret',customer:{email:'x@example.de'},request_fingerprint:'secret'}})
 assert.equal(b.booking.public_reference,'ABC123');assert.equal(b.booking.stripe_account_id,undefined);assert.equal(b.booking.customer,undefined)
})

test('food request preserves customizations and normalized delivery without browser prices',()=>{
 const item={menu_item_id:provider,quantity:2,extra_ids:[],variant_id:'large',option_ids:[{group_id:'dough',option_id:'normal'}],removed_ingredient_ids:['basil'],note:' Please slice '}
 const parsed=parseBookingRequest({...request,items:[item],fulfillment_mode:'delivery',delivery_address:{street:' Main 1 ',postal_code:' 10115 ',city:' Berlin ',details:'Floor 2'},delivery_fee:0})
 assert.equal(parsed.items[0].variant_id,'large');assert.deepEqual(parsed.items[0].option_ids,item.option_ids);assert.deepEqual(parsed.items[0].removed_ingredient_ids,['basil']);assert.equal(parsed.items[0].note,'Please slice')
 assert.equal(parsed.fulfillment_mode,'delivery');assert.equal(parsed.delivery_address.postal_code,'10115');assert.equal(parsed.delivery_fee,undefined)
 for(const change of [{fulfillment_mode:'courier'},{fulfillment_mode:'delivery',delivery_address:{street:'Main 1',postal_code:'1011',city:'Berlin'}},{items:[{...item,option_ids:[...item.option_ids,...item.option_ids]}]},{items:[{...item,note:'x'.repeat(501)}]}]) assert.throws(()=>parseBookingRequest({...request,...change}))
})
test('menu and delivery configuration validate nested IDs, defaults, limits and postcode overlap',()=>{
 const menu={entity:'menu',provider_id:provider,offering_id:offering,title:'Pizza',unit_amount:1000,category:'Pizza',image_url:'/food/pizza.webp',variants:[{id:'large',title:'Large',unit_amount:1500,default:true}],option_groups:[{id:'dough',title:'Dough',min:1,max:1,options:[{id:'normal',title:'Normal',unit_amount:0,default:true}]}],ingredients:[{id:'basil',title:'Basil',removable:true}]}
 assert.deepEqual(parseConfiguration(menu).data.variants,menu.variants)
 for(const change of [{image_url:'javascript:alert(1)'},{image_url:'https://example.com/pizza image.jpg'},{image_url:'//evil.example/pizza'},{image_url:'https://user:pass@evil.example/pizza'},{variants:[...menu.variants,...menu.variants]},{option_groups:[{...menu.option_groups[0],min:2}]},{ingredients:[{id:'basil',title:'Basil',removable:'yes'}]}]) assert.throws(()=>parseConfiguration({...menu,...change}))
 const offeringConfig={entity:'offering',provider_id:provider,kind:'food_pickup',title:'Pizza order',unit_amount:0,duration_minutes:15,payment_modes:['pay_on_site'],fulfillment_modes:['pickup','delivery'],pickup_address:'Main 1',delivery_zones:[{id:'central',label:'Centre',postal_codes:['10115'],minimum_order_amount:2000,delivery_fee:300,free_delivery_from:4000}]}
 assert.deepEqual(parseConfiguration(offeringConfig).data.delivery_zones,offeringConfig.delivery_zones)
 assert.throws(()=>parseConfiguration({...offeringConfig,delivery_zones:[...offeringConfig.delivery_zones,{...offeringConfig.delivery_zones[0],id:'other'}]}))
 assert.throws(()=>parseConfiguration({...offeringConfig,kind:'table'}))
})

test('partner food form decoding preserves visual selections and rejects malformed serialized arrays',async()=>{
 const {configurationFormInput}=await import('../lib/commerce/requests.ts')
 const form=new FormData();for(const [key,value] of Object.entries({entity:'menu',provider_id:provider,offering_id:offering,title:'Pizza',unit_amount:'1000',variants:'[{"id":"large","title":"Large","unit_amount":1500}]',ingredients:'[{"id":"basil","title":"Basil","removable":true}]',option_groups:'[]',extra_title_0:'Cheese',extra_price_0:'200'})) form.set(key,value)
 form.set('option_groups',JSON.stringify([{id:'dough',title:'Teig',min:'1',max:'1',options:[{id:'normal',title:'Normal',unit_amount:'0',default:true},{id:'special',title:'Spezial',unit_amount:'250',default:false}]}]))
 const parsed=parseConfiguration(configurationFormInput(form));assert.equal(parsed.data.variants[0].unit_amount,1500);assert.equal(parsed.data.extras[0].title,'Cheese')
 assert.deepEqual(parsed.data.option_groups,[{id:'dough',title:'Teig',min:1,max:1,options:[{id:'normal',title:'Normal',unit_amount:0,default:true},{id:'special',title:'Spezial',unit_amount:250,default:false}]}])
 form.set('option_groups',JSON.stringify([{id:'dough',title:'Teig',min:0,max:1,options:[{id:'special',title:'Spezial',unit_amount:'',default:false}]}]))
 assert.throws(()=>parseConfiguration(configurationFormInput(form)))
 form.set('option_groups','[]');assert.deepEqual(parseConfiguration(configurationFormInput(form)).data.option_groups,[])
 form.set('option_groups','broken');assert.throws(()=>configurationFormInput(form))
})

test('safe food booking response keeps receipt fields but no unrelated customer data',()=>{
 const booking=safeBookingResult({booking:{subtotal_amount:2000,delivery_fee:300,total_amount:2300,fulfillment_mode:'delivery',delivery_address:{street:'Main 1',postal_code:'10115',city:'Berlin'},pickup_address:'Shop 2',customer:{email:'private@example.test'},stripe_account_id:'acct_private'}}).booking
 assert.equal(booking.subtotal_amount,2000);assert.equal(booking.delivery_fee,300);assert.equal(booking.fulfillment_mode,'delivery');assert.equal(booking.delivery_address.street,'Main 1');assert.equal(booking.customer,undefined)
})
