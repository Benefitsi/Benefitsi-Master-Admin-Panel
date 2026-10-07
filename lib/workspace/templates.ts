import questions from './onboarding.json'
import { emptyContent, type Content, type Question } from './model'

export { templateVersion } from './onboarding-upgrade'
import { templateVersion } from './onboarding-upgrade'
export function onboardingContent(): Content {
  return {...emptyContent(),questions:questions.map(q=>({...q,answerType:q.answerType as Question['answerType'],options:[...q.options],answer:'',change:'',agreement:'',status:'open',reason:'',hidden:false})),meeting:{date:'',participants:'',summary:'',templateVersion}}
}
export const featureGuides = [
  {title:'Stempelkarte, Levels & Abzeichen',text:'Gäste sammeln bei bestätigten Besuchen Stempel. Der aktuelle Editor verwendet zehn Stempel als Kartenmodell. Vorhandene Meilensteine und Belohnungen gemeinsam prüfen; Herstellungskosten pro Artikel oder Leistung getrennt erfassen. Auch Levels und Abzeichen auf ihre Eignung prüfen. Neue Kartenmodelle, Abzeichen und Kriterien bleiben Wünsche mit Prüfbedarf.'},
  {title:'Angebote, Happy Hour & Deal Drops',text:'Normale Angebote und Happy Hour sind für Free und Pro ohne Tarif-Mengenlimit vorgesehen. Ein Deal Drop ist eine gezielt begrenzte Aktion. Free: eine Veröffentlichung je Kalendermonat und Standort; Pro aktuell vorläufig ohne Monatslimit. Eine Veröffentlichung startet keinen Marketingversand.'},
  {title:'Profil & Microsite',text:'Das Basisprofil zeigt den Betrieb in App und Stadtverzeichnis. Pro umfasst eine eigene Microsite mit ausführlicher Darstellung. Texte, Bilder und Veröffentlichung werden gemeinsam freigegeben.'},
  {title:'360°-Ansicht & Video',text:'Gäste können sich vor einem Besuch digital im Raum umsehen. Mehrere verbundene Ansichten können einen Rundgang bilden. Pro erlaubt die Einbindung einer freigegebenen Videoquelle und einer 360°-/Tourquelle. Neue Aufnahmen, Schnitt und Tourproduktion werden separat angefragt; kein automatischer Gratisbonus.'},
  {title:'Statistik & Feedback',text:'Bestätigte Besuche, Stempel und Einlösungen zeigen die Nutzung. Pro ergänzt vertiefte Auswertungen und Feedback, dessen Zusammenfassung erst ab fünf Antworten sichtbar ist. Ohne entsprechende Daten gibt es keine Umsatz- oder Erfolgszusage.'},
  {title:'Kundenbindung & Redaktion',text:'Pro umfasst vorbereitete Kampagnenentwürfe sowie Artikel- und Interviewanfragen. Der aktuelle Leistungsstand bestätigt keinen automatischen Marketingversand. Umfang, Termin und Freigaben für redaktionelle Inhalte werden separat abgestimmt.'},
  {title:'Menü, Team & Zusatzmodule',text:'Manuelle Profil-, Menü- und Öffnungszeitenpflege steht Free und Pro zur Verfügung. Zuständigkeiten für Social Media, Links, Menü und Preise gemeinsam klären. Rollen und Kontingente folgen der Tarifansicht. Interesse an kostenpflichtigen Funktionen anhand des bestehenden Leistungskatalogs erfassen; verfügbare und geplante Leistungen getrennt erklären. KI-Menüimport, Bestellungen, Termine und SEO verwenden die dort ausgewiesenen Rechte und Freigaben. Partner Pro und Consumer Premium sind getrennte Produkte.'},
]
