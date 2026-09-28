const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const supported=new Set(['2for1','item','fixed','percent'])

export type DealRuleInput={providerId:string;dealId:string;enabled:boolean;menuItemIds:string[]}
export type DealRow={id:string;partner_id:string;active:boolean;benefit_category:string;discount_type:string}
export type DealProvider={id:string;partner_id:string;test_mode:boolean}
export type DealMenuItem={id:string;provider_id:string;active:boolean}

function one(form:FormData,key:string,required=true) {
  const entries=form.getAll(key)
  if(entries.length>1 || (required&&entries.length!==1) || entries.some(v=>typeof v!=='string')) throw new Error('invalid_deal_rule_form')
  return entries.length?String(entries[0]):''
}
function id(value:string) {
  if(!idPattern.test(value)) throw new Error('invalid_deal_rule_form')
  return value
}
export function readDealRuleForm(form:FormData):DealRuleInput {
  const providerId=id(one(form,'provider_id'))
  const dealId=id(one(form,'deal_id'))
  const enabledValue=one(form,'enabled',false)
  if(enabledValue&&enabledValue!=='true') throw new Error('invalid_deal_rule_form')
  const menuItemIds=form.getAll('menu_item_ids').map(v=>{
    if(typeof v!=='string') throw new Error('invalid_deal_rule_form')
    return id(v)
  })
  if(menuItemIds.length>100||new Set(menuItemIds).size!==menuItemIds.length) throw new Error('invalid_deal_rule_form')
  return {providerId,dealId,enabled:enabledValue==='true',menuItemIds}
}

export function validateDealRule(input:DealRuleInput,provider:DealProvider,deal:DealRow,menu:DealMenuItem[]) {
  if(provider.id!==input.providerId||!provider.test_mode||deal.id!==input.dealId||deal.partner_id!==provider.partner_id||!deal.active||deal.benefit_category!=='direct_selectable'||!supported.has(deal.discount_type)) throw new Error('invalid_deal_rule')
  const ownMenu=new Set(menu.filter(m=>m.provider_id===provider.id&&m.active).map(m=>m.id))
  if(input.menuItemIds.some(itemId=>!ownMenu.has(itemId))||(input.enabled&&['2for1','item'].includes(deal.discount_type)&&!input.menuItemIds.length)) throw new Error('invalid_deal_rule')
  return {provider_id:provider.id,deal_id:deal.id,enabled:input.enabled,menu_item_ids:input.menuItemIds}
}
