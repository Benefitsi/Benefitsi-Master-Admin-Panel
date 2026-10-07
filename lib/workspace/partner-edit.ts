import type { SupabaseClient } from '@supabase/supabase-js'
import { safeLink, validId } from './model'
import { readAllRows } from './pagination'
import { isPartnerSocialPlatform } from '../partner-config'
import { normalizePartnerCategories, normalizePartnerCategoriesForType, partnerTypeOptions } from '../partner-categories'

export type EditRow=Record<string,string|number|boolean|null|string[]>
export type PartnerDetails={partnerId:string;profile:EditRow;socials:EditRow[];hours:EditRow[]}
export type PartnerDetailChange={kind:'profile'|'social'|'hour';row:EditRow;column:string;value:unknown}
export type PartnerDetailAddition={kind:'social'|'hour';id:string;values:EditRow}
const profileFields=['name','type','category','description','address','phone','email','website'] as const
const socialFields=['platform','url','handle','sort_order'] as const
const hourFields=['weekday','opens_at','closes_at','label','is_closed','sort_order'] as const
const schemas={profile:{table:'partners',fields:profileFields,columns:['id',...profileFields,'updated_at'].join(',')},social:{table:'partner_socials',fields:socialFields,columns:['id','partner_id',...socialFields].join(',')},hour:{table:'partner_opening_hours',fields:hourFields,columns:['id','partner_id',...hourFields].join(',')}}
const conflict='Der Eintrag wurde inzwischen geändert oder ist nicht mehr verfügbar. Bitte neu laden und deine Eingabe vergleichen.'

export async function readPartnerDetails(client:SupabaseClient,partnerId:string):Promise<PartnerDetails>{
  if(!validId(partnerId))throw new Error('Ungültiger Partner.')
  const [profile,socials,hours]=await Promise.all([
    client.from('partners').select(schemas.profile.columns).eq('id',partnerId).maybeSingle(),
    readAllRows<EditRow>((from,to)=>client.from('partner_socials').select(schemas.social.columns).eq('partner_id',partnerId).order('id').range(from,to).returns<EditRow[]>()),
    readAllRows<EditRow>((from,to)=>client.from('partner_opening_hours').select(schemas.hour.columns).eq('partner_id',partnerId).order('weekday').order('sort_order').order('id').range(from,to).returns<EditRow[]>()),
  ])
  if(profile.error||socials.error||hours.error||!profile.data)throw new Error('Die bearbeitbaren Partnerangaben konnten nicht geladen werden.')
  return {partnerId,profile:profile.data as unknown as EditRow,socials:socials.data??[],hours:hours.data??[]}
}
function cleanValue(kind:PartnerDetailChange['kind'],column:string,value:unknown){
  if(column==='category'){
    if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=='string'||v.length>100))throw new Error('Bitte gültige Kategorien eingeben.')
    return [...new Set(value.map(v=>v.trim()).filter(Boolean))]
  }
  if(column==='is_closed'){if(typeof value!=='boolean')throw new Error('Ungültiger Öffnungsstatus.');return value}
  if(typeof value!=='string'||value.length>(column==='description'?4000:column==='url'||column==='website'?4000:500)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new Error('Bitte eine gültige Angabe eingeben.')
  const text=value.trim()
  if(column==='name'&&!text)throw new Error('Der Partnername darf nicht leer sein.')
  if(column==='email'&&text&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.')
  if((column==='website'||column==='url')&&text){const url=safeLink(text);if(!url)throw new Error('Bitte eine gültige HTTP(S)-Adresse ohne Zugangsdaten eingeben.');return url}
  if(kind==='hour'&&['opens_at','closes_at'].includes(column)&&text&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text))throw new Error('Bitte eine gültige Uhrzeit eingeben.')
  return text||null
}
/** Each save is one conditional row update. Nothing replaces a whole partner or collection. */
export async function savePartnerDetail(client:SupabaseClient,partnerId:string,input:PartnerDetailChange):Promise<EditRow>{
  if(!validId(partnerId)||!input||!Object.hasOwn(schemas,input.kind)||!input.row||!validId(input.row.id))throw new Error('Ungültiger Eintrag.')
  const {kind,row,column}=input,schema=schemas[kind]
  const editable=kind==='profile'?[...profileFields,'classification']:kind==='social'?['url']:['opens_at','closes_at','label','is_closed']
  if(!(editable as readonly string[]).includes(column)||kind==='profile'&&row.id!==partnerId||kind!=='profile'&&row.partner_id!==partnerId)throw new Error('Dieser Eintrag kann hier nicht geändert werden.')
  const classification=kind==='profile'&&['classification','type','category'].includes(column)?cleanClassification(column==='classification'?input.value:{type:column==='type'?input.value:row.type,category:column==='category'?input.value:row.category}):null
  const value=classification??cleanValue(kind,column,input.value),patch:Record<string,unknown>=classification?{...classification}:{[column]:value}
  if(kind==='hour')checkHours({...row,[column]:value})
  if(kind==='profile'){
    if(typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))throw new Error('Bitte den aktuellen Partnerstand neu laden.')
    patch.updated_at=new Date().toISOString()
  }
  if(kind==='social')patch.handle=null // The canonical URL is authoritative after direct URL editing.
  let query=client.from(schema.table).update(patch).eq('id',row.id)
  if(kind!=='profile')query=query.eq('partner_id',partnerId)
  const expected=kind==='profile'?['updated_at']:schema.fields
  for(const field of expected){
    if(!Object.hasOwn(row,field))throw new Error('Bitte den aktuellen Eintrag neu laden.')
    query=row[field]===null?query.is(field,null):query.eq(field,row[field])
  }
  const result=await query.select(schema.columns).returns<EditRow[]>()
  if(result.error)throw new Error('Die Änderung konnte nicht gespeichert werden. Deine Eingabe bleibt erhalten.')
  const saved=result.data?.[0]
  if(result.data?.length!==1||saved?.id!==row.id||kind!=='profile'&&saved.partner_id!==partnerId)throw new Error(conflict)
  const equivalent=classification?saved.type===classification.type&&JSON.stringify(saved.category)===JSON.stringify(classification.category):kind==='hour'&&typeof value==='string'&&['opens_at','closes_at'].includes(column)?String(saved[column]).slice(0,5)===value.slice(0,5):JSON.stringify(saved[column])===JSON.stringify(value)
  if(!equivalent)throw new Error('Die Änderung wurde nicht vollständig bestätigt. Bitte neu laden und vergleichen.')
  return saved
}

function cleanClassification(input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Bitte Betriebsart und Kategorien gemeinsam angeben.')
  const {type,category}=input as Record<string,unknown>
  if(typeof type!=='string'||!partnerTypeOptions.some(option=>option.value===type))throw new Error('Bitte eine gültige Betriebsart wählen.')
  if(!Array.isArray(category)||category.length>20||category.some(value=>typeof value!=='string'||value.length>100))throw new Error('Bitte gültige Kategorien eingeben.')
  const normalized=normalizePartnerCategories(category),allowed=normalizePartnerCategoriesForType(type,normalized)
  if(!normalized.length||allowed.length!==normalized.length)throw new Error('Bitte mindestens eine zur Betriebsart passende Kategorie angeben.')
  return {type,category:allowed}
}

function checkHours(row:EditRow){
  if(row.is_closed!==true&&(!row.opens_at||!row.closes_at))throw new Error('Bitte Öffnungs- und Schließzeit angeben, bevor du den Zeitraum als geöffnet speicherst.')
}
const sameValue=(key:string,a:unknown,b:unknown)=>['opens_at','closes_at'].includes(key)&&typeof a==='string'&&typeof b==='string'?a.slice(0,5)===b.slice(0,5):JSON.stringify(a)===JSON.stringify(b)

/** A stable caller-generated ID makes retrying an acknowledged-late insert safe. */
export async function addPartnerDetail(client:SupabaseClient,partnerId:string,input:PartnerDetailAddition):Promise<EditRow>{
  if(!validId(partnerId)||!input||!validId(input.id)||!['social','hour'].includes(input.kind)||!input.values)throw new Error('Ungültiger neuer Eintrag.')
  const {kind,values}=input,schema=schemas[kind]
  if(!Number.isInteger(values.sort_order)||Number(values.sort_order)<0||Number(values.sort_order)>10000)throw new Error('Ungültige Reihenfolge.')
  const row:EditRow={id:input.id,partner_id:partnerId,sort_order:values.sort_order}
  if(kind==='social'){
    if(typeof values.platform!=='string'||!isPartnerSocialPlatform(values.platform))throw new Error('Bitte eine unterstützte Social-Media-Plattform wählen.')
    const url=cleanValue(kind,'url',values.url)
    if(!url)throw new Error('Bitte einen Social-Media-Link eingeben.')
    Object.assign(row,{platform:values.platform,url,handle:null})
  }else{
    if(!Number.isInteger(values.weekday)||Number(values.weekday)<1||Number(values.weekday)>7)throw new Error('Bitte einen Wochentag wählen.')
    Object.assign(row,{weekday:values.weekday,is_closed:cleanValue(kind,'is_closed',values.is_closed),opens_at:cleanValue(kind,'opens_at',values.opens_at??''),closes_at:cleanValue(kind,'closes_at',values.closes_at??''),label:cleanValue(kind,'label',values.label??'')})
    checkHours(row)
  }
  const inserted=await client.from(schema.table).insert(row).select(schema.columns).returns<EditRow[]>()
  let result=inserted
  if(inserted.error?.code==='23505')result=await client.from(schema.table).select(schema.columns).eq('id',input.id).eq('partner_id',partnerId).returns<EditRow[]>()
  if(result.error)throw new Error('Der neue Eintrag konnte nicht gespeichert werden. Deine Eingabe bleibt erhalten.')
  const saved=result.data?.[0]
  if(result.data?.length!==1||!saved||Object.keys(row).some(key=>!sameValue(key,row[key],saved[key])))throw new Error('Der neue Eintrag wurde nicht eindeutig bestätigt. Bitte neu laden und vergleichen.')
  return saved
}
