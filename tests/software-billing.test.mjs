import assert from 'node:assert/strict'
import test from 'node:test'
const price={id:'price_Monthly',active:true,livemode:false,currency:'eur',unit_amount:2900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'},type:'recurring'}
test('software billing accepts only an explicitly configured test EUR monthly price',async()=>{
 const {validateSoftwarePrice}=await import('../lib/stripe/software-billing-contracts.ts')
 assert.equal(validateSoftwarePrice(price,'price_Monthly').unit_amount,2900)
 for(const bad of [{...price,livemode:true},{...price,currency:'usd'},{...price,active:false},{...price,unit_amount:null},{...price,recurring:{interval:'year',interval_count:1}},{...price,recurring:{interval:'month',interval_count:3}},{...price,recurring:{interval:'month',interval_count:1,usage_type:'metered'}}])assert.throws(()=>validateSoftwarePrice(bad,'price_Monthly'))
 assert.throws(()=>validateSoftwarePrice(price,'price_Another'))
})
test('software subscription is a separate platform customer charge without merchant transfers',async()=>{
 const {buildSoftwareSubscription}=await import('../lib/stripe/software-billing-contracts.ts')
 const params=buildSoftwareSubscription({providerId:'provider-123',customerId:'cus_Software',priceId:'price_Monthly',origin:'http://localhost:3011'})
 assert.equal(params.mode,'subscription')
 assert.equal(params.customer,'cus_Software')
 assert.deepEqual(params.line_items,[{price:'price_Monthly',quantity:1}])
 assert.equal(params.metadata.benefitsi_billing_provider_id,'provider-123')
 assert.equal(params.subscription_data.metadata.benefitsi_billing_provider_id,'provider-123')
 assert.equal(params.subscription_data.application_fee_percent,undefined)
 assert.equal(params.subscription_data.transfer_data,undefined)
 assert.equal(params.customer_account,undefined)
 assert.throws(()=>buildSoftwareSubscription({providerId:'provider-123',customerId:'acct_Merchant',priceId:'price_Monthly',origin:'http://localhost:3011'}))
})
