import { makePage, safeLink, validId, validatePage, type WorkspacePage, type Workspace } from '../workspace/model'

export const acquisitionStatuses={unrecorded:'Kontaktstatus nicht erfasst',new:'Noch nicht kontaktiert',contacted:'Kontaktiert',meeting:'Gespräch vereinbart',negotiating:'In Abstimmung',accepted:'Zugesagt',later:'Später',declined:'Abgesagt'} as const
export const mediaStatuses={none:'Nicht geplant',interested:'Interesse',scheduled:'Termin vereinbart',done:'Erstellt',published:'Veröffentlicht'} as const
export const contactChannels={email:'E-Mail',phone:'Telefon',visit:'Besuch',meeting:'Gespräch',other:'Sonstiges'} as const
export type AcquisitionStatus=keyof typeof acquisitionStatuses
export type MediaStatus=keyof typeof mediaStatuses
export type ContactChannel=keyof typeof contactChannels
export type AcquisitionFields={name:string;city:string;industry:string;contactName:string;email:string;phone:string;website:string;status:AcquisitionStatus;nextStep:string;followUpDate:string;meetingDate:string;panorama:MediaStatus;food:MediaStatus;drone:MediaStatus;notes:string}
export type AcquisitionContact={id:string;date:string;channel:ContactChannel;note:string}
export type AcquisitionDocument={page:WorkspacePage;fields:AcquisitionFields;contacts:AcquisitionContact[];sourceOwnedFields?:('name'|'city'|'industry')[]}
export type AcquisitionRow={key:string;pageId:string|null;partnerId:string|null;fields:AcquisitionFields;lastContactDate:string}
export type AcquisitionIndex={rows:AcquisitionRow[];workspaces:Workspace[]}
export type AcquisitionTarget={pageId?:string;partnerId?:string;workspaceId?:string}
export type AcquisitionPartner={id:string;name:string;city:string;industry:string;email?:string;phone?:string;website?:string}
export const acquisitionTag='benefitsi:acquisition:v1'
// Only this tag, acq:<field> questions and acq-contact:<date>:<channel>:<uuid>
// paragraph blocks belong to this editor. All other content remains ordinary Workspace content.
const fieldLabels:Record<keyof AcquisitionFields,string>={name:'Betrieb',city:'Stadt',industry:'Branche',contactName:'Ansprechpartner',email:'E-Mail',phone:'Telefon',website:'Website',status:'Kontaktstatus',nextStep:'Nächster Schritt',followUpDate:'Wiedervorlage',meetingDate:'Gesprächstermin',panorama:'360°',food:'Speisenfotos',drone:'Drohne',notes:'Notizen'}
const keys=Object.keys(fieldLabels) as (keyof AcquisitionFields)[]
export function blankFields():AcquisitionFields {return {name:'',city:'',industry:'',contactName:'',email:'',phone:'',website:'',status:'unrecorded',nextStep:'',followUpDate:'',meetingDate:'',panorama:'none',food:'none',drone:'none',notes:''}}
function record(value:unknown,label:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} ist ungültig.`);return value as Record<string,unknown>}
function text(value:unknown,label:string,max:number):string{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new Error(`${label}: maximal ${max} Zeichen.`);return value}
function date(value:unknown,label:string,required=false):string{const result=text(value,label,10);if(!result&&!required)return result;if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)throw new Error(`${label} ist ungültig.`);return result}
function choice<T extends string>(value:unknown,options:Record<T,string>,label:string):T{if(typeof value!=='string'||!Object.hasOwn(options,value))throw new Error(`${label} ist ungültig.`);return value as T}
export function validateAcquisitionFields(input:unknown):AcquisitionFields{
 const f=record(input,'Akquisefelder'), result=blankFields()
 for(const key of keys){const max=key==='notes'?10000:key==='nextStep'?2000:key==='website'?4000:key==='email'?320:200;result[key]=text(f[key],fieldLabels[key],max) as never}
 if(!result.name.trim())throw new Error('Bitte gib einen Betriebsnamen ein.')
 result.status=choice(f.status,acquisitionStatuses,'Kontaktstatus')
 for(const key of ['panorama','food','drone'] as const)result[key]=choice(f[key],mediaStatuses,fieldLabels[key])
 for(const key of ['followUpDate','meetingDate'] as const)result[key]=date(f[key],fieldLabels[key])
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw new Error('Die E-Mail-Adresse ist ungültig.')
 if(result.website&&!safeLink(result.website))throw new Error('Die Website benötigt eine gültige HTTP(S)-Adresse ohne Zugangsdaten.')
 return result
}
export function validateAcquisitionContacts(input:unknown):AcquisitionContact[]{
 if(!Array.isArray(input)||input.length>450)throw new Error('Maximal 450 Kontakte pro Akquiseakte.')
 const contacts=input.map(v=>{const c=record(v,'Kontakt');if(!validId(c.id))throw new Error('Kontakt-ID ist ungültig.');const note=text(c.note,'Kontaktnotiz',20000);if(!note.trim())throw new Error('Bitte beschreibe den tatsächlichen Kontakt.');return {id:c.id.toLowerCase(),date:date(c.date,'Kontaktdatum',true),channel:choice(c.channel,contactChannels,'Kontaktkanal'),note}})
 if(new Set(contacts.map(c=>c.id)).size!==contacts.length)throw new Error('Doppelte Kontakt-ID.')
 return contacts
}
export function encodeAcquisitionDocument(input:AcquisitionDocument):WorkspacePage{
 const doc=record(input,'Akquiseakte'), fields=validateAcquisitionFields(doc.fields), contacts=validateAcquisitionContacts(doc.contacts)
 validatePage(doc.page)
 const page=structuredClone(doc.page as WorkspacePage)
 if(page.kind!=='partner'||page.archived)throw new Error('Bitte eine aktive Partnerakte verwenden.')
 for(const q of page.content.questions)if(q.id.startsWith('acq:')&&!keys.includes(q.id.slice(4) as keyof AcquisitionFields))throw new Error('Unbekanntes reserviertes Akquisefeld. Inhalt bleibt erhalten.')
 const questions=keys.map(key=>({id:`acq:${key}`,section:'Akquise & Kontakte',prompt:fieldLabels[key],help:'',suggestion:'',answerType:'text' as const,options:[],answer:fields[key],change:'',agreement:'',status:fields[key]?'answered' as const:'open' as const,reason:'',core:false,hidden:false}))
 page.content.questions=[...page.content.questions.filter(q=>!q.id.startsWith('acq:')),...questions]
 page.content.blocks=[...page.content.blocks.filter(b=>!b.id.startsWith('acq-contact:')),...contacts.map(c=>({id:`acq-contact:${c.date}:${c.channel}:${c.id}`,type:'paragraph' as const,text:c.note,checked:false}))]
 page.tags=[...new Set([...page.tags,acquisitionTag])]
 validatePage(page)
 return page
}
export function decodeAcquisitionDocument(input:WorkspacePage):AcquisitionDocument{
 validatePage(input)
 if(input.kind!=='partner'||!input.tags.includes(acquisitionTag))throw new Error('Diese Seite ist keine Akquiseakte.')
 const fields:Record<string,string>={}
 for(const q of input.content.questions.filter(q=>q.id.startsWith('acq:'))){const key=q.id.slice(4);if(!keys.includes(key as keyof AcquisitionFields)||q.change||q.agreement||q.reason)throw new Error('Unbekanntes oder widersprüchliches Akquisefeld. Bitte die Workspace-Akte prüfen.');fields[key]=q.answer}
 const contacts=input.content.blocks.filter(b=>b.id.startsWith('acq-contact:')).map(b=>{
  const match=/^acq-contact:(\d{4}-\d{2}-\d{2}):([a-z]+):(.+)$/.exec(b.id)
  if(!match||b.type!=='paragraph'||b.checked)throw new Error('Ungültiger gespeicherter Kontakt. Inhalt bleibt erhalten.')
  return {id:match[3],date:match[1],channel:match[2],note:b.text}
 })
 return {page:structuredClone(input),fields:validateAcquisitionFields(fields),contacts:validateAcquisitionContacts(contacts)}
}
export function validateAcquisitionIdentity(input:AcquisitionDocument,current:WorkspacePage):void{
 if(input.page.id!==current.id||input.page.workspace_id!==current.workspace_id||input.page.partner_id!==current.partner_id)throw new Error('Die Identität der Akquiseakte darf nicht geändert werden.')
}
export function mergeAcquisitionDocument(input:AcquisitionDocument,current:WorkspacePage):AcquisitionDocument{
 const previous=decodeAcquisitionDocument(current)
 validateAcquisitionIdentity(input,current)
 const contacts=validateAcquisitionContacts(input.contacts)
 for(const [index,contact] of previous.contacts.entries()){
  const next=contacts[index]
  if(!next||next.id!==contact.id||next.date!==contact.date||next.channel!==contact.channel||next.note!==contact.note)throw new Error('Bereits erfasste Kontakte bleiben unverändert im Verlauf.')
 }
 return {page:{...structuredClone(current),revision:input.page.revision},fields:validateAcquisitionFields(input.fields),contacts}
}
export function lastContactDate(contacts:AcquisitionContact[]):string{return contacts.reduce((latest,c)=>c.date>latest?c.date:latest,'')}
export function berlinDate(now=new Date()):string{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export type AcquisitionFilter={query?:string;city?:string;industry?:string;status?:string}
export function filterAcquisitionRows(rows:AcquisitionRow[],filter:AcquisitionFilter):AcquisitionRow[]{const query=filter.query?.trim().toLocaleLowerCase('de');return rows.filter(({fields:f})=>(!query||[f.name,f.city,f.industry,f.contactName,f.email,f.phone,f.nextStep,f.notes].some(v=>v.toLocaleLowerCase('de').includes(query)))&&(!filter.city||f.city===filter.city)&&(!filter.industry||f.industry===filter.industry)&&(!filter.status||f.status===filter.status))}
export function acquisitionMetrics(rows:AcquisitionRow[],today=berlinDate()){
 const open=rows.filter(r=>!['accepted','declined'].includes(r.fields.status))
 return {dueToday:open.filter(r=>r.fields.followUpDate===today).length,overdue:open.filter(r=>r.fields.followUpDate&&r.fields.followUpDate<today).length,awaitingReply:open.filter(r=>r.fields.status==='contacted').length,upcomingMeetings:open.filter(r=>r.fields.meetingDate&&r.fields.meetingDate>=today).length}
}
export function partnerFields(partner:AcquisitionPartner):AcquisitionFields{return {...blankFields(),name:partner.name,city:partner.city,industry:partner.industry,email:partner.email??'',phone:partner.phone??'',website:partner.website??''}}
export function buildAcquisitionRows(partners:AcquisitionPartner[],documents:AcquisitionDocument[]):AcquisitionRow[]{
 const byId=new Map(partners.map(p=>[p.id,p])),linked=new Set(documents.map(d=>d.page.partner_id))
 return [...documents.map(d=>{const p=d.page.partner_id?byId.get(d.page.partner_id):undefined;return {key:`page:${d.page.id}`,pageId:d.page.id,partnerId:d.page.partner_id,fields:p?{...d.fields,name:p.name||d.fields.name,city:p.city||d.fields.city,industry:p.industry||d.fields.industry}:{...d.fields},lastContactDate:lastContactDate(d.contacts)}}),...partners.filter(p=>!linked.has(p.id)).map(p=>({key:`partner:${p.id}`,pageId:null,partnerId:p.id,fields:partnerFields(p),lastContactDate:''}))]
}
// RFC 9562 UUIDv5, using a fixed acquisition namespace and the partner UUID as name.
// Kept browser-safe because the same model is consumed by the client editor.
export function existingPartnerPageId(partnerId:string):string{
 if(!validId(partnerId))throw new Error('Ungültiger Partner.')
 const namespace='4be10569a58d574a8c6214dd6a8cd226', bytes=[...namespace.matchAll(/../g)].map(m=>parseInt(m[0],16)).concat([...new TextEncoder().encode(partnerId.toLowerCase())])
 const length=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);bytes.push(0,0,0,0,(length>>>24)&255,(length>>>16)&255,(length>>>8)&255,length&255)
 const h=[0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0],rotate=(n:number,b:number)=>(n<<b)|(n>>>(32-b))
 for(let start=0;start<bytes.length;start+=64){const w:number[]=[];for(let i=0;i<16;i++)w[i]=(bytes[start+i*4]<<24)|(bytes[start+i*4+1]<<16)|(bytes[start+i*4+2]<<8)|bytes[start+i*4+3];for(let i=16;i<80;i++)w[i]=rotate(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);let [a,b,c,d,e]=h;for(let i=0;i<80;i++){const f=i<20?(b&c)|(~b&d):i<40?b^c^d:i<60?(b&c)|(b&d)|(c&d):b^c^d,k=i<20?0x5a827999:i<40?0x6ed9eba1:i<60?0x8f1bbcdc:0xca62c1d6,t=(rotate(a,5)+f+e+k+w[i])|0;e=d;d=c;c=rotate(b,30);b=a;a=t}for(const [i,value] of [a,b,c,d,e].entries())h[i]=(h[i]+value)|0}
 const digest=h.flatMap(n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]).slice(0,16);digest[6]=(digest[6]&15)|80;digest[8]=(digest[8]&63)|128
 const hex=digest.map(n=>n.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
// This hint is derived from the current partner projection, never acquisition values.
// It is transport-only: the Workspace codec neither stores nor trusts it.
export function withAcquisitionPartner(document:AcquisitionDocument,partner:AcquisitionPartner):AcquisitionDocument{
 const sourceOwnedFields=(['name','city','industry'] as const).filter(key=>!!partner[key])
 const fields={...document.fields}
 for(const key of sourceOwnedFields)fields[key]=partner[key]
 return {...document,fields,sourceOwnedFields}
}
export function makeAcquisitionDocument(workspaceId:string,partner?:AcquisitionPartner):AcquisitionDocument{const page=makePage(workspaceId,'partner');if(partner){page.id=existingPartnerPageId(partner.id);page.partner_id=partner.id;page.title=partner.name||page.title}const document={page,fields:partner?partnerFields(partner):blankFields(),contacts:[]};return partner?withAcquisitionPartner(document,partner):document}
export function validateAcquisitionTarget(input:unknown):AcquisitionTarget{
 const target=record(input,'Auswahl'),result:AcquisitionTarget={}
 for(const key of ['pageId','partnerId','workspaceId'] as const)if(target[key]!==undefined){if(!validId(target[key]))throw new Error('Ungültige Akquiseauswahl.');result[key]=target[key] as string}
 if(!result.pageId&&!result.partnerId&&!result.workspaceId)throw new Error('Bitte eine Akquiseakte oder einen aktiven Arbeitsbereich wählen.')
 return result
}
export function validateAcquisitionId(input:unknown):string{if(!validId(input))throw new Error('Ungültige ID.');return input}
