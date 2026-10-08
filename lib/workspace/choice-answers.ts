import benefits from '../partners/benefits-v1.json'
export type ChoiceOption={id:string;label:string;description:string;placeholder?:string}
export type ChoiceAnswer={format:'benefitsi-choice-v1';choices:Record<string,{selected:boolean;note:string}>;notes:string}
const option=(id:string,label:string,description:string,placeholder?:string):ChoiceOption=>({id,label,description,placeholder})
const paidUtility:Record<string,string>={microsite:'Ein eigener Auftritt bündelt eure Inhalte, Angebote und Kontaktmöglichkeiten.',media:'Gäste können Räume und Atmosphäre vorab kennenlernen. Die Produktion von Aufnahmen wird getrennt vereinbart.',feedback:'Rückmeldungen nach dem Besuch helfen, den Ablauf zu verbessern.',advanced:'Erkennen, wann Gäste kommen, wiederkehren und Vorteile nutzen.',export:'Zusammengefasste Zahlen für eigene Auswertungen mitnehmen.',drafts:'Besuchsgruppen verstehen und passende Aktionen vorbereiten.',delivery:'Gäste später gezielt zurückholen. Versand ist noch nicht verfügbar; derzeit nur Entwürfe.',article:'Eure Geschichte und Angebote redaktionell vorstellen; Termin und Umfang abstimmen.',interview:'Menschen hinter dem Betrieb vorstellen; Format und Termin abstimmen.',ai:'Speisekarten schneller übertragen; erst nach Kosten- und Betriebsfreigabe.',priority:'Anliegen innerhalb der Geschäftszeiten mit höherer Priorität klären.'}
export const choiceOptions:Record<string,ChoiceOption[]>={
  D01:[
    option('two_for_one','2 für 1','Zwei gleiche Artikel oder Leistungen zum Preis von einem.'),
    option('discount','Rabatt','Ein fester Eurobetrag oder ein prozentualer Nachlass.'),
    option('free_item','Gratisartikel','Ein bestimmter Artikel oder eine Leistung kostenlos.'),
    option('bonus_stamp','Bonusstempel','Zusätzliche Stempel als Vorteil vergeben.'),
    option('welcome','Willkommensbonus','Ein Vorteil beim ersten qualifizierten Besuch.'),
    option('time_bonus','Zeitbonus','Eine schnelle Rückkehr innerhalb einer festgelegten Frist belohnen.'),
    option('comeback','Comeback-Deal','Einen Wiederbesuch nach einer längeren Pause belohnen.'),
    option('birthday','Geburtstagsangebot','Einen Vorteil rund um den Geburtstag anbieten.'),
    option('challenge','Challenge','Ein festgelegtes Besuchsziel belohnen.'),
    option('happy_hour','Happy Hour','Einen Vorteil an ausgewählten Tagen und Uhrzeiten anbieten.'),
    option('deal_drop','Deal Drop','Eine begrenzte Aktion mit festem Inhalt, Zeitraum und Kontingent. Erste Ideen unter D09.')
  ],
  D05:[option('once','Einmalig pro Gast','Der Vorteil kann insgesamt einmal genutzt werden.'),option('annual','Einmal jährlich','Kalenderjahr oder zwölf Monate ab Einlösung sowie die betroffenen Angebote angeben.'),option('interval','Festes Intervall','Zum Beispiel alle 30 Tage; Zeitraum und betroffene Angebote festhalten.'),option('custom','Individuelle Regeln','Für einzelne Angebote unterschiedliche Regeln vereinbaren.')],
  D09:[option('drop_interest','Interesse an Deal Drops','Erste Aktion oder mehrere Ideen festhalten.','Inhalt, Vorteil, Menge und Zeitraum der ersten Deal Drops'),option('drop_later','Vorerst kein Deal Drop','Bei Bedarf einen Grund oder späteren Zeitpunkt notieren.')],
  D10:[option('promo_interest','Interesse an einer zusätzlichen Promo','Benefitsi-Kunden erhalten einen vereinbarten Artikel gratis; Benefitsi erstattet den vorab vereinbarten Herstellungskostenbetrag. Bestehende Deals bleiben unverändert.','Artikel, ungefähre Herstellungskosten pro Stück, vereinbarter Erstattungsbetrag, Anzahl, Zeitraum und Zielgruppe (z. B. neue Premium-Kunden)'),option('promo_two_for_one','Zusätzlicher 2-für-1-Vorteil nach dem ersten Besuch','Einen späteren Wiederbesuch zusätzlich zu den bestehenden Deals fördern.','Artikel, Frist und Einlösung beim nächsten Besuch'),option('promo_free','Zusätzlicher Gratisartikel nach dem ersten Besuch','Einen weiteren kostenlosen Artikel für einen Wiederbesuch planen.','Artikel, Frist, Menge und vereinbarte Kostenübernahme')],
  H05:[...benefits.groups.flatMap(group=>group.items.filter(item=>item.scope==='pro').map(item=>option(`paid_${item.id}`,item.label,paidUtility[item.id]??item.label))),
    option('paid_production','Neue Foto-, Drohnen- oder 360°-Aufnahmen','Professionelle Inhalte für euren Auftritt. Separate Produktionsanfrage; Umfang, Termin und Kosten gesondert vereinbaren.'),
    option('paid_commerce','Bestellungen & Termine · optionale Anfrage','Bedarf an digitalen Bestell- und Terminabläufen prüfen. Separates Commerce-Modul; Verfügbarkeit, Umfang und aktuellen Katalogpreis abstimmen.'),
    option('paid_seo','SEO & Reichweite · optionale Anfrage','Bedarf an besserer Auffindbarkeit prüfen. Separates SEO-Modul; Verfügbarkeit, Umfang und aktuellen Katalogpreis abstimmen.')]
}
const labels=Object.fromEntries(Object.values(choiceOptions).flat().map(item=>[item.id,item.label]))
export function parseChoiceAnswer(answer:string):ChoiceAnswer|null{
  if(!answer.startsWith('{'))return null
  try{
    const value=JSON.parse(answer)
    if(value?.format!=='benefitsi-choice-v1'||typeof value.notes!=='string'||!value.choices||Array.isArray(value.choices)||typeof value.choices!=='object'||Object.keys(value.choices).length>50)return null
    if(Object.entries(value.choices).some(([id,entry])=>!/^[-a-z0-9_]{1,80}$/.test(id)||!entry||typeof entry!=='object'||typeof (entry as {selected:unknown}).selected!=='boolean'||typeof (entry as {note:unknown}).note!=='string'))return null
    return value as ChoiceAnswer
  }catch{return null}
}
export function decodeChoiceAnswer(answer:string):ChoiceAnswer{return parseChoiceAnswer(answer)??{format:'benefitsi-choice-v1',choices:{},notes:answer}}
export function encodeChoiceAnswer(value:ChoiceAnswer):string{
  if(!value.notes.trim()&&!Object.values(value.choices).some(v=>v.selected||v.note.trim()))return ''
  const encoded=JSON.stringify(value)
  if(encoded.length>10000)throw new Error('Die Antwort ist zu lang. Bitte Details kürzen oder in die freien Gesprächsnotizen übernehmen.')
  return encoded
}
export function formatChoiceAnswer(answer:string):string{
  const value=parseChoiceAnswer(answer);if(!value)return answer
  return [...Object.entries(value.choices).filter(([,entry])=>entry.selected||entry.note.trim()).map(([id,entry])=>`${entry.selected?'':'Nicht ausgewählt · '}${labels[id]??id}${entry.note.trim()?`: ${entry.note}`:''}`),value.notes].filter(Boolean).join('\n\n')
}
