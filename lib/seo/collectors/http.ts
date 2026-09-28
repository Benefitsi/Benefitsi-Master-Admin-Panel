import type { CollectorOptions, CollectorState } from './types'

export class CollectorFailure extends Error { constructor(public state:CollectorState, public code:string=state){ super(code) } }
export const failureState = (error:unknown):CollectorState => error instanceof CollectorFailure ? error.state : error instanceof Error && ['AbortError','TimeoutError'].includes(error.name) ? 'timeout' : 'provider_error'
export const isRecord = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value)
export const asRecord = (value:unknown):Record<string,unknown> => { if(!isRecord(value)) throw new CollectorFailure('invalid_response'); return value }
export const nonnegative = (value:unknown,max=Infinity):number => { if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max) throw new CollectorFailure('invalid_response'); return value }
export const optionalNumber = (value:unknown,max=Infinity):number|null => value==null ? null : nonnegative(value,max)

export async function requestJson(url:string,init:RequestInit,options:CollectorOptions={},timeoutMs=10000,maxBytes=2_000_000):Promise<Record<string,unknown>> {
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  try {
    const response=await (options.fetcher ?? fetch)(url,{...init,signal:controller.signal,redirect:'manual'})
    if(response.status===401) throw new CollectorFailure('auth_error')
    if(response.status===403) throw new CollectorFailure('forbidden')
    if(response.status===429) throw new CollectorFailure('rate_limited')
    if(response.status>=300 && response.status<400) throw new CollectorFailure('blocked')
    if(!response.ok) throw new CollectorFailure('provider_error')
    const size=Number(response.headers.get('content-length'))
    if(size>maxBytes) throw new CollectorFailure('invalid_response')
    if(!response.body) return asRecord(await response.json())
    const reader=response.body.getReader(); const chunks:Uint8Array[]=[]; let total=0
    try { while(true){ const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw new CollectorFailure('invalid_response')}chunks.push(value) } }
    finally { reader.releaseLock() }
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    return asRecord(JSON.parse(new TextDecoder().decode(bytes)))
  } catch(error) {
    if(error instanceof SyntaxError) throw new CollectorFailure('invalid_response')
    if(controller.signal.aborted) throw new CollectorFailure('timeout')
    throw error
  } finally { clearTimeout(timer) }
}

export function utcPeriod(end:Date,days=28){const start=new Date(end);start.setUTCDate(start.getUTCDate()-days+1);return{startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)}}
