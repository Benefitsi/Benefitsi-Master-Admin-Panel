import type { SupabaseClient } from '@supabase/supabase-js'

// Each page stays within PostgREST's default 1,000-row cap. A stable tie-breaker
// prevents simultaneous pickup times from disappearing between pages.
export async function readPickupSlots(admin:SupabaseClient,providerId:string,now=new Date().toISOString()) {
  const pages=await Promise.all([0,1000].map(start=>admin.from('commerce_slots').select('*')
    .eq('provider_id',providerId).gte('ends_at',now)
    .order('starts_at',{ascending:true}).order('id',{ascending:true}).range(start,start+999)))
  return {data:pages.flatMap(page=>page.data||[]),error:pages.find(page=>page.error)?.error||null}
}
