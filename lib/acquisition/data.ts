import type { SupabaseClient } from '@supabase/supabase-js'
import { pagePayload, type ActionResult, type Workspace, type WorkspacePage } from '../workspace/model'
import { readAllRows } from '../workspace/pagination'
import { acquisitionTag, buildAcquisitionRows, decodeAcquisitionDocument, encodeAcquisitionDocument, existingPartnerPageId, makeAcquisitionDocument, mergeAcquisitionDocument, validateAcquisitionId, validateAcquisitionTarget, type AcquisitionDocument, type AcquisitionIndex, type AcquisitionPartner, type AcquisitionTarget } from './model'

type WorkspaceWriters={saveWorkspacePage:(page:WorkspacePage)=>Promise<ActionResult<WorkspacePage>>;saveWorkspace:(input:{id:string;revision:number;title:string;description:string;archived:boolean})=>Promise<ActionResult<Workspace>>}
const pageColumns='id,workspace_id,parent_id,partner_id,kind,title,status,tags,owner,due_date,revision,archived,created_at,updated_at,content'
const workspaceColumns='id,title,description,revision,archived,created_at,updated_at'
const partnerColumns='id,name,city_id,type,email,phone,website'
const workspaceDefaults={title:'Akquise & Kontakte',description:'Interne Akquise und Kontaktverläufe',archived:false}
type PartnerRecord={id:string;name:string|null;city_id:string|null;type:string|null;email:string|null;phone:string|null;website:string|null}
type CityRecord={id:string;name:string|null}
const conflictError='Diese Akquiseakte wurde inzwischen geändert. Dein Entwurf bleibt erhalten. Bitte neu laden und vergleichen.'
async function resultOf<T>(operation:()=>Promise<ActionResult<T>>):Promise<ActionResult<T>>{try{return await operation()}catch(error){return {ok:false,error:error instanceof Error?error.message:'Die Akquisedaten konnten nicht verarbeitet werden. Dein Entwurf bleibt erhalten.'}}}

/** Requires a session-scoped authenticated client. The four public Actions authorize first;
 * writes use the existing revision RPC Actions, which authorize again and atomically write history. */
export function createAcquisitionData(client:SupabaseClient,writers:WorkspaceWriters){
 async function all<T>(table:string,columns:string):Promise<T[]>{
  // All ranges use an explicit stable ordering. No transport error becomes a partial success.
  const result=await readAllRows<T>((from,to)=>client.from(table).select(columns).order('id').range(from,to).returns<T[]>())
  if(result.error)throw new Error('Die Akquisedaten konnten nicht vollständig geladen werden. Bitte erneut versuchen.')
  return result.data??[]
 }
 async function pagesForPartner(partnerId?:string):Promise<WorkspacePage[]>{
  const result=await readAllRows<WorkspacePage>((from,to)=>{let query=client.from('admin_workspace_pages').select(pageColumns).contains('tags',[acquisitionTag]).eq('archived',false);if(partnerId)query=query.eq('partner_id',partnerId);return query.order('id').range(from,to)})
  if(result.error)throw new Error('Die Akquiseakten konnten nicht vollständig geladen werden.')
  return result.data??[]
 }
 async function pageById(id:string):Promise<WorkspacePage|null>{const result=await client.from('admin_workspace_pages').select(pageColumns).eq('id',id).maybeSingle();if(result.error)throw new Error('Die Akquiseakte konnte nicht geladen werden.');return result.data as WorkspacePage|null}
 async function workspaceById(id:string):Promise<Workspace|null>{const result=await client.from('admin_workspaces').select(workspaceColumns).eq('id',id).maybeSingle();if(result.error)throw new Error('Der Arbeitsbereich konnte nicht geladen werden.');return result.data as Workspace|null}
 async function activeWorkspace(id:string):Promise<Workspace>{const ws=await workspaceById(id);if(!ws||ws.archived)throw new Error('Bitte einen aktiven Arbeitsbereich wählen.');return ws}
 function partnerView(p:PartnerRecord,cities:CityRecord[]):AcquisitionPartner{
  validateAcquisitionId(p.id)
  return {id:p.id,name:p.name??'',city:p.city_id?cities.find(c=>c.id===p.city_id)?.name??'':'',industry:p.type??'',email:p.email??'',phone:p.phone??'',website:p.website??''}
 }
 async function partnerById(id:string):Promise<AcquisitionPartner|null>{
  const result=await client.from('partners').select(partnerColumns).eq('id',id).maybeSingle()
  if(result.error)throw new Error('Die Partnerdaten konnten nicht geladen werden.')
  if(!result.data)return null
  const partner=result.data as PartnerRecord
  let cities:CityRecord[]=[]
  if(partner.city_id){const city=await client.from('cities').select('id,name').eq('id',partner.city_id).maybeSingle();if(city.error)throw new Error('Die Stadt konnte nicht geladen werden.');if(city.data)cities=[city.data as CityRecord]}
  return partnerView(partner,cities)
 }
 async function documentFromPage(page:WorkspacePage,target?:AcquisitionTarget):Promise<AcquisitionDocument>{
  if(page.archived)throw new Error('Diese Akquiseakte ist archiviert.')
  if(target?.partnerId&&target.partnerId!==page.partner_id||target?.workspaceId&&target.workspaceId!==page.workspace_id)throw new Error('Die Auswahl gehört nicht zu dieser Akquiseakte.')
  const doc=decodeAcquisitionDocument(page)
  if(page.partner_id){const partner=await partnerById(page.partner_id);if(partner)doc.fields={...doc.fields,name:partner.name||doc.fields.name,city:partner.city||doc.fields.city,industry:partner.industry||doc.fields.industry}}
  return doc
 }
 return {
  loadAcquisitionIndex():Promise<ActionResult<AcquisitionIndex>>{return resultOf(async()=>{
   const [partners,cities,workspaces,pages]=await Promise.all([all<PartnerRecord>('partners',partnerColumns),all<CityRecord>('cities','id,name'),all<Workspace>('admin_workspaces',workspaceColumns),pagesForPartner()])
   return {ok:true,value:{rows:buildAcquisitionRows(partners.map(p=>partnerView(p,cities)),pages.map(decodeAcquisitionDocument)),workspaces:workspaces.filter(w=>!w.archived)}}
  })},
  loadAcquisitionDocument(input:AcquisitionTarget):Promise<ActionResult<AcquisitionDocument>>{return resultOf(async()=>{
   const target=validateAcquisitionTarget(input)
   if(target.pageId){const page=await pageById(target.pageId);if(!page)throw new Error('Die Akquiseakte wurde nicht gefunden.');return {ok:true,value:await documentFromPage(page,target)}}
   if(target.partnerId){
    const linked=await pagesForPartner(target.partnerId)
    if(linked.length>1)throw new Error('Mehrere Akquiseakten sind verknüpft. Bitte eine bestehende Akte ausdrücklich öffnen.')
    if(linked[0])return {ok:true,value:await documentFromPage(linked[0],target)}
    const id=existingPartnerPageId(target.partnerId),collision=await pageById(id)
    if(collision)throw new Error('Die reservierte Akquise-ID ist bereits belegt. Bitte die bestehende Akte prüfen.')
    const partner=await partnerById(target.partnerId)
    if(!partner)throw new Error('Der Partner wurde nicht gefunden.')
    if(!target.workspaceId)throw new Error('Bitte einen aktiven Arbeitsbereich wählen.')
    await activeWorkspace(target.workspaceId)
    return {ok:true,value:makeAcquisitionDocument(target.workspaceId,partner)}
   }
   await activeWorkspace(target.workspaceId!)
   return {ok:true,value:makeAcquisitionDocument(target.workspaceId!)}
  })},
  saveAcquisitionDocument(input:AcquisitionDocument):Promise<ActionResult<AcquisitionDocument>>{return resultOf(async()=>{
   const submitted=encodeAcquisitionDocument(input)
   const current=await pageById(submitted.id)
   let page:WorkspacePage
   if(current){
    const merged=mergeAcquisitionDocument(input,current)
    page=encodeAcquisitionDocument(merged)
    // A lost create response can be retried with the exact same stable identities.
    if(page.revision===0&&current.revision===1&&JSON.stringify(pagePayload(page))===JSON.stringify(pagePayload(current)))return {ok:true,value:await documentFromPage(current)}
    if(page.revision!==current.revision)return {ok:false,error:conflictError,conflict:current}
   }else{
    if(submitted.revision!==0)throw new Error('Die Akquiseakte wurde nicht gefunden. Dein Entwurf bleibt erhalten.')
    if(submitted.partner_id){
     if(submitted.id!==existingPartnerPageId(submitted.partner_id))throw new Error('Für bestehende Partner ist die reservierte Akquise-ID erforderlich.')
     if((await pagesForPartner(submitted.partner_id)).length)throw new Error('Für diesen Partner besteht bereits eine Akquiseakte. Bitte diese Akte öffnen.')
     if(!await partnerById(submitted.partner_id))throw new Error('Der Partner wurde nicht gefunden.')
    }
    page={...submitted,title:input.fields.name}
   }
   await activeWorkspace(page.workspace_id)
   const saved=await writers.saveWorkspacePage(page)
   if(!saved.ok)return saved
   const document=decodeAcquisitionDocument(saved.value)
   if(saved.value.id!==page.id||saved.value.workspace_id!==page.workspace_id||saved.value.partner_id!==page.partner_id||JSON.stringify(document.fields)!==JSON.stringify(input.fields)||JSON.stringify(document.contacts)!==JSON.stringify(input.contacts))throw new Error('Die Speicherantwort bestätigt deinen Entwurf nicht vollständig. Bitte neu laden und vergleichen.')
   return {ok:true,value:document}
  })},
  createAcquisitionWorkspace(input:string):Promise<ActionResult<Workspace>>{return resultOf(async()=>{
   const id=validateAcquisitionId(input)
   const matches=(ws:Workspace)=>ws.id===id&&ws.title===workspaceDefaults.title&&ws.description===workspaceDefaults.description&&!ws.archived
   const existing=await workspaceById(id)
   if(existing){if(matches(existing))return {ok:true,value:existing};throw new Error('Diese Arbeitsbereich-ID ist bereits anders belegt.')}
   const result=await writers.saveWorkspace({id,revision:0,...workspaceDefaults})
   if(result.ok){if(!matches(result.value))throw new Error('Der neue Arbeitsbereich wurde nicht vollständig bestätigt.');return result}
   const retry=await workspaceById(id)
   return retry&&matches(retry)?{ok:true,value:retry}:result
  })},
 }
}
