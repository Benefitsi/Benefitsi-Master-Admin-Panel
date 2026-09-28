'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { commercePartner } from '@/lib/commerce/partner'
import { readDealRuleForm, validateDealRule } from '@/lib/commerce/deal-rules'

export async function saveCommerceDealRule(form:FormData) {
  let providerId=''
  let failed=false
  try {
    const input=readDealRuleForm(form)
    providerId=input.providerId
    const {admin,provider}=await commercePartner(providerId)
    if(!provider||!provider.test_mode) throw new Error('invalid_deal_rule')
    const [dealResult,menuResult,existingResult]=await Promise.all([
      admin.from('deals').select('id,partner_id,active,benefit_category,discount_type').eq('id',input.dealId).eq('partner_id',provider.partner_id).maybeSingle(),
      input.menuItemIds.length?admin.from('commerce_menu_items').select('id,provider_id,active').eq('provider_id',providerId).in('id',input.menuItemIds):Promise.resolve({data:[],error:null}),
      admin.from('commerce_deal_rules').select('provider_id,deal_id').eq('deal_id',input.dealId).maybeSingle(),
    ])
    if(dealResult.error||menuResult.error||existingResult.error||!dealResult.data) throw new Error('invalid_deal_rule')
    const rule=validateDealRule(input,provider,dealResult.data,menuResult.data||[])
    if(existingResult.data&&existingResult.data.provider_id!==providerId) throw new Error('invalid_deal_rule')
    if(existingResult.data) {
      const saved=await admin.from('commerce_deal_rules').update({enabled:rule.enabled,menu_item_ids:rule.menu_item_ids}).eq('deal_id',rule.deal_id).eq('provider_id',providerId).select('deal_id').single()
      if(saved.error||!saved.data) throw new Error('deal_rule_save_failed')
    } else {
      const saved=await admin.from('commerce_deal_rules').insert(rule)
      if(saved.error) throw new Error('deal_rule_save_failed')
    }
  } catch {failed=true}
  revalidatePath('/partner/commerce')
  redirect(`/partner/commerce?provider=${encodeURIComponent(providerId)}${failed?'&error=deal':''}#deals`)
}
