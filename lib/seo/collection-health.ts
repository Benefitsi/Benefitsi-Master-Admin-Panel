import {collectionHealth,collectionLabels,type CollectionKind,type HealthIssue} from './collection-config'
export type CollectionHealthData = {
  runtime:{enabled:boolean;monthly_request_limit:number;free_tier_confirmed:boolean;last_tick_started_at:string|null;last_tick_finished_at:string|null;last_tick_error:string|null;last_counts:Record<string,number|string>}
  used:number
  scheduler:{active:boolean;schedule:string}|null
  queue:{queued:number;running:number;oldestQueuedAt:string|null}
  latest:Array<{target_id:string;kind:CollectionKind;url:string;id:string|null;status:string|null;state:string|null;created_at:string|null;observed_at:string|null;error_code:string|null;last_success_at:string|null}>
}
export function getCollectionHealth(data:CollectionHealthData,now=new Date()):HealthIssue[] {
  const issues=collectionHealth(data.runtime,data.latest.map(r=>({...r,status:r.status??'queued'})),now)
  if(data.runtime.enabled&&!data.scheduler?.active)issues.push({code:'scheduler_missing',message:'Der automatische Zeitplan ist noch nicht aktiv.'})
  if(data.latest.some(r=>r.kind==='rank')&&data.used>=data.runtime.monthly_request_limit)issues.push({code:'quota_exhausted',message:'Das gemeinsame Abfragekontingent ist ausgeschöpft oder noch auf 0 gesetzt.'})
  if(data.queue.oldestQueuedAt&&now.getTime()-Date.parse(data.queue.oldestQueuedAt)>2*60*60_000)issues.push({code:'queue_backlog',message:'Messaufträge warten seit über zwei Stunden.'})
  for(const item of data.latest){
    const maxAge=(['gsc','gbp'].includes(item.kind)?36:8*24)*60*60_000
    if(!item.last_success_at||!Number.isFinite(Date.parse(item.last_success_at))||now.getTime()-Date.parse(item.last_success_at)>maxAge)issues.push({code:item.last_success_at?'data_stale':'data_missing',message:`${collectionLabels[item.kind]}: ${item.last_success_at?'Messwerte sind veraltet.':'Noch keine abgeschlossene Messung.'}`,targetId:item.target_id,kind:item.kind})
  }
  return issues
}
