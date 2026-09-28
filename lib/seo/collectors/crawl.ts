import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { CollectorFailure, failureState } from './http'
import { observation, type CollectorOptions, type CollectorTarget, type Observation } from './types'

type CrawlOptions=CollectorOptions&{resolve?:(host:string)=>Promise<string[]>}
type Page={url:string;status:number;contentType:string;html:string}
const host=(value:string)=>value.toLowerCase().replace(/^www\./,'')
const deniedIpv4=new BlockList()
for(const [base,prefix] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],
  ['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],
  ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],
  ['224.0.0.0',4],['240.0.0.0',4],
] as const)deniedIpv4.addSubnet(base,prefix,'ipv4')
const globalIpv6=new BlockList()
globalIpv6.addSubnet('2000::',3,'ipv6')
const deniedIpv6=new BlockList()
for(const [base,prefix] of [
  ['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20],
] as const)deniedIpv6.addSubnet(base,prefix,'ipv6')
function publicIp(value:string){
  if(isIP(value)===4)return !deniedIpv4.check(value,'ipv4')
  if(isIP(value)===6)return globalIpv6.check(value,'ipv6')&&!deniedIpv6.check(value,'ipv6')
  return false
}
function safeUrl(raw:string,root:URL){let url:URL;try{url=new URL(raw,root)}catch{throw new CollectorFailure('blocked')}
  if(url.protocol!=='https:'||url.username||url.password||url.port||host(url.hostname)!==host(root.hostname)||!url.hostname.includes('.'))throw new CollectorFailure('blocked')
  url.hash='';return url
}
async function address(url:URL,options:CrawlOptions,deadline:number){
  const remaining=deadline-Date.now()
  if(remaining<=0)throw new CollectorFailure('timeout')
  const resolution=options.resolve?options.resolve(url.hostname):lookup(url.hostname,{all:true,verbatim:true}).then(found=>found.map(v=>v.address))
  let timer:ReturnType<typeof setTimeout>|undefined
  const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new CollectorFailure('timeout')),remaining)})
  let values:string[]
  try{values=await Promise.race([resolution,timeout])}finally{clearTimeout(timer)}
  if(Date.now()>=deadline)throw new CollectorFailure('timeout')
  if(!values.length||values.some(v=>!publicIp(v)))throw new CollectorFailure('blocked','private_dns');return values[0]
}
async function hopWait<T>(work:Promise<T>,deadline:number,controller:AbortController):Promise<T>{
  const remaining=deadline-Date.now()
  if(remaining<=0){controller.abort();throw new CollectorFailure('timeout')}
  let timer:ReturnType<typeof setTimeout>|undefined
  const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new CollectorFailure('timeout'))},remaining)})
  try{return await Promise.race([work,timeout])}finally{clearTimeout(timer)}
}
async function nativeFetch(url:URL,ip:string,method:string,deadline:number):Promise<Response>{
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>request.destroy(new CollectorFailure('timeout')),Math.min(10000,Math.max(1,deadline-Date.now())))
    const request=httpsRequest(url,{method,timeout:Math.min(10000,Math.max(1,deadline-Date.now())),lookup:(_hostname,lookupOptions,callback)=>{
      const family=isIP(ip)
      if(lookupOptions.all)callback(null,[{address:ip,family}])
      else callback(null,ip,family)
    },headers:{'user-agent':'BenefitsiSEOAudit/1.0','accept':'text/html,*/*;q=0.8'}},response=>{
      const chunks:Buffer[]=[];let size=0
      response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000){request.destroy(new CollectorFailure('invalid_response'));return}chunks.push(chunk)})
      response.on('end',()=>{clearTimeout(timer);const headers=new Headers();for(const [key,value] of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);const status=response.statusCode??500;resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers}))})
      response.on('error',reject)
    })
    request.on('timeout',()=>request.destroy(new CollectorFailure('timeout')))
    request.on('error',error=>{clearTimeout(timer);reject(error)});request.end()
  })
}
async function onePage(url:URL,root:URL,options:CrawlOptions,deadline:number,method='GET'):Promise<Page>{
  for(let redirects=0;redirects<=3;redirects++){
    if(Date.now()>=deadline)throw new CollectorFailure('timeout')
    const requestDeadline=Math.min(deadline,Date.now()+10000)
    const ip=await address(url,options,requestDeadline)
    if(Date.now()>=requestDeadline)throw new CollectorFailure('timeout')
    const controller=new AbortController()
    let response:Response
    try{response=await hopWait(options.fetcher?options.fetcher(url.href,{method,redirect:'manual',signal:controller.signal,headers:{accept:'text/html,*/*;q=0.8'},resolvedAddress:ip} as RequestInit):nativeFetch(url,ip,method,requestDeadline),requestDeadline,controller)}
    catch(error){if(controller.signal.aborted)throw new CollectorFailure('timeout');throw error}
    if(Date.now()>=requestDeadline)throw new CollectorFailure('timeout')
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location||redirects===3)throw new CollectorFailure('blocked','redirect');url=safeUrl(location,url);continue}
    const contentType=response.headers.get('content-type')??''
    if(method==='HEAD')return{url:url.href,status:response.status,contentType,html:''}
    const length=Number(response.headers.get('content-length'));if(length>2_000_000)throw new CollectorFailure('invalid_response','oversize')
    const reader=response.body?.getReader();if(!reader)return{url:url.href,status:response.status,contentType,html:''}
    const chunks:Uint8Array[]=[];let total=0
    try{while(true){const {done,value}=await hopWait(reader.read(),requestDeadline,controller);if(done)break;total+=value.length;if(total>2_000_000){await reader.cancel();throw new CollectorFailure('invalid_response','oversize')}chunks.push(value)}}finally{try{reader.releaseLock()}catch{}}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    return{url:url.href,status:response.status,contentType,html:new TextDecoder().decode(bytes)}
  }
  throw new CollectorFailure('blocked')
}
function links(html:string,page:URL,root:URL){const found:string[]=[];const pattern=/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;let match:RegExpExecArray|null
  while((match=pattern.exec(html))&&found.length<100){try{const url=safeUrl(new URL(match[1],page).href,root);if(host(url.hostname)===host(page.hostname)&&!found.includes(url.href))found.push(url.href)}catch{}}
  return found
}
function titleOf(html:string){return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g,'').trim()??''}
function noindex(html:string){return /<meta\b(?=[^>]*\bname\s*=\s*["'](?:robots|googlebot)["'])(?=[^>]*\bcontent\s*=\s*["'][^"']*\bnoindex\b)[^>]*>/i.test(html)}
export async function collectWebsite(target:CollectorTarget,options:CrawlOptions={}):Promise<Observation>{
  const base=(state:Observation['state'],data:Record<string,unknown>|null=null,errorCode?:string)=>observation('website','bounded_https_audit_v1',state,options,data,errorCode)
  let root:URL;try{root=safeUrl(target.canonical_url,new URL(target.canonical_url))}catch{return base('blocked')}
  const deadline=Date.now()+45000,queue=[root.href],seen=new Set<string>(),linkChecks=new Set<string>(),findings:Record<string,unknown>[]=[],pages:Record<string,unknown>[]=[]
  const bounded=<T>(work:Promise<T>):Promise<T>=>new Promise((resolve,reject)=>{const remaining=deadline-Date.now();if(remaining<=0){reject(new CollectorFailure('timeout'));return}const timer=setTimeout(()=>reject(new CollectorFailure('timeout')),remaining);work.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})})
  let interrupted=false
  try{
    while(queue.length&&pages.length<5){if(Date.now()>=deadline){interrupted=true;break}
      const next=queue.shift()!;if(seen.has(next))continue;seen.add(next)
      const page=await bounded(onePage(new URL(next),root,options,deadline))
      pages.push({url:page.url,status:page.status})
      if(page.status>=400){findings.push({code:'page_error',url:page.url,status:page.status});continue}
      if(!page.contentType.toLowerCase().includes('text/html'))continue
      if(!titleOf(page.html))findings.push({code:'missing_title',url:page.url})
      if(noindex(page.html))findings.push({code:'noindex',url:page.url})
      for(const href of links(page.html,new URL(page.url),root)){if(linkChecks.size<15)linkChecks.add(href);if(queue.length+seen.size<5&&!seen.has(href))queue.push(href)}
    }
    for(const href of linkChecks){if(Date.now()>=deadline){interrupted=true;break}if(seen.has(href)){const page=pages.find(p=>p.url===href);if(page&&Number(page.status)>=400)findings.push({code:'broken_link',url:href,status:page.status});continue}
      try{const page=await bounded(onePage(new URL(href),root,options,deadline,'HEAD'));if(page.status>=400)findings.push({code:'broken_link',url:href,status:page.status})}
      catch(error){if(error instanceof CollectorFailure&&error.state==='blocked')throw error;findings.push({code:'link_check_failed',url:href})}
    }
    return base(interrupted||findings.length?'partial':'ok',{pages,linksChecked:linkChecks.size,findings,limits:{pages:5,links:15,bytesPerPage:2_000_000,seconds:45}})
  }catch(error){const state=failureState(error);return base(state==='timeout'&&pages.length?'partial':state,pages.length?{pages,linksChecked:linkChecks.size,findings,interrupted:state==='timeout'}:null,error instanceof CollectorFailure?error.code:undefined)}
}
