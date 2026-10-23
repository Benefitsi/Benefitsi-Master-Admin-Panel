import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { id, contractId, periodId, intent, customer, invoice, now, transport, provider, moduleAt } from './helpers/corporate-recurring-fixtures.mjs'
const proxySecret='synthetic-proxy-secret-32-characters-long'
function harness({revoked=false, revokeAfterNetwork=false, sessionChanges={}, recoveryState='pending', recoveryBlocked=false,rpcDenied=false}={}) {
 const t=transport({'/v1/invoices/in_synthetic':{...invoice,status:'open'},'/v1/checkout/sessions/cs_test_synthetic':()=>({id:'cs_test_synthetic',object:'checkout.session',livemode:false,customer:customer.id,metadata:customer.metadata,mode:'setup',status:'open',url:'https://checkout.stripe.com/c/pay/test',expires_at:now/1000+600,...sessionChanges})}),rpcCalls=[];let authCount=0
 const context={status:'ok',company_id:id,contract_id:contractId,period_id:periodId,environment:'test',provider_account_ref:'acct_synthetic',customer_ref:customer.id,invoice_ref:'in_synthetic',setup_request_id:id,setup_session_ref:'cs_test_synthetic',return_origin:'https://web.example.test',version:intent.expected_version}
 const dto={status:'ok',company_id:id,contract:{contract_id:contractId},payment_setup:{state:'pending',setup_request_id:id,operation_id:id,checkout_url:'https://checkout.stripe.com/c/pay/test',checkout_expires_at:new Date(now+600000).toISOString()}}
 const client=createClient('https://synthetic.supabase.invalid','synthetic-publishable',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{const name=new URL(url).pathname.split('/').at(-1);rpcCalls.push({name,body:JSON.parse(init.body),authorization:new Headers(init.headers).get('Authorization')});return rpcDenied?Response.json({code:'42501',message:'corporate_access_denied'},{status:403}):Response.json(name==='get_corporate_contract'?revoked?{status:'unavailable'}:dto:name==='get_corporate_payment_context'?context:{status:'requested',operation_id:id,setup_request_id:id})}}})
 const deps={origin:'https://web.example.test',proxySecret,provider:provider(t),owner:async token=>({authenticate:async()=>{authCount++;return token==='original.jwt'&&!(revokeAfterNetwork&&t.calls.length>0)},rpc:async(name,args)=>{const r=await client.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}}),worker:{run:async()=>({status:'recorded',setup_request_id:id,next_operation_id:null})},reconciler:{reconcile:async()=>({status:recoveryState}),context:async()=>({intent:{...intent,recovery_blocked:recoveryBlocked},contract_review_required:false})}}
 const call=async(mode='status',body={companyId:id,contractId,requestId:id},headers={})=>moduleAt('lib/corporate/billing-http.ts').ownerBillingRequest(new Request('https://admin.example.test/api/corporate/billing/'+mode,{method:'POST',headers:{Origin:deps.origin,Authorization:'Bearer original.jwt','x-benefitsi-corporate-proxy-secret':proxySecret,'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),mode,deps)
 return{call,t,rpcCalls,get authCount(){return authCount}}
}
test('proxy alone, JWT alone, foreign origin, employee and extra authority fields fail closed',async()=>{
 for(const headers of [{Authorization:''},{'x-benefitsi-corporate-proxy-secret':''},{Origin:'https://evil.test'}]){const h=harness(),r=await h.call('status',undefined,headers);assert.ok([401,403].includes(r.status));assert.equal(h.t.calls.length,0)}
 const employee=harness({revoked:true});assert.equal((await employee.call()).status,403);assert.equal(employee.t.calls.length,0)
 const h=harness();assert.equal((await h.call('status',{companyId:id,contractId,requestId:id,user_id:id})).status,400)
})
test('original actor is reread after provider network before exposing checkout URL',async()=>{
 const good=harness();const r=await good.call();assert.equal(r.status,200);assert.equal((await r.json()).checkoutUrl,'https://checkout.stripe.com/c/pay/test');assert.ok(good.authCount>=2);assert.match(r.headers.get('cache-control'),/no-store/)
 const revoked=harness({revokeAfterNetwork:true});const denied=await revoked.call();assert.equal(denied.status,403);assert.equal((await denied.text()).includes('checkout.stripe.com'),false)
})
test('foreign setup Customer and deceptive URL never escape the route',async()=>{
 for(const sessionChanges of [{customer:'cus_foreign'},{url:'https://checkout.stripe.com.evil.test/a'}]){const h=harness({sessionChanges});assert.equal((await h.call()).status,503)}
})
test('raw signed webhook requires distinct secret, exact account and test mode',async()=>{
 const m=moduleAt('lib/corporate/billing-http.ts'),t=transport(),secret='whsec_synthetic_corporate',payload=JSON.stringify({id:'evt_synthetic',object:'event',type:'invoice.paid',livemode:false,data:{object:{id:'in_synthetic',object:'invoice'}}}),sig=t.stripe.webhooks.generateTestHeaderString({payload,secret});let received=0
 const deps={secret,stripe:t.stripe,account:'acct_synthetic',receive:async()=>{received++}}
 for(const [body,signature] of [[payload,sig],[payload+' ',sig],[payload,'bad']]){const r=await m.corporateWebhook(new Request('https://admin.example.test/api/corporate/billing/webhook',{method:'POST',headers:{'stripe-signature':signature},body}),deps);assert.equal(r.status,body===payload&&signature===sig?200:400)}assert.equal(received,1)
 for(const change of [{livemode:true},{account:'acct_other'}]){const body=JSON.stringify({...JSON.parse(payload),...change}),signature=t.stripe.webhooks.generateTestHeaderString({payload:body,secret});assert.equal((await m.corporateWebhook(new Request('https://admin.example.test',{method:'POST',headers:{'stripe-signature':signature},body}),deps)).status,400)}
})
test('runtime readiness rejects missing secrets, wrong account, live key and absent notice policy',()=>{
 const m=moduleAt('lib/corporate/billing-runtime.ts'),env={BENEFITSI_CORPORATE_BILLING_ENABLED:'true',BENEFITSI_CORPORATE_STRIPE_ACCOUNT:'acct_1T3ZuLH0Ev7iKGq0',BENEFITSI_CORPORATE_WEB_ORIGIN:'https://web.example.test',BENEFITSI_CORPORATE_PROXY_SECRET:proxySecret,BENEFITSI_CORPORATE_WORKER_SECRET:proxySecret,STRIPE_CORPORATE_WEBHOOK_SECRET:'whsec_synthetic',STRIPE_SECRET_KEY:'sk_test_synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-publishable',BENEFITSI_CORPORATE_PROVIDER_POLICY_EVIDENCE:'synthetic-policy',BENEFITSI_CORPORATE_REQUIRED_NOTICES_EVIDENCE:'synthetic-notice-policy'}
 assert.equal(m.corporateReadiness(env).configured,true)
 for(const change of [{BENEFITSI_CORPORATE_WORKER_SECRET:''},{STRIPE_SECRET_KEY:'sk_live_never_allowed'},{BENEFITSI_CORPORATE_STRIPE_ACCOUNT:'acct_other'},{BENEFITSI_CORPORATE_REQUIRED_NOTICES_EVIDENCE:''}])assert.equal(m.corporateReadiness({...env,...change}).configured,false)
})
test('runtime owner preserves original JWT through real Supabase client and rejects deletion',async()=>{
 const { originalOwner }=moduleAt('lib/corporate/billing-runtime.ts'),calls=[]
 const fetcher=async(url,init)=>{calls.push({path:new URL(url).pathname,authorization:new Headers(init.headers).get('Authorization'),body:init.body});return Response.json(new URL(url).pathname.endsWith('/user')?{id,email:'owner@example.test',email_confirmed_at:'2026-10-01',is_anonymous:false}:new URL(url).pathname.endsWith('account_deletion_active')?false:{status:'ok'})}
 const owner=originalOwner('original.jwt',{url:'https://synthetic.supabase.invalid',publishableKey:'synthetic-publishable'},fetcher);assert.equal(await owner.authenticate(),true);await owner.rpc('get_corporate_contract',{p_company_id:id});assert.ok(calls.every(c=>c.authorization==='Bearer original.jwt'));assert.ok(calls.some(c=>c.path.endsWith('account_deletion_active')));const deleted=originalOwner('original.jwt',{url:'https://synthetic.supabase.invalid',publishableKey:'synthetic-publishable'},async(url,init)=>new URL(url).pathname.endsWith('account_deletion_active')?Response.json(true):fetcher(url,init));assert.equal(await deleted.authenticate(),false)
})
test('contact sweep reconciliation failure still executes prioritized protective worker',async()=>{
 const { corporateTick }=moduleAt('lib/corporate/billing-runtime.ts');const calls=[];const rpc=async(name,args)=>{calls.push({name,args});return name==='sweep_corporate_billing_contacts'?{status:'ok',reconcile:[{invoice_ref:'in_synthetic'}]}:{status:'ok'}}
 await assert.rejects(corporateTick({provider:provider(transport()),rpc,worker:{run:async()=>{calls.push({name:'protected-worker'});return{status:'recorded'}}},reconcile:async()=>{throw Error('document temporarily unavailable')},notify:async()=>0}));assert.ok(calls.some(c=>c.name==='protected-worker'));assert.ok(calls.every(c=>!c.args||c.args.p_limit===1))
})
test('actual route handlers use the matching internal runtime boundary and private errors',async()=>{
 const { loadTypescript }=await import('./helpers/load-typescript.mjs'),{globals}=await import('./helpers/corporate-recurring-fixtures.mjs')
 for(const mode of ['setup','status','recovery','worker','webhook']){const calls=[];const route=loadTypescript(`app/api/corporate/billing/${mode}/route.ts`,{'@/lib/corporate/billing-runtime':{corporateRuntime:()=>({ownerDeps:{},workerSecret:'secret',tick:()=>{},webhook:{}})},'@/lib/corporate/billing-http':{ownerBillingRequest:async(request,operation)=>{calls.push(operation);return Response.json({status:'pending'})},corporateDispatch:async()=>{calls.push('worker');return Response.json({status:'ok'})},corporateWebhook:async()=>{calls.push('webhook');return Response.json({status:'received'})},billingResponse:(body,status)=>Response.json(body,{status})}},globals);assert.equal((await route.POST(new Request('https://admin.example.test',{method:'POST'}))).status,200);assert.deepEqual(calls,[mode])}
})

test('failed open invoice returns its same hosted recovery URL, blocked historical contact stays review',async()=>{for(const blocked of [false,true]){const h=harness({recoveryState:'failed',recoveryBlocked:blocked}),r=await h.call('recovery',{companyId:id,contractId,periodId}),body=await r.json();assert.equal(body.status,blocked?'payment_review':'action_required');assert.equal(body.paymentUrl,blocked?undefined:'https://invoice.stripe.com/i/test')}})

test('database current-account rejection maps to forbidden without leaking RPC details',async()=>{const h=harness({rpcDenied:true}),r=await h.call();assert.equal(r.status,403);assert.deepEqual(await r.json(),{status:'forbidden'})})
