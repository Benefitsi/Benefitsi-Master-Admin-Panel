import test from 'node:test'
import assert from 'node:assert/strict'
import { readDealRuleForm, validateDealRule } from '../lib/commerce/deal-rules.ts'

const provider='11111111-1111-4111-8111-111111111111'
const partner='22222222-2222-4222-8222-222222222222'
const deal='33333333-3333-4333-8333-333333333333'
const item='44444444-4444-4444-8444-444444444444'
const foreign='55555555-5555-4555-8555-555555555555'
const base={id:deal,partner_id:partner,active:true,benefit_category:'direct_selectable',discount_type:'2for1'}
const menu=[{id:item,provider_id:provider,active:true},{id:foreign,provider_id:foreign,active:true}]
function form(values={}) {
 const f=new FormData()
 f.set('provider_id',provider);f.set('deal_id',deal);f.set('enabled','true');f.append('menu_item_ids',item)
 for(const [key,value] of Object.entries(values)) {f.delete(key);for(const entry of Array.isArray(value)?value:[value]) f.append(key,entry)}
 return f
}

test('accepts an explicitly mapped active 2-for-1 deal for this provider',()=>{
 const input=readDealRuleForm(form())
 assert.deepEqual(validateDealRule(input,{id:provider,partner_id:partner,test_mode:true},base,menu),{provider_id:provider,deal_id:deal,enabled:true,menu_item_ids:[item]})
})
test('rejects duplicate scalar fields before privileged authorization',()=>{
 const f=form();f.append('provider_id',foreign)
 assert.throws(()=>readDealRuleForm(f),/invalid_deal_rule_form/)
})
test('rejects a deal belonging to another partner or unavailable category',()=>{
 const input=readDealRuleForm(form())
 for(const changed of [{partner_id:foreign},{active:false},{benefit_category:'automatic_fallback'},{discount_type:'none'}])
  assert.throws(()=>validateDealRule(input,{id:provider,partner_id:partner,test_mode:true},{...base,...changed},menu),/invalid_deal_rule/)
})
test('rejects foreign or inactive mapped menu items',()=>{
 for(const changed of [[foreign],[item,foreign]]) {
  const input=readDealRuleForm(form({menu_item_ids:changed}))
  assert.throws(()=>validateDealRule(input,{id:provider,partner_id:partner,test_mode:true},base,menu),/invalid_deal_rule/)
 }
 const input=readDealRuleForm(form())
 assert.throws(()=>validateDealRule(input,{id:provider,partner_id:partner,test_mode:true},base,[{id:item,provider_id:provider,active:false}]),/invalid_deal_rule/)
})
test('2-for-1 and item benefits require an explicit menu mapping when enabled',()=>{
 const input=readDealRuleForm(form({menu_item_ids:[]}))
 for(const type of ['2for1','item']) assert.throws(()=>validateDealRule(input,{id:provider,partner_id:partner,test_mode:true},{...base,discount_type:type},menu),/invalid_deal_rule/)
 assert.deepEqual(validateDealRule(input,{id:provider,partner_id:partner,test_mode:true},{...base,discount_type:'fixed'},menu).menu_item_ids,[])
})
test('configuration is unavailable outside test mode and duplicate mappings are rejected',()=>{
 const input=readDealRuleForm(form())
 assert.throws(()=>validateDealRule(input,{id:provider,partner_id:partner,test_mode:false},base,menu),/invalid_deal_rule/)
 assert.throws(()=>readDealRuleForm(form({menu_item_ids:[item,item]})),/invalid_deal_rule_form/)
})
