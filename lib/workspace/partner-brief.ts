import { formatBenefitTitle, benefitTaxonomyLabel } from '../benefit-taxonomy'
import { canonicalPartnerSlug } from '../partner-paths'
import { frequencyForValue, hasConfiguredFrequency, levelRanges, visitFrequencyLabels } from '../partner-visit-levels'
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
const number=(value:unknown)=>value!=null&&text(value)!==''&&Number.isFinite(Number(value))?Number(value):null
const benefit=(row:BriefRow)=>{
  const raw=text(row.reward_type)||text(row.discount_type),kind=raw==='percentage'?'percent':raw==='amount'?'fixed':raw
  const count=number(row.reward_type==='bonus_stamp'?row.discount_value:row.benefit_count)
  const input={type:text(row.type),campaign_type:text(row.campaign_type),reward_format:text(row.reward_format),discount_type:kind,discount_value:number(row.discount_value),reward_item:text(row.reward_item),benefit_count:count}
  if((kind==='bonus_stamp'||input.reward_format==='bonus_stamp'||input.type==='bonus_stamp')&&count===null)return 'Bonusstempel · Anzahl noch offen'
  if(!input.reward_format&&!kind&&!input.type)return text(row.title||row.public_title||row.display_title)||'Vorteil noch offen'
  return formatBenefitTitle(input)
}
const days=['','Mo','Di','Mi','Do','Fr','Sa','So']
const weekday=(value:unknown)=>days[Number(value)]||({monday:'Mo',tuesday:'Di',wednesday:'Mi',thursday:'Do',friday:'Fr',saturday:'Sa',sunday:'So'} as Record<string,string>)[text(value)]||text(value)

/** Partner-scoped preparation; reading a fact never grants approval or changes an offer. */
export function buildPartnerBrief(source:PartnerBriefSource):PartnerBrief {
  const p=source.partner,partnerId=text(p.id),facts:PartnerBrief['facts']={}
  const own=(rows:BriefRow[])=>rows.filter(r=>r.partner_id===partnerId)
  const deals=own(source.deals),rewards=own(source.rewards).sort((a,b)=>Number(a.required_stamps)-Number(b.required_stamps)),hours=own(source.hours),menus=own(source.menus)
  const base=`/partners?partner=${encodeURIComponent(partnerId)}`
  const add=(ids:string[],label:string,value:unknown,tab='details',href?:string)=>{
    const content=text(value);if(!content)return
    for(const id of ids)(facts[id]??=[]).push({label,value:content,href:href??(tab==='microsite'?`${base}&view=microsite`:`${base}&tab=${tab}`)})
  }
  add(['A01'],'Öffentlicher Name',p.name)
  add(['A01'],'Betriebsart',join([p.type,...(Array.isArray(p.category)?p.category:[])]))
  add(['A01'],'Beschreibung',p.description)
  add(['A01'],'Adresse',p.address)
  add(['A01'],'Öffentlicher Betriebskontakt',join([p.phone,p.email]))
  add(['A01'],'Website',p.website)
  add(['A01'],'Zugeordnetes Konto – Zuständigkeit prüfen',source.owner?.display_name)
  add(['A01'],'Öffnungszeiten',hours.map(h=>`${weekday(h.weekday)}: ${h.is_closed===true?'geschlossen':join([text(h.opens_at).slice(0,5),text(h.closes_at).slice(0,5)],'–')||'Zeiten offen'}${h.label?` · ${text(h.label)}`:''}`).join('\n'))
  add(['A01'],'Abweichende Schließtage',own(source.holidays).map(h=>join([h.holiday_date,h.label])).join('\n'))
  for(const social of own(source.socials))add(['A01'],text(social.platform),social.url||social.handle)
  add(['B02'],'Hinterlegter Besuchsrhythmus',hasConfiguredFrequency(text(p.level_frequency))?visitFrequencyLabels[frequencyForValue(text(p.level_frequency))]:'')
  if(!rewards.some(r=>r.required_stamps===p.stamp_target))add(['C01'],'Stempelkarte',p.stamp_target!=null?`${text(p.stamp_target)} Stempel`:null,'deals')
  if(!rewards.length)add(['C01'],'Hinterlegte Belohnung',join([...new Set([text(p.reward_text_primary),text(p.reward_text_secondary)])]),'deals')
  for(const r of rewards){
    add(['C01'],r.required_stamps!=null?`${text(r.required_stamps)} Stempel`:'Stempelzahl offen',join([benefit(r),r.active===false?'Pausiert':'']),'deals')
    add(['C08'],'Hinweis zur Einlösung',r.staff_instructions?`${benefit(r)}: ${text(r.staff_instructions)}`:'','deals')
  }
  const frequency=frequencyForValue(text(p.level_frequency))
  add(['C09'],`Level-Aufstieg · ${visitFrequencyLabels[frequency]}${hasConfiguredFrequency(text(p.level_frequency))?'':' (Standard, noch nicht individuell hinterlegt)'}`,levelRanges(frequency).map(level=>`${level.germanName}: ab ${level.minimumVisits} Besuche`).join('\n'))
  for(const [i,d] of deals.entries()){
    const label=benefitTaxonomyLabel({type:text(d.type),campaign_type:text(d.campaign_type),reward_format:text(d.reward_format),discount_type:text(d.discount_type)})
    const title=benefit(d),prefix=label&&title.toLowerCase().startsWith(label.toLowerCase())?'':label
    add(['D01'],`Angebot ${i+1}${d.active===false?' · Pausiert':''}`,join([prefix,title,join([text(d.happy_hour_start).slice(0,5),text(d.happy_hour_end).slice(0,5)],'–')]),'deals')
    const limits=join([d.premium_only===true?'Nur Premium':d.audience,d.max_redemptions_per_user!=null?`${text(d.max_redemptions_per_user)} Einlösungen pro Gast`:'',d.max_redemptions_global!=null?`${text(d.max_redemptions_global)} insgesamt`:'',d.cooldown_hours!=null?`${text(d.cooldown_hours)} Stunden Abstand`:'',d.stock_remaining!=null?`${text(d.stock_remaining)} verfügbar`:''])
    if(limits)add(['D05'],title,limits,'deals')
  }
  add(['E02','F02'],'Logo',p.logo_url)
  add(['E02','F02'],'Profilbild',p.discover_card_image_url||p.feature_card_url)
  add(['E02','F02'],'Weitere Bilder',Array.isArray(p.cover_urls)?p.cover_urls.map(text).filter(Boolean).join('\n'):'')
  add(['E02','E04'],'Vorbereitete Speise- oder Leistungskarten',menus.map(m=>join([m.name,m.description,m.status])).join('\n'),'menu')
  for(const member of own(source.staff))add(['G01'],'Hinterlegter Teamzugang',join([member.display_name,member.email,member.role,member.status,member.active===false?'Inaktiv':'']),'access')
  const microsite=source.microsite
  if(microsite){
    const published=microsite.status==='published'&&text(microsite.slug)
    const href=published?`https://benefitsi.de/partner/${encodeURIComponent(canonicalPartnerSlug(text(microsite.slug)))}`:`${base}&view=microsite`
    add(['E01'],published?'Microsite öffnen':'Microsite-Entwurf öffnen',href,'microsite',href)
    const config=record(microsite.config)
    for(const key of ['richMedia','richMediaTour']){
      const media=record(config[key]);if(!text(media.url))continue
      add(['F01','F02'],'Vorbereitetes Video / 360°-Material',join([media.title,media.kind,media.url]),'microsite')
      add(['F07'],'Medien-Freigabestand',join([media.title,media.rightsConfirmed===true?'Nutzungsrechte bestätigt':'Nutzungsrechte noch offen',media.approved===true?'Inhalt freigegeben':'Inhaltsfreigabe offen']),'microsite')
    }
  }else add(['E01'],'Microsite vorbereiten',`${base}&view=microsite`,'microsite')
  return {partnerId,partnerName:text(p.name),loadedAt:new Date().toISOString(),facts}
}
