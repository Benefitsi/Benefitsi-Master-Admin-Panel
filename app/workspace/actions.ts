'use server'

import { requireAdmin } from '@/lib/admin'
import { readAllRows } from '@/lib/workspace/pagination'
import { pagePayload, validatePage, validId, pageKinds, pageStatuses, type ActionResult, type Workspace, type WorkspacePage, type PageMeta, type PageVersion, type PartnerReference } from '@/lib/workspace/model'

const metaColumns='id,workspace_id,parent_id,partner_id,kind,title,status,tags,owner,due_date,revision,archived,created_at,updated_at'
const workspaceColumns='id,title,description,revision,archived,created_at,updated_at'
const pageColumns=metaColumns+',content'
function message(error:{code?:string;message?:string}|null) {
  if(error?.message?.includes('workspace_conflict'))return 'Diese Seite wurde inzwischen geändert. Dein Entwurf ist erhalten. Bitte vergleiche beide Fassungen.'
  if(['42P01','PGRST202','PGRST205','42883'].includes(error?.code??''))return 'Der Workspace ist noch nicht in dieser Datenbank eingerichtet. Bitte die zugehörige Workspace-Migration bereitstellen.'
  if(error?.message?.includes('cycle'))return 'Eine Seite kann nicht unter sich selbst oder einer eigenen Unterseite liegen.'
  if(error?.message?.includes('parent'))return 'Die übergeordnete Seite muss zum selben Arbeitsbereich gehören.'
  return 'Die Änderung konnte nicht gespeichert werden. Bitte prüfe die Eingaben und versuche es erneut.'
}
function queryText(value:string) {return value.trim().slice(0,200).replace(/[\\%_]/g,'\\$&')}
export async function loadWorkspaceIndex():Promise<ActionResult<{workspaces:Workspace[];favorites:string[]}>> {
  const {supabase}=await requireAdmin()
  const [ws,favorites]=await Promise.all([
    readAllRows<Workspace>((from,to)=>supabase.from('admin_workspaces').select(workspaceColumns).order('created_at').order('id').range(from,to)),
    readAllRows<{page_id:string}>((from,to)=>supabase.from('admin_workspace_favorites').select('page_id').order('page_id').range(from,to)),
  ])
  if(ws.error||favorites.error)return {ok:false,error:message(ws.error??favorites.error)}
  return {ok:true,value:{workspaces:(ws.data??[]) as Workspace[],favorites:(favorites.data??[]).map(v=>v.page_id)}}
}
export type PageFilter={query?:string;kind?:string;status?:string;tag?:string;archived?:boolean;partnerId?:string}
export async function loadWorkspacePages(workspaceId:string,filter:PageFilter={},offset=0):Promise<ActionResult<{pages:PageMeta[];total:number}>> {
  const {supabase}=await requireAdmin()
  if(!validId(workspaceId))return {ok:false,error:'Bitte wähle einen Arbeitsbereich.'}
  let query=supabase.from('admin_workspace_pages').select(metaColumns,{count:'exact'}).eq('workspace_id',workspaceId).eq('archived',filter.archived===true)
  if(filter.query?.trim())query=query.ilike('search_text',`%${queryText(filter.query)}%`)
  if(filter.kind && Object.hasOwn(pageKinds,filter.kind))query=query.eq('kind',filter.kind)
  if(filter.status && Object.hasOwn(pageStatuses,filter.status))query=query.eq('status',filter.status)
  if(filter.tag?.trim())query=query.contains('tags',[filter.tag.trim().slice(0,60)])
  if(filter.partnerId && validId(filter.partnerId))query=query.eq('partner_id',filter.partnerId)
  const start=Number.isInteger(offset)&&offset>=0?Math.min(offset,100000):0
  const result=await query.order('updated_at',{ascending:false}).order('id').range(start,start+99)
  return result.error?{ok:false,error:message(result.error)}:{ok:true,value:{pages:result.data as PageMeta[],total:result.count??0}}
}
export async function loadWorkspacePage(pageId:string):Promise<ActionResult<WorkspacePage>> {
  const {supabase}=await requireAdmin()
  if(!validId(pageId))return {ok:false,error:'Ungültige Seite.'}
  const result=await supabase.from('admin_workspace_pages').select(pageColumns).eq('id',pageId).maybeSingle()
  if(result.error)return {ok:false,error:message(result.error)}
  if(!result.data)return {ok:false,error:'Diese Seite wurde nicht gefunden oder ist nicht zugänglich.'}
  try{return {ok:true,value:validatePage(result.data)}}catch{return {ok:false,error:'Die gespeicherte Seite hat ein unbekanntes Format. Ihr Inhalt wurde nicht überschrieben.'}}
}
export async function saveWorkspacePage(input:unknown):Promise<ActionResult<WorkspacePage>> {
  const {supabase}=await requireAdmin()
  let page:WorkspacePage
  try{page=validatePage(input)}catch(error){return {ok:false,error:error instanceof Error?error.message:'Ungültige Seite.'}}
  const result=await supabase.rpc('admin_workspace_page_save',{p_id:page.id,p_expected_revision:page.revision,p_page:pagePayload(page)})
  if(result.error){
    if(result.error.message.includes('workspace_conflict')){
      const current=await supabase.from('admin_workspace_pages').select(pageColumns).eq('id',page.id).maybeSingle()
      return {ok:false,error:message(result.error),conflict:current.data?validatePage(current.data):undefined}
    }
    return {ok:false,error:message(result.error)}
  }
  try{return {ok:true,value:validatePage(result.data)}}catch{return {ok:false,error:'Speicherantwort nicht lesbar. Bitte den Entwurf exportieren und die Seite neu öffnen.'}}
}
export async function saveWorkspace(input:{id:string;revision:number;title:string;description:string;archived:boolean}):Promise<ActionResult<Workspace>> {
  const {supabase}=await requireAdmin()
  if(!validId(input.id)||!Number.isInteger(input.revision)||input.revision<0||typeof input.title!=='string'||!input.title.trim()||input.title.length>200||typeof input.description!=='string'||input.description.length>4000||typeof input.archived!=='boolean')return {ok:false,error:'Bitte gib einen gültigen Titel und eine Beschreibung ein.'}
  const result=await supabase.rpc('admin_workspace_save',{p_id:input.id,p_expected_revision:input.revision,p_patch:{title:input.title.trim(),description:input.description,archived:input.archived}})
  return result.error?{ok:false,error:message(result.error)}:{ok:true,value:result.data as Workspace}
}
export async function setWorkspaceFavorite(pageId:string,favorite:boolean):Promise<ActionResult<boolean>> {
  const {supabase}=await requireAdmin()
  if(!validId(pageId)||typeof favorite!=='boolean')return {ok:false,error:'Ungültige Seite.'}
  const result=await supabase.rpc('admin_workspace_favorite',{p_page_id:pageId,p_favorite:favorite})
  return result.error?{ok:false,error:message(result.error)}:{ok:true,value:Boolean(result.data)}
}
export async function loadWorkspaceVersions(pageId:string,offset=0):Promise<ActionResult<PageVersion[]>> {
  const {supabase}=await requireAdmin()
  if(!validId(pageId)||!Number.isInteger(offset)||offset<0)return {ok:false,error:'Ungültige Seite.'}
  const result=await supabase.from('admin_workspace_versions').select('revision,created_at,snapshot').eq('page_id',pageId).order('revision',{ascending:false}).range(offset,offset+9)
  return result.error?{ok:false,error:message(result.error)}:{ok:true,value:(result.data??[]) as PageVersion[]}
}
export async function restoreWorkspacePage(pageId:string,revision:number,expectedRevision:number):Promise<ActionResult<WorkspacePage>> {
  const {supabase}=await requireAdmin()
  if(!validId(pageId)||!Number.isInteger(revision)||revision<1||!Number.isInteger(expectedRevision)||expectedRevision<1)return {ok:false,error:'Ungültige Version.'}
  const result=await supabase.rpc('admin_workspace_page_restore',{p_page_id:pageId,p_revision:revision,p_expected_revision:expectedRevision})
  if(result.error)return {ok:false,error:message(result.error)}
  return {ok:true,value:validatePage(result.data)}
}
export async function findWorkspacePartners(query='',partnerId?:string):Promise<ActionResult<PartnerReference[]>> {
  const {supabase}=await requireAdmin()
  let request=supabase.from('partners').select('id,name,slug').order('name').limit(50)
  if(partnerId){if(!validId(partnerId))return {ok:false,error:'Ungültiger Partner.'};request=request.eq('id',partnerId)}
  else if(query.trim())request=request.ilike('name',`%${queryText(query)}%`)
  const result=await request
  if(result.error)return {ok:false,error:'Partner konnten nicht geladen werden.'}
  const partners=(result.data??[]).map(p=>({...p,name:p.name||'Unbenannter Partner',publicSlug:null})) as PartnerReference[]
  if(partnerId && partners[0]?.slug){
    const publicResult=await supabase.rpc('get_public_microsites_v1',{p_slug:partners[0].slug,p_include_config:false})
    const published=Array.isArray(publicResult.data)?publicResult.data.find(p=>p.partner_id===partnerId):null
    if(!publicResult.error && published?.slug)partners[0].publicSlug=published.slug
  }
  return {ok:true,value:partners}
}
