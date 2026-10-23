import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {loadTypescript} from './helpers/load-typescript.mjs'
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/corporate-recurring/${name}`,import.meta.url)))
const models=loadTypescript('lib/corporate/recurring.ts')
test('final recurring, archived invoice, operations and Premium exports are byte-bound to actual 147-test native run',()=>{
 const provenance=fixture('current-provenance.json');assert.equal(provenance.source_commit,'06d1fbab299ed319d88fb33240ab11cf47518192');assert.equal(provenance.run_id,40036788118);assert.equal(provenance.job_id,120698134495);assert.equal(provenance.native_tests_passed,147)
 for(const [name,evidence] of Object.entries(provenance.exports))assert.equal(createHash('sha256').update(readFileSync(new URL(`./fixtures/corporate-recurring/${name}`,import.meta.url))).digest('hex'),evidence.sha256)
 assert.equal(provenance.exports['operations.json'].sha256,'cd9ef63322d1aee78062f335432964d49e527f7b22c1cf55ce59d9c30c60f32e')
})
test('actual native limited/full/post-termination operation projections preserve older holds, due predicate and exact raw times',()=>{
 const evidence=fixture('operations.json')
 for(const value of Object.values(evidence)){
  const parsed=models.parseAdminOperations(value,value.company_id);assert.ok(parsed);assert.equal(parsed.counts.total,11);assert.equal(parsed.counts.due,3);assert.equal(parsed.counts.review_required,1);assert.equal(parsed.counts.by_state.awaiting_setup,1)
 }
 const limited=models.parseAdminOperations(evidence.limited,evidence.limited.company_id);assert.equal(limited.operations.length,1);assert.equal(limited.has_more,true);assert.equal(limited.operations[0].state,'succeeded')
 const full=models.parseAdminOperations(evidence.full,evidence.full.company_id);assert.ok(full.operations.every((o,i)=>o.next_attempt_at===evidence.full.operations[i].next_attempt_at));assert.equal(full.operations.length,11)
})
test('actual current and archive exports pass bound parsers and preserve full exact DE/EN receipt content',()=>{
 const native=fixture('current.json'),parsed=models.parseContract(native.paid,native.paid.company_id);assert.ok(parsed);assert.equal(parsed.version,native.paid.version);assert.equal(parsed.current_period.paid_at,native.paid.current_period.paid_at);assert.deepEqual(parsed.receipt_documents,native.paid.receipt_documents);assert.equal(parsed.terms.en_text,native.paid.terms.en_text)
 for(const key of ['admin_all','owner_all','after_termination']){const index=fixture('invoice-periods.json')[key];assert.ok(models.parseInvoiceIndex(index,index.company_id))}
})
test('latest native annual and Premium consumers retain their original authority and current entitlement fields',async()=>{
 const premium=fixture('current-premium.json'),annual=fixture('current-annual.json'),recurring=fixture('current.json')
 const {parseCorporateCompany}=loadTypescript('lib/corporate/companies.ts');assert.ok(parseCorporateCompany(premium.active))
 const {loadCorporateBilling}=loadTypescript('lib/corporate/annual.ts');const result=await loadCorporateBilling({rpc:async()=>({data:annual.activated,error:null})},annual.activated.agreement.company_id);assert.equal(result.status,'ok');assert.equal(result.extensions[0].updated_at,annual.activated.extensions[0].updated_at)
 const self=recurring.employee_premium;assert.equal(self.active,true);assert.equal(typeof self.user_id,'string');assert.equal(self.company_id,recurring.paid.company_id);assert.equal(self.valid_until,'2027-10-22T22:00:00+00:00');assert.equal(self.company_count,1)
 assert.equal(premium.owner_access.active,false)
})
