import type { SupabaseClient } from '@supabase/supabase-js'
import { readEntitlements, type Entitlements } from '@/lib/partners/entitlements'

export const crmKinds = ['second_visit', 'comeback', 'reward_reminder'] as const
export type CrmKind = typeof crmKinds[number]
export const editorialKeys = ['blog_article', 'founder_interview'] as const
export type EditorialKey = typeof editorialKeys[number]
export type EditorialStatus = 'not_requested' | 'requested' | 'planned' | 'completed'
export type EditorialRequest = { service_key: EditorialKey; status: EditorialStatus; requested_at: string | null; updated_at: string | null; partner_note: string | null }
export type AdminEditorialRequest = EditorialRequest & { admin_note: string | null }
export type CampaignInput = { id: string; expected_revision: number; kind: CrmKind; title: string; body: string; deal_id: string | null; config: Record<string, number>; channel: 'in_app' | 'push_and_in_app'; status: 'draft' | 'archived' }
export type CrmCampaign = Omit<CampaignInput, 'expected_revision'> & { partner_id: string; revision: number; created_at: string; updated_at: string }
export type CrmAudience = { kind: CrmKind; status: 'ok' | 'empty' | 'suppressed' | 'unavailable'; value: number | null; definition: string; config: Record<string, number>; reason?: string }
export type CrmDashboard = { schema_version: 1; partner_id: string; as_of: string; timezone: 'Europe/Berlin'; window: { from: string; to: string; days: 365 }; audiences: Record<CrmKind, CrmAudience>; campaigns: CrmCampaign[]; editorial_requests: EditorialRequest[]; delivery: { status: 'draft_only'; reason: 'marketing_delivery_not_enabled' }; metrics: { status: 'unavailable'; reason: 'marketing_delivery_not_enabled' } }
export type CrmRead = { status: 'ready'; dashboard: CrmDashboard; writable: boolean } | { status: 'locked' | 'unavailable'; message: string }
export type CrmDeal = { id: string; title: string }
export type CrmDeals = { status: 'ready'; deals: CrmDeal[] } | { status: 'unavailable'; message: string }
export class CrmError extends Error { constructor(public code: 'invalid' | 'denied' | 'unavailable' | 'conflict' | 'failed', message: string) { super(message); this.name = 'CrmError' } }
const invalid = () => new CrmError('invalid', 'Die Kundenbindungsdaten sind nicht gültig. Bitte erneut laden.')
export const validCrmUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
function row(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(); return value as Record<string, unknown> }
function keys(r: Record<string, unknown>, required: string[], optional: string[] = []) { if (!required.every(k => Object.hasOwn(r, k)) || Object.keys(r).some(k => ![...required, ...optional].includes(k))) throw invalid() }
function count(v: unknown, min = 0): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= min }
function timestamp(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v) || !Number.isFinite(Date.parse(v))) return false
  const date = new Date(`${v.slice(0,10)}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === v.slice(0,10)
}
function text(v: unknown, max: number): v is string { return typeof v === 'string' && v.trim().length > 0 && [...v.trim()].length <= max }
export function validateCrmConfig(kind: CrmKind, value: unknown): Record<string, number> {
  const config = row(value)
  const key = kind === 'comeback' ? 'inactivity_days' : kind === 'reward_reminder' ? 'remaining_stamps' : null
  keys(config, key ? [key] : [])
  if (key && (!count(config[key], kind === 'comeback' ? 7 : 1) || (config[key] as number) > (kind === 'comeback' ? 365 : 2))) throw invalid()
  return config as Record<string, number>
}
export function parseCampaignInput(value: unknown): CampaignInput {
  const r = row(value)
  keys(r, ['id', 'expected_revision', 'kind', 'title', 'body', 'channel', 'status'], ['deal_id', 'config'])
  if (!validCrmUuid(r.id) || !count(r.expected_revision) || !crmKinds.includes(r.kind as CrmKind) || !text(r.title, 120) || !text(r.body, 2000) || !['in_app', 'push_and_in_app'].includes(String(r.channel)) || !['draft', 'archived'].includes(String(r.status)) || !(r.deal_id === undefined || r.deal_id === null || validCrmUuid(r.deal_id))) throw invalid()
  const kind = r.kind as CrmKind
  return { id: r.id, expected_revision: r.expected_revision, kind, title: (r.title as string).trim(), body: (r.body as string).trim(), deal_id: r.deal_id as string | null ?? null, config: validateCrmConfig(kind, r.config ?? defaultConfig(kind)), channel: r.channel as CampaignInput['channel'], status: r.status as CampaignInput['status'] }
}
export function defaultConfig(kind: CrmKind): Record<string, number> { return kind === 'comeback' ? { inactivity_days: 45 } : kind === 'reward_reminder' ? { remaining_stamps: 2 } : {} }
export function parseCrmCampaign(value: unknown, partnerId: string): CrmCampaign {
  const r = row(value)
  keys(r, ['id','partner_id','revision','kind','title','body','deal_id','config','channel','status','created_at','updated_at'])
  if (r.partner_id !== partnerId || !count(r.revision, 1) || !timestamp(r.created_at) || !timestamp(r.updated_at) || Date.parse(r.updated_at) < Date.parse(r.created_at)) throw invalid()
  const {partner_id, revision, created_at, updated_at, ...content} = r
  const {expected_revision: _, ...draft} = parseCampaignInput({...content, expected_revision: revision})
  return {...draft, partner_id: partner_id as string, revision: revision as number, created_at, updated_at}
}
export function parseEditorialRequest(value: unknown, admin = false): EditorialRequest | AdminEditorialRequest {
  const r = row(value)
  keys(r, ['service_key','status','requested_at','updated_at','partner_note'], admin ? ['admin_note'] : [])
  if (!editorialKeys.includes(r.service_key as EditorialKey) || !['not_requested','requested','planned','completed'].includes(String(r.status))) throw invalid()
  if (r.status === 'not_requested' ? r.requested_at !== null || r.updated_at !== null || r.partner_note !== null : !timestamp(r.requested_at) || !timestamp(r.updated_at) || Date.parse(r.updated_at) < Date.parse(r.requested_at) || !(r.partner_note === null || typeof r.partner_note === 'string' && [...r.partner_note].length <= 2000)) throw invalid()
  if (admin && !(r.admin_note === undefined || r.admin_note === null || typeof r.admin_note === 'string' && [...r.admin_note].length <= 2000)) throw invalid()
  return r as unknown as EditorialRequest | AdminEditorialRequest
}
export function parseAdminEditorialRequests(value: unknown): AdminEditorialRequest[] {
  if (!Array.isArray(value) || value.length !== 2) throw invalid()
  const result = value.map(v => parseEditorialRequest(v, true) as AdminEditorialRequest)
  if (new Set(result.map(r => r.service_key)).size !== 2) throw invalid()
  return result
}
function berlinParts(value: string) { return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).reduce<Record<string,string>>((o,p) => ({...o,[p.type]:p.value}), {}) }
export function parseCrmDashboard(value: unknown, partnerId: string): CrmDashboard {
  const r = row(value)
  keys(r, ['schema_version','partner_id','as_of','timezone','window','audiences','campaigns','editorial_requests','delivery','metrics'])
  if (!validCrmUuid(partnerId) || r.partner_id !== partnerId || r.schema_version !== 1 || r.timezone !== 'Europe/Berlin' || !timestamp(r.as_of)) throw invalid()
  const w = row(r.window); keys(w, ['from','to','days'])
  if (w.days !== 365 || !timestamp(w.from) || !timestamp(w.to) || Date.parse(w.to) > Date.parse(r.as_of)) throw invalid()
  const from=berlinParts(w.from), to=berlinParts(w.to), asof=berlinParts(r.as_of)
  const date=(p:Record<string,string>) => `${p.year}-${p.month}-${p.day}`
  if ([from,to].some(p => p.hour !== '00' || p.minute !== '00' || p.second !== '00') || date(to) !== date(asof) || Date.parse(date(to))-Date.parse(date(from)) !== 365*86400000) throw invalid()
  const a=row(r.audiences); keys(a,[...crmKinds])
  const definitions={second_visit:'exactly_one_completed_visit_in_window',comeback:'last_completed_visit_at_least_45_berlin_days_ago_in_window',reward_reminder:'one_or_two_stamps_before_next_eligible_base_milestone'}
  for (const kind of crmKinds) {
    const metric=row(a[kind]); keys(metric,['kind','status','value','definition','config'],['reason'])
    const config=validateCrmConfig(kind,metric.config)
    if (metric.kind !== kind || metric.definition !== definitions[kind] || !['ok','empty','suppressed','unavailable'].includes(String(metric.status)) || (metric.status==='ok' ? !count(metric.value,10) : metric.status==='empty' ? metric.value!==0 : metric.value!==null) || Object.entries(defaultConfig(kind)).some(([k,v])=>config[k]!==v) || (metric.reason!==undefined && !text(metric.reason,200))) throw invalid()
  }
  if (!Array.isArray(r.campaigns) || !Array.isArray(r.editorial_requests) || r.editorial_requests.length!==2) throw invalid()
  const campaigns=r.campaigns.map(c=>parseCrmCampaign(c,partnerId)), requests=r.editorial_requests.map(c=>parseEditorialRequest(c))
  if (new Set(campaigns.map(c=>c.id)).size!==campaigns.length || new Set(requests.map(c=>c.service_key)).size!==2) throw invalid()
  for(const [key,status] of [['delivery','draft_only'],['metrics','unavailable']]) { const state=row(r[key]);keys(state,['status','reason']);if(state.status!==status||state.reason!=='marketing_delivery_not_enabled')throw invalid() }
  return {...r,campaigns,editorial_requests:requests} as CrmDashboard
}
export function canReadCrm(rights: Entitlements) { return rights.plan_code === 'pro' && ['owner','admin','benefitsi_admin'].includes(rights.role) && rights.features['crm.manage'] === true }
export function canSaveCrm(rights: Entitlements) { return canReadCrm(rights) && rights.features['marketing.manage'] === true }
export function crmError(error: unknown): CrmError {
  if (error instanceof CrmError) return error
  const e=error && typeof error==='object' ? error as {code?:string;message?:string} : {}
  if (e.code==='40001' || e.message?.includes('crm_revision_conflict')) return new CrmError('conflict','Der Entwurf wurde inzwischen geändert. Bitte die gespeicherte Version erneut laden und Änderungen abgleichen.')
  if (['PGRST202','42883'].includes(e.code??'')) return new CrmError('unavailable','Das Kundenbindungs-Backend ist noch nicht verfügbar. Bitte später erneut versuchen.')
  if (e.code==='42501' || /crm_(pro|marketing)_required/.test(e.message??'')) return new CrmError('denied','Bitte deinen Zugriff aktualisieren. Kundenbindung benötigt Pro und passende Verwaltungsrechte.')
  if (/crm_invalid_deal/.test(e.message??'')) return new CrmError('invalid','Der Vorteil ist nicht mehr gültig oder gehört nicht zu diesem Betrieb. Bitte neu auswählen.')
  if (/crm_invalid_(campaign|config)/.test(e.message??'')) return invalid()
  return new CrmError('failed','Kundenbindung konnte nicht geladen oder gespeichert werden. Bitte erneut versuchen.')
}
async function rightsFor(client: SupabaseClient, partnerId: string) { if (!validCrmUuid(partnerId)) throw invalid();try{return await readEntitlements(client,partnerId)}catch(e){throw crmError(e)} }
export async function readCrmDashboard(client: SupabaseClient, partnerId: string): Promise<CrmRead> {
  const rights=await rightsFor(client,partnerId)
  if (!canReadCrm(rights)) return {status:'locked',message:'Kundenbindung ist mit Pro und passenden Verwaltungsrechten verfügbar.'}
  const {data,error}=await client.rpc('get_partner_crm_dashboard',{p_partner_id:partnerId})
  if(error) {const e=crmError(error);if(e.code==='unavailable')return {status:'unavailable',message:e.message};throw e}
  return {status:'ready',dashboard:parseCrmDashboard(data,partnerId),writable:canSaveCrm(rights)}
}
export async function readCrmDeals(client: SupabaseClient, partnerId: string): Promise<CrmDeals> {
  if (!canReadCrm(await rightsFor(client,partnerId))) throw crmError({code:'42501'})
  const {data,error}=await client.from('deals').select('id,partner_id,title,active,valid_from,valid_until').eq('partner_id',partnerId).eq('active',true)
  if(error || !Array.isArray(data)) return {status:'unavailable',message:'Aktive Vorteile konnten nicht geladen werden. Ohne Verknüpfung kannst du einen Entwurf speichern.'}
  const now=Date.now(), deals:CrmDeal[]=[]
  for(const item of data){const d=row(item);if(!validCrmUuid(d.id)||d.partner_id!==partnerId||!text(d.title,1000)||d.active!==true||!(d.valid_from===null||timestamp(d.valid_from))||!(d.valid_until===null||timestamp(d.valid_until)))return {status:'unavailable',message:'Aktive Vorteile konnten nicht geprüft werden.'};if((d.valid_from===null||Date.parse(d.valid_from as string)<=now)&&(d.valid_until===null||Date.parse(d.valid_until as string)>now))deals.push({id:d.id,title:d.title as string})}
  return {status:'ready',deals}
}
export async function saveCrmCampaign(client: SupabaseClient, partnerId: string, value: unknown): Promise<CrmCampaign> {
  const input=parseCampaignInput(value)
  if(!canSaveCrm(await rightsFor(client,partnerId)))throw crmError({code:'42501'})
  if(input.deal_id){const deals=await readCrmDeals(client,partnerId);if(deals.status!=='ready'||!deals.deals.some(d=>d.id===input.deal_id))throw crmError({message:'crm_invalid_deal'})}
  const {data,error}=await client.rpc('save_partner_crm_campaign',{p_partner_id:partnerId,p_campaign:input})
  if(error)throw crmError(error)
  const saved=parseCrmCampaign(data,partnerId)
  if(saved.id!==input.id || (saved.revision!==input.expected_revision && saved.revision!==input.expected_revision+1) || ['kind','title','body','deal_id','channel','status'].some(k=>saved[k as keyof CrmCampaign]!==input[k as keyof CampaignInput]) || JSON.stringify(saved.config)!==JSON.stringify(input.config)) throw invalid()
  return saved
}
export async function requestEditorialService(client: SupabaseClient, partnerId: string, service: EditorialKey, note: string): Promise<EditorialRequest> {
  if(!editorialKeys.includes(service)||typeof note!=='string'||[...note.trim()].length>2000)throw invalid()
  if(!canReadCrm(await rightsFor(client,partnerId)))throw crmError({code:'42501'})
  const {data,error}=await client.rpc('request_partner_editorial_service',{p_partner_id:partnerId,p_service_key:service,p_note:note.trim()})
  if(error)throw crmError(error)
  const result=parseEditorialRequest(data)
  if(result.service_key!==service||result.status==='not_requested')throw invalid()
  return result
}
export async function updateEditorialService(client: SupabaseClient, partnerId: string, service: EditorialKey, status: EditorialStatus, note: string): Promise<AdminEditorialRequest> {
  if(!validCrmUuid(partnerId)||!editorialKeys.includes(service)||!['requested','planned','completed'].includes(status)||!text(note,2000))throw invalid()
  const {data,error}=await client.rpc('admin_update_partner_editorial_service',{p_partner_id:partnerId,p_service_key:service,p_status:status,p_note:note.trim()})
  if(error)throw crmError(error)
  const result=parseEditorialRequest(data,true) as AdminEditorialRequest
  if(result.service_key!==service||result.status!==status||result.admin_note!==note.trim())throw invalid()
  return result
}
