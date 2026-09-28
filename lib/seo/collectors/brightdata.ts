import type { ComparisonConfig, RankResult } from '../seo-comparison'
import { CollectorFailure, asRecord, failureState, requestJson } from './http'
import { observation, type CollectorOptions, type Observation, type SearchContext } from './types'

export function brightSearchUrl(context:SearchContext,keyword:string){
  const url=new URL('https://www.google.com/search')
  url.searchParams.set('q',keyword);url.searchParams.set('hl',context.locale.slice(0,2).toLowerCase());url.searchParams.set('gl',context.locale.slice(-2).toLowerCase())
  url.searchParams.set('uule',context.location)
  url.searchParams.set('brd_mobile',context.device==='mobile'?'1':'0')
  url.searchParams.set('start','0')
  return url.href
}

function validLink(value:unknown){if(typeof value!=='string'||value.length>2048)throw new CollectorFailure('invalid_response');const url=new URL(value);if(url.protocol!=='https:'&&url.protocol!=='http:')throw new CollectorFailure('invalid_response');return url.href}
function normalize(raw:Record<string,unknown>,keyword:string,context:SearchContext){
  const general=asRecord(raw.general),query=general.query,detected=general.detected_query
  if(typeof query!=='string'||typeof detected!=='string'||query.normalize('NFKC').trim().toLowerCase()!==keyword.normalize('NFKC').trim().toLowerCase()||detected.normalize('NFKC').trim().toLowerCase()!==query.normalize('NFKC').trim().toLowerCase())throw new CollectorFailure('invalid_response','query_mismatch')
  if(general.is_mobile!==undefined&&general.is_mobile!==(context.device==='mobile'))throw new CollectorFailure('invalid_response','device_mismatch')
  if(general.country_code!==undefined&&String(general.country_code).toLowerCase()!==context.locale.slice(-2).toLowerCase())throw new CollectorFailure('invalid_response','locale_mismatch')
  if(!Array.isArray(raw.organic)||raw.organic.length>100)throw new CollectorFailure('invalid_response')
  const seen=new Set<number>(),organic=[]
  for(const [index,item] of raw.organic.entries()){
    const row=asRecord(item)
    // Current full JSON documentation specifies global_rank; organic array order is
    // the organic rank when an explicit rank field is absent.
    const rank=row.rank===undefined?index+1:row.rank
    if(!Number.isInteger(rank)||Number(rank)<1||Number(rank)>100||seen.has(Number(rank)))throw new CollectorFailure('invalid_response','invalid_rank')
    seen.add(Number(rank))
    const globalRank=row.global_rank===undefined?null:row.global_rank
    if(globalRank!==null&&(!Number.isInteger(globalRank)||Number(globalRank)<1))throw new CollectorFailure('invalid_response','invalid_global_rank')
    organic.push({rank:Number(rank),globalRank:globalRank===null?null:Number(globalRank),link:validLink(row.link),title:typeof row.title==='string'?row.title.slice(0,300):null})
  }
  const complete=organic.length>=10&&Array.from({length:10},(_,i)=>i+1).every(n=>seen.has(n))
  return {query:keyword,context:{...context},organic:organic.slice(0,10),coverage:{depth:10,complete},rankKind:'organic'}
}
export async function fetchBrightSerp(context:SearchContext,keyword:string,credentials:{apiKey:string;zone:string}|null|undefined,options:CollectorOptions={}):Promise<Observation>{
  const base=(state:Observation['state'],data:Record<string,unknown>|null=null,errorCode?:string)=>observation('bright_data','google_organic_top10_full_json_v1',state,options,data,errorCode)
  if(!credentials?.apiKey?.trim()||!credentials.zone?.trim())return base('unconfigured')
  if(context.channel!=='organic')return base('unsupported')
  try{
    const payload=await requestJson('https://api.brightdata.com/request',{method:'POST',headers:{authorization:`Bearer ${credentials.apiKey}`,'content-type':'application/json'},body:JSON.stringify({zone:credentials.zone,url:brightSearchUrl(context,keyword),format:'json'})},options,20000,2_000_000)
    const data=normalize(payload,keyword,context)
    return base(data.organic.length?'ok':'no_data',data)
  }catch(error){return base(failureState(error),null,error instanceof CollectorFailure?error.code:undefined)}
}

function matches(subject:string,candidate:string){
  try{const a=new URL(subject),b=new URL(candidate);if(!['http:','https:'].includes(b.protocol))return false
    const host=(v:string)=>v.toLowerCase().replace(/^www\./,'')
    if(host(a.hostname)!==host(b.hostname))return false
    const path=(v:string)=>v.replace(/\/$/,'')||'/'
    if(a.pathname!=='/'&&path(a.pathname)!==path(b.pathname))return false
    if(!a.search)return true
    a.searchParams.sort();b.searchParams.sort();return a.search===b.search
  }catch{return false}
}
export function rankFromSerp(config:ComparisonConfig,keyword:string,observation:Observation):RankResult{
  const unknown:RankResult={keyword,state:'unknown',position:null,rankingUrl:null}
  if(config.channel!=='organic'||observation.state!=='ok'||!observation.data||observation.data.query!==keyword)return unknown
  const data=observation.data
  if(!Array.isArray(data.organic)||!data.context||typeof data.context!=='object'||Array.isArray(data.context))return unknown
  const actual=data.context as Record<string,unknown>
  if(actual.channel!==config.channel||actual.locale!==config.locale||actual.location!==config.location||actual.device!==config.device||actual.latitude!==config.latitude||actual.longitude!==config.longitude)return unknown
  const matchesFound=data.organic.filter((item:unknown)=>{try{return matches(config.subjectUrl,String(asRecord(item).link))}catch{return false}})
  if(matchesFound.length){const winner=asRecord(matchesFound[0]);const position=winner.rank;if(!Number.isInteger(position)||Number(position)<1||Number(position)>10)return unknown;return{keyword,state:'ranked',position:Number(position),rankingUrl:String(winner.link)}}
  const coverage=data.coverage
  return coverage&&typeof coverage==='object'&&!Array.isArray(coverage)&&asRecord(coverage).complete===true&&asRecord(coverage).depth===10?{keyword,state:'outside',position:null,rankingUrl:null}:unknown
}
