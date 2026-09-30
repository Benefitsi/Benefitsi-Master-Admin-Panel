import assert from 'node:assert/strict'
import test from 'node:test'
import {loadTypescript} from './helpers/load-typescript.mjs'
for(const action of ['portal'])test(`partner ${action} returns through the partner origin`,async()=>{
 const code=loadTypescript('app/partner/commerce/actions.ts',{
  'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:url=>{throw Error('redirect:'+url)}},
  '@/lib/commerce/partner':{commercePartner:async()=>({session:{user:{email:'owner@example.invalid'}}})},
  '@/lib/commerce/requests':{},'@/lib/commerce/time':{},'@/lib/commerce/service':{},
  '@/lib/stripe/config':{requireBookingBaseUrl:()=> 'https://admin.benefitsi.de',requirePartnerBaseUrl:()=> 'https://partner.benefitsi.de'},
  '@/lib/stripe/software-billing':{
   createSoftwareBillingPortal:async(_id,origin)=>{assert.equal(origin,'https://partner.benefitsi.de');return 'https://billing.stripe.com/session'},
   createSoftwareSubscription:async(_id,_email,origin)=>{assert.equal(origin,'https://partner.benefitsi.de');return 'https://billing.stripe.com/session'},
  },
 })
 const form=new FormData();form.set('provider_id','test-provider');form.set('billing_action',action)
 await assert.rejects(code.openSoftwareBilling(form),/redirect:https:\/\/billing.stripe.com\/session/)
})
