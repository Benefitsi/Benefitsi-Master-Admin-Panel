import { isRetiredStreakDeal } from "@/lib/streak-retirement"
import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllRows } from './pagination'
import { buildPartnerBrief, type BriefRow } from './partner-brief'

export async function readWorkspacePartnerBrief(client:SupabaseClient,partnerId:string) {
  const partner=await client.from('partners').select('id,owner_id,name,type,category,description,address,phone,email,website,stamp_target,reward_text_primary,reward_text_secondary,logo_url,feature_card_url,discover_card_image_url,cover_urls,level_frequency').eq('id',partnerId).maybeSingle()
  if(partner.error)throw new Error('Die hinterlegten Partnerdaten konnten nicht geladen werden.')
  if(!partner.data)throw new Error('Der verknüpfte Partner ist nicht mehr verfügbar.')
  const rows=(table:string,columns:string)=>readAllRows<BriefRow>((from,to)=>client.from(table).select(columns).eq('partner_id',partnerId).order('id').range(from,to).returns<BriefRow[]>())
  const [deals,rewards,hours,holidays,socials,menus,staff,memberships,owner,microsite]=await Promise.all([
    rows('deals','id,partner_id,type,trigger_key,campaign_type,metadata,reward_format,benefit_count,public_title,display_title,active,discount_type,discount_value,reward_item,customer_description,staff_instructions,terms,premium_only,audience,valid_from,valid_until,weekdays,happy_hour_start,happy_hour_end,timezone,max_redemptions_per_user,max_redemptions_global,cooldown_hours,stock_remaining,min_spend,max_discount_amount'),
    rows('partner_reward_milestones','id,partner_id,required_stamps,reward_type,reward_item,discount_type,discount_value,title,customer_description,staff_instructions,terms,audience,active'),
    rows('partner_opening_hours','id,partner_id,weekday,opens_at,closes_at,label,is_closed,sort_order'),
    rows('partner_holidays','id,partner_id,holiday_date,label'),
    rows('partner_socials','id,partner_id,platform,url,handle,sort_order'),
    rows('menus','id,partner_id,name,description,status'),
    rows('partner_staff','id,partner_id,user_id,role,active'),
    rows('partner_memberships','id,partner_id,user_id,role,status'),
    partner.data.owner_id?client.from('users').select('id,display_name,email').eq('id',partner.data.owner_id).maybeSingle():Promise.resolve({data:null,error:null}),
    client.from('microsites').select('id,partner_id,slug,status,published_version_id').eq('partner_id',partnerId).maybeSingle(),
  ])
  if([deals,rewards,hours,holidays,socials,menus,staff,memberships,owner,microsite].some(r=>r.error))throw new Error('Die Admin-Daten konnten nicht vollständig geladen werden. Bitte erneut versuchen.')
  let config:unknown=null
  if(microsite.data){
    const draft=await client.from('microsite_versions').select('config').eq('microsite_id',microsite.data.id).eq('status','draft').order('version_number',{ascending:false}).limit(1).maybeSingle()
    if(draft.error)throw new Error('Die vorbereitete Microsite konnte nicht geladen werden.')
    config=draft.data?.config??null
    if(!config&&microsite.data.published_version_id){
      const published=await client.from('microsite_versions').select('config').eq('microsite_id',microsite.data.id).eq('id',microsite.data.published_version_id).maybeSingle()
      if(published.error)throw new Error('Die Microsite konnte nicht geladen werden.')
      config=published.data?.config??null
    }
  }
  const team=[...(memberships.data??[]),...(staff.data??[])]
  const userIds=[...new Set(team.map(s=>s.user_id).filter((id):id is string=>typeof id==='string'))]
  const people=userIds.length?await client.from('users').select('id,display_name,email').in('id',userIds):{data:[],error:null}
  if(people.error)throw new Error('Die hinterlegten Teamzugänge konnten nicht geladen werden.')
  return buildPartnerBrief({partner:partner.data,owner:owner.data,microsite:microsite.data?{...microsite.data,config}:null,
    deals:(deals.data??[]).filter(deal=>!isRetiredStreakDeal(deal)),rewards:rewards.data??[],hours:(hours.data??[]).sort((a,b)=>Number(a.weekday)-Number(b.weekday)||Number(a.sort_order)-Number(b.sort_order)),holidays:holidays.data??[],socials:socials.data??[],menus:menus.data??[],
    staff:team.map(s=>({...s,...Object.fromEntries(Object.entries(people.data?.find(p=>p.id===s.user_id)??{}).filter(([key])=>key!=='id'))})),
  })
}
