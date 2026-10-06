export type BriefRow = Record<string, unknown>
export type PartnerFact = {label:string;value:string;href:string}
export type PartnerBrief = {partnerId:string;partnerName:string;loadedAt:string;facts:Record<string,PartnerFact[]>}
export type PartnerBriefSource = {
  partner:BriefRow;owner:BriefRow|null;microsite:BriefRow|null;
  deals:BriefRow[];rewards:BriefRow[];hours:BriefRow[];holidays:BriefRow[];
  socials:BriefRow[];menus:BriefRow[];staff:BriefRow[];
}
const text=(value:unknown):string=>typeof value==='string'?value.trim():typeof value==='number'?String(value):''
const join=(values:unknown[],separator=' · ')=>values.map(text).filter(Boolean).join(separator)
const record=(value:unknown):BriefRow=>value&&typeof value==='object'&&!Array.isArray(value)?value as BriefRow:{}
const state=(row:BriefRow)=>row.active===true?'Im Admin aktiviert':row.active===false?'Im Admin deaktiviert':'Status nicht hinterlegt'
const name=(row:BriefRow)=>join([row.public_title||row.display_title||row.title||row.reward_item||row.customer_description||'Angebot',state(row)])
const money=(value:unknown)=>text(value)?`${Number(value).toLocaleString('de-DE')} €`:''
const number=(value:unknown)=>value!=null&&text(value)!==''&&Number.isFinite(Number(value))?Number(value):null
const benefit=(row:BriefRow)=>{
  const raw=text(row.reward_type)||text(row.discount_type),kind=raw==='percentage'?'percent':raw==='amount'?'fixed':raw
  const count=number(row.reward_type==='bonus_stamp'?row.discount_value:row.benefit_count)
  const input={type:text(row.type),reward_format:text(row.reward_format),discount_type:kind,discount_value:number(row.discount_value),reward_item:text(row.reward_item),benefit_count:count}
  const title=(kind==='bonus_stamp'||input.reward_format==='bonus_stamp'||input.type==='bonus_stamp')&&count===null?'Bonusstempel · Anzahl nicht hinterlegt':formatBenefitTitle(input)
  return join([title,row.reward_item&&!title.includes(text(row.reward_item))?row.reward_item:'',row.customer_description])
}
const days=['','Mo','Di','Mi','Do','Fr','Sa','So']
const weekday=(value:unknown)=>days[Number(value)]||({monday:'Mo',tuesday:'Di',wednesday:'Mi',thursday:'Do',friday:'Fr',saturday:'Sa',sunday:'So'} as Record<string,string>)[text(value)]||text(value)

/** Only factual, partner-scoped editorial data. No PIN, customer activity or inferred approvals. */
export function buildPartnerBrief(source:PartnerBriefSource):PartnerBrief {
  const p=source.partner,partnerId=text(p.id),facts:PartnerBrief['facts']={}
  const own=(rows:BriefRow[])=>rows.filter(r=>r.partner_id===partnerId)
  const deals=own(source.deals),rewards=own(source.rewards),hours=own(source.hours),menus=own(source.menus)
  const base=`/partners?partner=${encodeURIComponent(partnerId)}`
  const add=(ids:string[],label:string,value:unknown,tab='details')=>{
    const content=text(value);if(!content)return
    for(const id of ids)(facts[id]??=[]).push({label,value:content,href:tab==='microsite'?`${base}&view=microsite`:`${base}&tab=${tab}`})
  }
  add(['A01'],'Öffentlicher Name',p.name)
  add(['A01'],'Betriebsart',join([p.type,...(Array.isArray(p.category)?p.category:[])]))
  add(['A02'],'Zugeordnetes Inhaberkonto – Zuständigkeit gemeinsam prüfen',join([source.owner?.display_name,source.owner?.email]))
  add(['A02','A03','E01'],'Betriebskontakt',join([p.phone,p.email]))
  add(['A03','E01'],'Adresse',p.address)
  add(['A03','E05'],'Website',p.website)
  add(['A04','E01','E04'],'Vorbereitete Beschreibung',p.description)
  add(['A03','E01'],'Öffnungszeiten',hours.map(h=>`${weekday(h.weekday)}: ${h.is_closed===true?'geschlossen':join([text(h.opens_at).slice(0,5),text(h.closes_at).slice(0,5)],'–')||'Zeiten offen'}${h.label?` · ${text(h.label)}`:''}`).join('\n'))
  add(['A03'],'Abweichende Schließtage',own(source.holidays).map(h=>join([h.holiday_date,h.label])).join('\n'))
  add(['B02'],'Hinterlegter Besuchsrhythmus',p.level_frequency)
  add(['C01','C04'],'Kartenmodell',p.stamp_target!=null?`${text(p.stamp_target)} Stempel`:null,'deals')
  add(['C02'],'Hinterlegte Belohnung',join([p.reward_text_primary,p.reward_text_secondary]),'deals')
  for(const r of rewards){
    add(['C02','C04'],'Vorbereitete Stempelbelohnung',join([name(r),r.required_stamps!=null?`${text(r.required_stamps)} Stempel`:'',benefit(r)]),'deals')
    add(['C05'],'Gültigkeit der Belohnung',join([name(r),r.audience&&`Zielgruppe: ${text(r.audience)}`]),'deals')
    add(['C06'],'Belohnungsbedingungen',r.terms?`${name(r)}: ${text(r.terms)}`:'','deals')
    add(['C08'],'Hinweis zur Einlösung',r.staff_instructions?`${name(r)}: ${text(r.staff_instructions)}`:'','deals')
  }
  for(const d of deals){
    add(['D01','D08'],'Vorbereitetes Angebot',join([name(d),benefit(d)]),'deals')
    add(['D02'],'Angebotsart',join([name(d),benefitTaxonomyLabel({type:text(d.type),reward_format:text(d.reward_format),discount_type:text(d.discount_type),campaign_type:text(d.campaign_type)})]),'deals')
    add(['D03'],'Vorteil für den Gast',join([name(d),benefit(d)]),'deals')
    add(['D04'],'Gültigkeitszeitraum',join([name(d),d.valid_from&&`Ab ${text(d.valid_from)}`,d.valid_until&&`Bis ${text(d.valid_until)}`,Array.isArray(d.weekdays)?d.weekdays.map(weekday).join(', '):'',join([d.happy_hour_start,d.happy_hour_end],'–'),d.timezone]),'deals')
    add(['D05'],'Nutzung und Zielgruppe',join([name(d),d.audience,d.premium_only===true?'Nur Premium':'',d.max_redemptions_per_user!=null?`${text(d.max_redemptions_per_user)} Einlösungen pro Gast`:'',d.max_redemptions_global!=null?`${text(d.max_redemptions_global)} Einlösungen insgesamt`:'',d.cooldown_hours!=null?`${text(d.cooldown_hours)} Stunden Abstand`:'',d.stock_remaining!=null?`${text(d.stock_remaining)} verbleibend`:'']),'deals')
    add(['D06'],'Bedingungen',join([name(d),d.terms,d.min_spend!=null?`Mindestkauf: ${money(d.min_spend)}`:'',d.max_discount_amount!=null?`Maximaler Rabatt: ${money(d.max_discount_amount)}`:'']),'deals')
    add(['D07'],'Aktueller Angebotsstatus',name(d),'deals')
  }
  add(['E02','F02'],'Logo',p.logo_url)
  add(['E02','F02'],'Profilbild',p.discover_card_image_url||p.feature_card_url)
  add(['E02','F02'],'Weitere Bilder',Array.isArray(p.cover_urls)?p.cover_urls.map(text).filter(Boolean).join('\n'):'')
  add(['E02','E04'],'Vorbereitete Speise- oder Leistungskarten',menus.map(m=>join([m.name,m.description,m.status])).join('\n'),'menu')
  add(['E05'],'Weitere hinterlegte Links',own(source.socials).map(s=>join([s.platform,s.url,s.handle])).join('\n'))
  for(const member of own(source.staff))add(['G01'],'Hinterlegter Teamzugang',join([member.display_name,member.email,member.role,member.status,member.active===false?'Inaktiv':'']),'access')
  const microsite=source.microsite
  if(microsite){
    add(['E01','E03'],'Microsite',join([microsite.slug,microsite.status==='published'?'Veröffentlicht':microsite.status==='draft'?'Entwurf':microsite.status]),'microsite')
    const config=record(microsite.config)
    for(const key of ['richMedia','richMediaTour']){
      const media=record(config[key]);if(!text(media.url))continue
      add(['F01','F02'],'Vorbereitetes Video / 360°-Material',join([media.title,media.kind,media.url]),'microsite')
      add(['F04','F07'],'Im Editor erfasster Medien-Freigabestand',join([media.title,media.rightsConfirmed===true?'Nutzungsrechte bestätigt':'Nutzungsrechte noch offen',media.approved===true?'Inhalt freigegeben':'Inhaltsfreigabe offen']),'microsite')
    }
  }
  return {partnerId,partnerName:text(p.name),loadedAt:new Date().toISOString(),facts}
}
import { benefitTaxonomyLabel, formatBenefitTitle } from '../benefit-taxonomy'
