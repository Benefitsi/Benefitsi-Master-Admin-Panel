import { COLLECTION_KINDS, requestContextKey, type CollectionKind, type CollectionSettings } from './collection-config'
import { readComparisonConfig, type ComparableSnapshot, type RankResult } from './seo-comparison'
import { collectWebsite } from './collectors/crawl'
import { collectGsc, collectGbp, collectPageSpeed } from './collectors/google'
import { fetchBrightSerp, rankFromSerp } from './collectors/brightdata'
import { observation, type CollectorTarget, type GoogleCredentials, type Observation } from './collectors/types'

export type CollectionRun = {
  id: string; target_id: string; kind: CollectionKind; lease_token: string
  settings_updated_at: string; target_url: string; comparison_config: unknown
}
export type CollectionInput = {
  target: CollectorTarget & {provider_config: Record<string,unknown>; status?: string}
  settings: CollectionSettings
}
export type Reservation = {state:'claimed';id:string} | {state:'cached';observation:Observation} | {state:'pending'|'blocked';reason:string}
export type TickCounts = {state:'ok'|'idle';scheduled:number;processed:number;saved:number;stale:number}
export interface CollectionStore {
  startTick(): Promise<string|null>
  finishTick(token:string,counts:TickCounts,error:string|null): Promise<unknown>
  schedule(): Promise<number>
  claim(): Promise<CollectionRun|null>
  load(run:CollectionRun): Promise<CollectionInput|null>
  finish(run:CollectionRun,result:Observation,rows:ComparableSnapshot[]): Promise<boolean>
  reserve(key:string,day:string): Promise<Reservation>
  finishRequest(id:string,result:Observation): Promise<unknown>
}
export type CollectionCredentials = {
  google(provider:'gsc'|'gbp'):Promise<GoogleCredentials|null>
  bright:{apiKey:string;zone:string}|null
  psi:string|null
}
const defaultProviders = {crawl:collectWebsite,gsc:collectGsc,gbp:collectGbp,psi:collectPageSpeed,rank:fetchBrightSerp}
type RunnerOptions = {clock?:()=>Date;providers?:typeof defaultProviders}

async function collectRank(run:CollectionRun,store:CollectionStore,credentials:CollectionCredentials,options:RunnerOptions,deadline:number) {
  const config=readComparisonConfig(run.comparison_config)
  const base=(state:Observation['state'],data:Record<string,unknown>|null=null,code?:string)=>observation('bright_data','google_organic_top10_full_json_v1',state,options,data,code)
  if(!config)return{result:base('blocked',null,'comparison_required'),rows:[]}
  const results:RankResult[]=config.keywords.map(keyword=>({keyword,state:'unknown',position:null,rankingUrl:null}))
  const measured=new Map<string,string>()
  let problem:Observation|null=config.channel!=='organic'?base('unsupported',null,'maps_unsupported'):!credentials.bright?.apiKey?.trim()||!credentials.bright.zone.trim()?base('unconfigured'):null
  if(!problem){
    for(const [index,keyword] of config.keywords.entries()){
      if(Date.now()+25_000>deadline){problem=base('timeout',null,'batch_deadline');break}
      const reservation=await store.reserve(requestContextKey(config,keyword),(options.clock?.()??new Date()).toISOString().slice(0,10))
      let item:Observation
      if(reservation.state==='cached')item=reservation.observation
      else if(reservation.state==='claimed'){
        item=await (options.providers??defaultProviders).rank(config,keyword,credentials.bright,options)
        await store.finishRequest(reservation.id,item)
      }else{problem=base(reservation.state==='pending'?'provider_error':'blocked',null,reservation.reason);break}
      results[index]=rankFromSerp(config,keyword,item)
      measured.set(keyword,item.observedAt)
      if(!['ok','partial','no_data'].includes(item.state)){problem=item;break}
    }
  }
  const realTimes=[...measured.values()].filter(s=>Number.isFinite(Date.parse(s))).sort()
  // Cached evidence keeps its real measurement date. An incomplete attempt gets
  // a new batch timestamp so a failed current check cannot look like old success.
  const batchTime=problem?base('partial').observedAt:realTimes.at(-1)??base('no_data').observedAt
  const known=results.filter(r=>r.state!=='unknown').length
  const result:Observation={...base(problem?.state??(known===results.length?'ok':'partial'),{
    results,depth:10,known,total:results.length,measurementStartedAt:realTimes[0]??null,measurementEndedAt:realTimes.at(-1)??null,
  },problem?.errorCode),observedAt:batchTime}
  const rows:ComparableSnapshot[]=results.map(r=>({
    id:`${run.id}:${r.keyword}`,target_id:run.target_id,keyword:r.keyword,locale:config.locale,device:config.device,search_engine:'google',location:config.location,
    grid_latitude:config.latitude,grid_longitude:config.longitude,rank_position:r.position,ranking_url:r.rankingUrl,
    provider:result.source,provider_version:result.method,observed_at:measured.get(r.keyword)??batchTime,
    coverage:r.state==='unknown'?0:1,confidence:r.state==='unknown'?0:1,
    serp_features:[{type:'benefitsi_rank_context_v1',channel:config.channel,batch_id:run.id,measured_at:batchTime,depth:10,state:r.state}],
  }))
  return{result,rows}
}

async function collectRun(run:CollectionRun,input:CollectionInput,store:CollectionStore,credentials:CollectionCredentials,options:RunnerOptions,deadline:number) {
  const providers=options.providers??defaultProviders
  if(run.kind==='rank')return collectRank(run,store,credentials,options,deadline)
  let result:Observation
  if(run.kind==='crawl')result=await providers.crawl(input.target,options)
  else if(run.kind==='psi')result=await providers.psi(input.target,credentials.psi,options)
  else {
    let google:GoogleCredentials|null
    try{google=await credentials.google(run.kind)}catch{return{result:observation('google','connection_v1','auth_error',options,null,'connection_unreadable'),rows:[]}}
    result=run.kind==='gsc'?await providers.gsc(input.target,input.settings.gsc_property??'',google,options):await providers.gbp(input.settings.gbp_location??'',google,options)
  }
  return{result,rows:[]}
}

export async function runCollectionTick(store:CollectionStore,credentials:CollectionCredentials,options:RunnerOptions={}):Promise<TickCounts> {
  const counts:TickCounts={state:'idle',scheduled:0,processed:0,saved:0,stale:0}
  const token=await store.startTick()
  if(!token)return counts
  const deadline=Date.now()+220_000
  let error:string|null=null
  try{
    counts.state='ok';counts.scheduled=await store.schedule()
    while(counts.processed<4&&Date.now()+60_000<deadline){
      const run=await store.claim()
      if(!run)break
      const input=await store.load(run)
      let completion:{result:Observation;rows:ComparableSnapshot[]}
      if(!input||!input.settings.enabled||input.target.status==='archived'||!COLLECTION_KINDS.includes(run.kind)||input.settings.updated_at!==run.settings_updated_at||input.target.canonical_url!==run.target_url){
        completion={result:observation('worker','collection_v1','blocked',options,null,'configuration_changed'),rows:[]}
      }else completion=await collectRun(run,input,store,credentials,options,deadline)
      counts.processed++
      if(await store.finish(run,completion.result,completion.rows))counts.saved++
      else counts.stale++
    }
  }catch{error='collection_storage'}
  await store.finishTick(token,counts,error)
  if(error)throw Error(error)
  return counts
}
