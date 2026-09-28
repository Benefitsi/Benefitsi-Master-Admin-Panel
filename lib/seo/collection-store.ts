import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { googleConnectionReadiness, loadGoogleCredentials } from './google-connection'
import type { CollectionCredentials, CollectionInput, CollectionRun, CollectionStore, Reservation } from './collection-runner'
import type { CollectionSettings } from './collection-config'
import type { Observation } from './collectors/types'
import type { CollectionHealthData } from './collection-health'

export function collectionCredentials():CollectionCredentials {
  const apiKey=process.env.SEO_BRIGHTDATA_API_KEY?.trim(),zone=process.env.SEO_BRIGHTDATA_ZONE?.trim()
  return {google:loadGoogleCredentials,bright:apiKey&&zone?{apiKey,zone}:null,psi:process.env.SEO_PAGESPEED_API_KEY?.trim()||null}
}
export function createCollectionStore():CollectionStore {
  const client=createAdminClient()
  async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T> {
    const {data,error}=await client.rpc(name,args).abortSignal(AbortSignal.timeout(12000))
    if(error)throw Error('collection_storage')
    return data as T
  }
  return {
    startTick:()=>rpc<string|null>('start_seo_collection_tick'),
    finishTick:(token,counts,error)=>rpc('finish_seo_collection_tick',{p_token:token,p_counts:counts,p_error:error}),
    schedule:()=>rpc<number>('schedule_seo_collections'),
    claim:async()=> (await rpc<CollectionRun[]>('claim_seo_collection_run'))[0]??null,
    load:async(run)=>{
      const [target,settings]=await Promise.all([
        client.from('seo_targets').select('id,canonical_url,target_type,partner_id,city_id,provider_config,status').eq('id',run.target_id).abortSignal(AbortSignal.timeout(12000)).maybeSingle(),
        client.from('seo_collection_settings').select('*').eq('target_id',run.target_id).abortSignal(AbortSignal.timeout(12000)).maybeSingle(),
      ])
      if(target.error||settings.error)throw Error('collection_storage')
      return target.data&&settings.data?{target:target.data,settings:settings.data} as CollectionInput:null
    },
    finish:(run,result,rows)=>rpc<boolean>('finish_seo_collection_run',{p_id:run.id,p_token:run.lease_token,p_result:result,p_rank_rows:rows}),
    reserve:(key,day)=>rpc<Reservation>('reserve_seo_serp_request',{p_key:key,p_day:day}),
    finishRequest:(id,result)=>rpc('finish_seo_serp_request',{p_id:id,p_observation:result}),
  }
}
export type StoredObservation = Observation & {id:string;target_id:string;kind:string;status:string;observed_at:string|null;created_at:string;attempts:number;error_code:string|null}
export type CollectionTarget = CollectionInput['target']
export async function getCollectionOverview(selectedId?:string) {
  const client=createAdminClient()
  const [health,targets,settings,connections]=await Promise.all([
    client.rpc('read_seo_collection_health').abortSignal(AbortSignal.timeout(12000)),
    client.from('seo_targets').select('id,canonical_url,target_type,partner_id,city_id,provider_config,status',{count:'exact'}).neq('status','archived').order('canonical_url').limit(500).abortSignal(AbortSignal.timeout(12000)),
    client.from('seo_collection_settings').select('*').limit(1000).abortSignal(AbortSignal.timeout(12000)),
    googleConnectionReadiness(),
  ])
  if(health.error||targets.error||settings.error)throw Error('collection_storage')
  const selected=targets.data?.find(t=>t.id===selectedId)??targets.data?.find(t=>t.canonical_url==='https://benefitsi.de/')??targets.data?.[0]??null
  const history=selected?await client.from('seo_collection_runs').select('id,target_id,kind,status,state,observed_at,created_at,attempts,error_code,source,method,data').eq('target_id',selected.id).order('created_at',{ascending:false}).limit(20).abortSignal(AbortSignal.timeout(12000)):null
  if(history?.error)throw Error('collection_storage')
  const credentials=collectionCredentials()
  return {health:health.data as CollectionHealthData,targets:(targets.data??[]) as CollectionTarget[],targetCount:targets.count??0,
    settings:(settings.data??[]) as CollectionSettings[],selected:selected as CollectionTarget|null,history:(history?.data??[]) as StoredObservation[],
    providers:{...connections,bright:!!credentials.bright,psi:!!credentials.psi},
  }
}
