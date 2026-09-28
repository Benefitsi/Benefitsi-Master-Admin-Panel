import { CollectorFailure, asRecord, failureState, nonnegative, optionalNumber, requestJson, utcPeriod } from './http'
import { observation, type CollectorOptions, type CollectorTarget, type GoogleCredentials, type Observation } from './types'

const credentialsReady=(c:GoogleCredentials|null|undefined)=>!!(c?.clientId?.trim()&&c.clientSecret?.trim()&&c.refreshToken?.trim())
const safeTarget=(target:CollectorTarget)=>{const url=new URL(target.canonical_url);if(url.protocol!=='https:'||url.username||url.password||url.port)throw new CollectorFailure('blocked');return url}
const host=(s:string)=>s.toLowerCase().replace(/^www\./,'')
function ownsProperty(url:URL,property:string){
  if(property.startsWith('sc-domain:')){const domain=property.slice(10).toLowerCase();return !!domain && (host(url.hostname)===domain||url.hostname.toLowerCase().endsWith(`.${domain}`))}
  try{const p=new URL(property);return p.protocol==='https:'&&p.hostname===url.hostname&&p.port===url.port&&url.pathname.startsWith(p.pathname)&&url.href.startsWith(p.origin+p.pathname)}catch{return false}
}
function periods(options:CollectorOptions,timezone:string,delay:number){
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(options.clock?.()??new Date())
  const end=new Date(`${date}T00:00:00Z`);end.setUTCDate(end.getUTCDate()-delay)
  const current=utcPeriod(end);end.setUTCDate(end.getUTCDate()-28)
  return [utcPeriod(end),current]
}
async function accessToken(credentials:GoogleCredentials,options:CollectorOptions,remaining:()=>number){
  const payload=await requestJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credentials.clientId,client_secret:credentials.clientSecret,refresh_token:credentials.refreshToken,grant_type:'refresh_token'})},options,remaining())
  if(typeof payload.access_token!=='string'||!payload.access_token||payload.access_token.length>8192)throw new CollectorFailure('invalid_response')
  return payload.access_token
}
const budget=()=>{const deadline=Date.now()+20000;return()=>{const left=deadline-Date.now();if(left<=0)throw new CollectorFailure('timeout');return Math.min(left,10000)}}
function rows(value:Record<string,unknown>,queries:boolean){
  const raw=value.rows===undefined?[]:value.rows
  if(!Array.isArray(raw)||raw.length>(queries?100:1))throw new CollectorFailure('invalid_response')
  return raw.map(item=>{const row=asRecord(item),clicks=nonnegative(row.clicks),impressions=nonnegative(row.impressions),ctr=nonnegative(row.ctr,1),averagePosition=nonnegative(row.position);if(clicks>impressions)throw new CollectorFailure('invalid_response');if(queries&&(!Array.isArray(row.keys)||row.keys.length!==1||typeof row.keys[0]!=='string'))throw new CollectorFailure('invalid_response');return{clicks,impressions,ctr,averagePosition,...(queries?{query:String((row.keys as string[])[0]).slice(0,500)}:{})}})
}
export async function collectGsc(target:CollectorTarget,property:string,credentials:GoogleCredentials|null|undefined,options:CollectorOptions={}):Promise<Observation>{
  const base=(state:Observation['state'],data:Record<string,unknown>|null=null)=>observation('google_search_console','search_analytics_final_28d_v1',state,options,data)
  if(!credentialsReady(credentials)||!property?.trim())return base('unconfigured')
  try{
    const canonical=safeTarget(target)
    if(!ownsProperty(canonical,property))return base('blocked')
    const remaining=budget(),token=await accessToken(credentials!,options,remaining)
    const propertyWide=target.target_type==='domain'&&!target.partner_id&&!target.city_id&&canonical.pathname==='/'
    const endpoint=`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`
    const output=[]
    for(const period of periods(options,'America/Los_Angeles',3)){
      const body={...period,dataState:'final',type:'web',aggregationType:'auto',...(propertyWide?{}:{dimensionFilterGroups:[{groupType:'and',filters:[{dimension:'page',operator:'equals',expression:canonical.href}]}]})}
      const query=async(dimensions:string[],rowLimit:number)=>requestJson(endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({...body,dimensions,rowLimit})},options,remaining())
      const totals=rows(await query([],1),false),queries=rows(await query(['query'],100),true)
      if(!totals.length&&queries.length)throw new CollectorFailure('invalid_response')
      output.push({...period,totals:totals[0]??null,queries,querySampleLimit:100})
    }
    return base(output.every(p=>p.totals===null)?'no_data':output.some(p=>p.totals===null)?'partial':'ok',{scope:propertyWide?'property':canonical.href,periods:output,positionKind:'averagePosition',queryNote:'Top query sample; anonymized queries may be excluded. Average position is not keyword rank.'})
  }catch(error){return base(failureState(error))}
}

const GBP_METRICS={businessImpressionsDesktopMaps:'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',businessImpressionsMobileMaps:'BUSINESS_IMPRESSIONS_MOBILE_MAPS',businessImpressionsDesktopSearch:'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',businessImpressionsMobileSearch:'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',websiteClicks:'WEBSITE_CLICKS',callClicks:'CALL_CLICKS',directionRequests:'BUSINESS_DIRECTION_REQUESTS'} as const
function gbpDate(value:string){const [year,month,day]=value.split('-');return{year:Number(year),month:Number(month),day:Number(day)}}
export async function collectGbp(location:string,credentials:GoogleCredentials|null|undefined,options:CollectorOptions={}):Promise<Observation>{
  const base=(state:Observation['state'],data:Record<string,unknown>|null=null)=>observation('google_business_profile','daily_metrics_28d_v1',state,options,data)
  if(!credentialsReady(credentials)||!location?.trim())return base('unconfigured')
  if(!/^locations\/\d+$/.test(location))return base('blocked')
  try{
    const remaining=budget(),token=await accessToken(credentials!,options,remaining),output=[]
    for(const period of periods(options,'UTC',3)){
      const endpoint=new URL(`https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries`)
      for(const metric of Object.values(GBP_METRICS))endpoint.searchParams.append('dailyMetrics',metric)
      for(const [prefix,date] of [['start_date',period.startDate],['end_date',period.endDate]] as const)for(const [part,value] of Object.entries(gbpDate(date)))endpoint.searchParams.set(`dailyRange.${prefix}.${part}`,String(value))
      const payload=await requestJson(endpoint.href,{headers:{authorization:`Bearer ${token}`}},options,remaining())
      if(payload.multiDailyMetricTimeSeries!==undefined&&!Array.isArray(payload.multiDailyMetricTimeSeries))throw new CollectorFailure('invalid_response')
      const metrics:Record<string,number|null>=Object.fromEntries(Object.keys(GBP_METRICS).map(k=>[k,null]))
      for(const group of (payload.multiDailyMetricTimeSeries as unknown[]|undefined)??[]){const entries=asRecord(group).dailyMetricTimeSeries;if(!Array.isArray(entries))throw new CollectorFailure('invalid_response');for(const raw of entries){const entry=asRecord(raw),name=Object.entries(GBP_METRICS).find(([,v])=>v===entry.dailyMetric)?.[0];if(!name)continue;const values=asRecord(entry.timeSeries).datedValues;if(!Array.isArray(values))throw new CollectorFailure('invalid_response');let sum=0;for(const rawValue of values){const value=asRecord(rawValue).value;if(!/^\d+$/.test(String(value)))throw new CollectorFailure('invalid_response');sum+=Number(value)}metrics[name]=values.length?sum:null}}
      output.push({...period,metrics})
    }
    const all=output.flatMap(p=>Object.values(p.metrics));return base(all.every(v=>v===null)?'no_data':all.some(v=>v===null)?'partial':'ok',{location,periods:output,metricNotes:{callClicks:'Clicks on call button, not completed calls'}})
  }catch(error){return base(failureState(error))}
}

export async function collectPageSpeed(target:CollectorTarget,apiKey:string|null|undefined,options:CollectorOptions={}):Promise<Observation>{
  const base=(state:Observation['state'],data:Record<string,unknown>|null=null)=>observation('pagespeed_insights','lighthouse_lab_mobile_v1',state,options,data)
  if(!apiKey?.trim())return base('unconfigured')
  try{
    const canonical=safeTarget(target),endpoint=new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
    endpoint.searchParams.set('url',canonical.href);endpoint.searchParams.set('strategy','mobile');endpoint.searchParams.set('key',apiKey)
    for(const name of ['performance','accessibility','best-practices','seo'])endpoint.searchParams.append('category',name)
    const payload=await requestJson(endpoint.href,{},options,20000,5_000_000),lighthouse=asRecord(payload.lighthouseResult),final=safeTarget({...target,canonical_url:String(lighthouse.finalUrl)})
    if(host(final.hostname)!==host(canonical.hostname)||final.pathname!==canonical.pathname||lighthouse.runtimeError)throw new CollectorFailure('invalid_response')
    const categories=asRecord(lighthouse.categories??{}),audits=asRecord(lighthouse.audits??{})
    const scores:Record<string,number|null>={};for(const name of ['performance','accessibility','best-practices','seo'])scores[name]=categories[name]===undefined?null:optionalNumber(asRecord(categories[name]).score,1)
    for(const name of Object.keys(scores))if(scores[name]!==null)scores[name]=Math.round(scores[name]!*100)
    const metrics:Record<string,number|null>={};for(const [name,audit] of Object.entries({lcpMs:'largest-contentful-paint',fcpMs:'first-contentful-paint',tbtMs:'total-blocking-time',cls:'cumulative-layout-shift',speedIndexMs:'speed-index'}))metrics[name]=audits[audit]===undefined?null:optionalNumber(asRecord(audits[audit]).numericValue)
    const present=[...Object.values(scores),...Object.values(metrics)].filter(v=>v!==null).length
    return base(present===0?'no_data':present<9?'partial':'ok',present?{strategy:'mobile',kind:'laboratory',finalUrl:final.href,categories:scores,metrics}:null)
  }catch(error){return base(failureState(error))}
}
