"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

export type AdminLanguage = "en" | "de"

const STORAGE_KEY = "benefitsi-admin-language"

const translations = [
  ["Partner management", "Partnerverwaltung"],
  ["All partners and their information", "Alle Partner und ihre Informationen"],
  ["Partners", "Partner"],
  ["Active partners", "Aktive Partner"],
  ["Featured partners", "Hervorgehobene Partner"],
  ["Menu approvals required", "Menüfreigaben erforderlich"],
  ["Menu approvals", "Menüfreigaben"],
  ["Select a partner to edit.", "Wähle einen Partner zur Bearbeitung aus."],
  ["Add", "Hinzufügen"],
  ["Search partners", "Partner suchen"],
  ["No partners match your search.", "Keine Partner entsprechen deiner Suche."],
  ["Add partner", "Partner hinzufügen"],
  ["No partners yet", "Noch keine Partner"],
  ["Create the partner profile, assign its owner, upload media, and add any deals in one save.", "Erstelle das Partnerprofil, weise einen Inhaber zu und füge Medien sowie Deals in einem Schritt hinzu."],
  ["Add a partner to start managing deals.", "Füge einen Partner hinzu, um Deals zu verwalten."],
  ["No location or type", "Kein Standort oder Typ"],
  ["Food & Drink", "Gastronomie"],
  ["Services", "Dienstleistungen"],
  ["Wellness", "Wellness"],
  ["Activities", "Aktivitäten"],
  ["Deal recommended", "Deal empfohlen"],
  ["Inactive", "Inaktiv"],
  ["Business Control Center", "Business Control Center"],
  ["Overview", "Übersicht"],
  ["Acquisition & Marketing", "Akquisition & Marketing"],
  ["Product & Funnel", "Produkt & Funnel"],
  ["Revenue & Profit", "Umsatz & Gewinn"],
  ["Data quality & Definitions", "Datenqualität & Definitionen"],
  ["Growth", "Wachstum"],
  ["User journey", "Nutzerverlauf"],
  ["Customer value", "Kundenwert"],
  ["Finance", "Finanzen"],
  ["Network", "Netzwerk"],
  ["Trust", "Vertrauen"],
  ["The most important outcomes and guardrails for the current reporting period.", "Die wichtigsten Ergebnisse und Leitplanken für den aktuellen Berichtszeitraum."],
  ["Channels, campaigns, attribution, and costs through value-generating activation.", "Kanäle, Kampagnen, Attribution und Kosten bis zur wertstiftenden Aktivierung."],
  ["From signup through time-to-value and deal usage to confirmed redemption.", "Von der Registrierung über die Zeit bis zum ersten Nutzen und die Deal-Nutzung bis zur bestätigten Einlösung."],
  ["Returning customers, cohorts, and realized customer value; forecasts remain clearly marked as provisional.", "Wiederkehrende Kunden, Kohorten und realisierter Kundenwert; vorläufige Prognosen bleiben klar gekennzeichnet."],
  ["Cash collections, period-adjusted revenue, contribution margin, and operating profit.", "Zahlungseingänge, periodengerechter Umsatz, Deckungsbeitrag und Betriebsergebnis."],
  ["Partner activity, confirmed redemptions, returning customers, and concentration risks.", "Partneraktivität, bestätigte Einlösungen, wiederkehrende Kunden und Konzentrationsrisiken."],
  ["Source status, freshness, caveats, and versioned definitions behind every number.", "Quellenstatus, Aktualität, Einschränkungen und versionierte Definitionen hinter jeder Kennzahl."],
  ["Filter business analytics", "Business Analytics filtern"],
  ["From", "Von"],
  ["To", "Bis"],
  ["City", "Stadt"],
  ["Channel", "Kanal"],
  ["Environment", "Umgebung"],
  ["All cities", "Alle Städte"],
  ["All partners", "Alle Partner"],
  ["All channels", "Alle Kanäle"],
  ["All plans", "Alle Pläne"],
  ["Production", "Produktion"],
  ["Reset", "Zurücksetzen"],
  ["Apply", "Anwenden"],
  ["Data is stale", "Daten sind veraltet"],
  ["Data partially available", "Daten teilweise verfügbar"],
  ["No verified data yet", "Noch keine geprüften Daten"],
  ["Verified data available", "Geprüfte Daten verfügbar"],
  ["Data review pending", "Datenprüfung ausstehend"],
  ["Calculated", "Berechnet"],
  ["Data as of", "Datenstand"],
  ["Not available", "Nicht verfügbar"],
  ["Definition", "Definition"],
  ["Source", "Quelle"],
  ["Comparison not measurable yet", "Vergleich noch nicht messbar"],
  ["Next step", "Nächster Schritt"],
  ["Partner Profile", "Partnerprofil"],
  ["Hours & Rewards", "Zeiten & Prämien"],
  ["Deals & Offers", "Deals & Angebote"],
  ["Menu Management", "Menüverwaltung"],
  ["Staff Access", "Mitarbeiterzugriff"],
  ["Customer Activity", "Kundenaktivität"],
  ["Delete Partner", "Partner löschen"],
  ["Partner settings", "Partnereinstellungen"],
  ["Microsite builder", "Microsite-Builder"],
  ["Partner profile", "Partnerprofil"],
  ["Hours and loyalty rewards", "Öffnungszeiten und Treueprämien"],
  ["Edit partner details, social handles, media, milestones, deals, menu, hours, and Supabase routing fields.", "Bearbeite Partnerdaten, Social-Media-Profile, Medien, Prämienstufen, Deals, Menü, Öffnungszeiten und die Supabase-Zuordnung."],
  ["Deals and offers", "Deals und Angebote"],
  ["Menu management", "Menüverwaltung"],
  ["Staff access", "Mitarbeiterzugriff"],
  ["Customer activity", "Kundenaktivität"],
  ["Delete partner", "Partner löschen"],
  ["Business profile", "Unternehmensprofil"],
  ["Business Profile", "Unternehmensprofil"],
  ["Operations and media", "Betrieb und Medien"],
  ["Operations & Media", "Betrieb & Medien"],
  ["Rewards and deals", "Prämien und Deals"],
  ["Rewards & Deals", "Prämien & Deals"],
  ["Starter menu", "Startmenü"],
  ["Starter Menu", "Startmenü"],
  ["Review and create", "Prüfen und erstellen"],
  ["Review & Create", "Prüfen & Erstellen"],
  ["Add partner steps", "Schritte zum Hinzufügen eines Partners"],
  ["Adding partner...", "Partner wird hinzugefügt ..."],
  ["Save partner", "Partner speichern"],
  ["Saving partner...", "Partner wird gespeichert ..."],
  ["Save partner changes?", "Partneränderungen speichern?"],
  ["Save changes", "Änderungen speichern"],
  ["Profile", "Profil"],
  ["Contact and Location", "Kontakt und Standort"],
  ["Business information, contact details, location, branding, and media.", "Unternehmensdaten, Kontaktdaten, Standort, Marke und Medien."],
  ["Opening schedule, holiday closures, and stamp-card milestones.", "Öffnungszeiten, Feiertagsschließungen und Stempelkarten-Prämien."],
  ["Customer offers, eligibility rules, availability, and redemption settings.", "Kundenangebote, Teilnahmebedingungen, Verfügbarkeit und Einlöseeinstellungen."],
  ["Menu details, categories, items, pricing, images, and display order.", "Menüdetails, Kategorien, Artikel, Preise, Bilder und Anzeigereihenfolge."],
  ["Manage the staff members who can administer or scan for this partner.", "Mitarbeiter verwalten, die für diesen Partner administrieren oder scannen dürfen."],
  ["Review stamp-card progress, visits, applied benefits, and redemptions.", "Stempelkarten-Fortschritt, Besuche, Vorteile und Einlösungen prüfen."],
  ["Permanently remove this partner and its attached records.", "Diesen Partner und alle zugehörigen Datensätze dauerhaft löschen."],
  ["Operating Hours", "Öffnungszeiten"],
  ["Operating hours", "Öffnungszeiten"],
  ["Media", "Medien"],
  ["Partner logo", "Partnerlogo"],
  ["Feature card", "Feature-Karte"],
  ["Discover page image", "Bild der Entdecken-Seite"],
  ["Cover photos", "Titelbilder"],
  ["Add cover photos", "Titelbilder hinzufügen"],
  ["Click any preview to replace it.", "Klicke auf eine Vorschau, um sie zu ersetzen."],
  ["Click the image to upload or replace it.", "Klicke auf das Bild, um es hochzuladen oder zu ersetzen."],
  ["Restore", "Wiederherstellen"],
  ["Stamp-card milestones", "Stempelkarten-Prämien"],
  ["Milestone", "Prämienstufe"],
  ["Milestone Details", "Details der Prämienstufe"],
  ["Milestone reward", "Stempelkarten-Prämie"],
  ["Add milestone", "Prämienstufe hinzufügen"],
  ["Save milestone", "Prämienstufe speichern"],
  ["Adding milestone...", "Prämienstufe wird hinzugefügt ..."],
  ["Saving milestone...", "Prämienstufe wird gespeichert ..."],
  ["Manage stamp-card rewards separately from deals.", "Verwalte Stempelkarten-Prämien getrennt von Deals."],
  ["Deals", "Deals"],
  ["Menu", "Menü"],
  ["Required", "Erforderlich"],
  ["Required stamps", "Erforderliche Stempel"],
  ["Reward type", "Prämientyp"],
  ["Item", "Artikel"],
  ["Fixed amount", "Fester Betrag"],
  ["Percent", "Prozent"],
  ["Bonus stamp", "Bonusstempel"],
  ["Bonus stamp count", "Anzahl der Bonusstempel"],
  ["Discount value", "Rabattwert"],
  ["Welcome reward", "Willkommensprämie"],
  ["Duration Bonus", "Zeitbonus"],
  ["Happy Hour deal", "Happy-Hour-Deal"],
  ["Permanent fallback discount", "Dauerhafter Ersatzrabatt"],
  ["Limited Deal Drop", "Limitierter Deal"],
  ["Birthday reward", "Geburtstagsprämie"],
  ["Free item deal", "Deal mit Gratisartikel"],
  ["Selectable discount", "Auswählbarer Rabatt"],
  ["Automatic bonus stamp", "Automatischer Bonusstempel"],
  ["Streak reward", "Streak-Prämie"],
  ["Challenge reward", "Challenge-Prämie"],
  ["No direct reward", "Keine direkte Prämie"],
  ["Fixed € discount", "Fester Euro-Rabatt"],
  ["Percentage discount", "Prozentualer Rabatt"],
  ["Free item", "Gratisartikel"],
  ["User selects before visit", "Vom Nutzer vor dem Besuch auswählbar"],
  ["User must choose this before the QR scan. Only one direct deal can be redeemed per visit.", "Der Nutzer muss dies vor dem QR-Scan auswählen. Pro Besuch kann nur ein direkter Deal eingelöst werden."],
  ["Applies automatically during scan", "Wird beim Scan automatisch angewendet"],
  ["No activation button. The system applies this automatically during scan if eligible.", "Keine Aktivierung erforderlich. Das System wendet den Vorteil beim Scan automatisch an, wenn die Voraussetzungen erfüllt sind."],
  ["Applies only if no selected deal", "Gilt nur, wenn kein anderer Deal ausgewählt wurde"],
  ["Applies automatically only if the user has not selected another direct deal.", "Wird nur dann automatisch angewendet, wenn der Nutzer keinen anderen direkten Deal ausgewählt hat."],
  ["Free users", "Kostenlose Nutzer"],
  ["Premium users", "Premium-Nutzer"],
  ["Free + Premium", "Kostenlos + Premium"],
  ["Free trial only", "Nur kostenlose Testphase"],
  ["Title", "Titel"],
  ["Reward item", "Prämienartikel"],
  ["Estimated savings", "Geschätzte Ersparnis"],
  ["Audience", "Zielgruppe"],
  ["Customer description", "Kundenbeschreibung"],
  ["Staff instructions", "Mitarbeiterhinweise"],
  ["Terms", "Bedingungen"],
  ["Recommended", "Empfohlen"],
  ["Contains required fields", "Enthält Pflichtfelder"],
  ["Partner name", "Partnername"],
  ["Partner type", "Partnertyp"],
  ["Partner city", "Partnerstadt"],
  ["Partner owner", "Partnerinhaber"],
  ["Owner ID", "Inhaber-ID"],
  ["Email", "E-Mail"],
  ["Active", "Aktiv"],
  ["Featured", "Hervorgehoben"],
  ["Description", "Beschreibung"],
  ["Categories", "Kategorien"],
  ["Phone", "Telefon"],
  ["Website", "Webseite"],
  ["Coordinates", "Koordinaten"],
  ["Address", "Adresse"],
  ["Owner", "Inhaber"],
  ["Logo", "Logo"],
  ["Discovery image", "Entdecken-Bild"],
  ["Cover gallery", "Titelbild-Galerie"],
  ["Map location", "Kartenposition"],
  ["Opening hours", "Öffnungszeiten"],
  ["Social profiles", "Social-Media-Profile"],
  ["Rewards", "Prämien"],
  ["Set", "Eingerichtet"],
  ["Not set", "Nicht eingerichtet"],
  ["Social media", "Soziale Medien"],
  ["Open", "Öffnen"],
  ["Close", "Schließen"],
  ["Closed", "Geschlossen"],
  ["Apply to all open days", "Auf alle geöffneten Tage anwenden"],
  ["Applied", "Angewendet"],
  ["Toggle closed days, adjust times, then save the weekly schedule once.", "Markiere Ruhetage, passe die Zeiten an und speichere anschließend den Wochenplan."],
  ["Holiday closures", "Feiertagsschließungen"],
  ["Date", "Datum"],
  ["Label", "Bezeichnung"],
  ["Holiday label", "Bezeichnung"],
  ["Optional label", "Optionale Bezeichnung"],
  ["Add holiday", "Feiertag hinzufügen"],
  ["Full-day closure", "Ganztägig geschlossen"],
  ["Add full-day closures and an optional short label for visitors.", "Ganztägige Schließungen mit einer optionalen kurzen Bezeichnung für Besucher hinzufügen."],
  ["No holiday closures added yet.", "Noch keine Feiertagsschließungen hinzugefügt."],
  ["Remove", "Entfernen"],
  ["Monday", "Montag"],
  ["Tuesday", "Dienstag"],
  ["Wednesday", "Mittwoch"],
  ["Thursday", "Donnerstag"],
  ["Friday", "Freitag"],
  ["Saturday", "Samstag"],
  ["Sunday", "Sonntag"],
  ["Save operating hours", "Öffnungszeiten speichern"],
  ["Saving operating hours...", "Öffnungszeiten werden gespeichert ..."],
  ["Menu name", "Menüname"],
  ["Menu approval status", "Freigabestatus des Menüs"],
  ["Menu description", "Menübeschreibung"],
  ["Status", "Status"],
  ["Draft", "Entwurf"],
  ["Needs review", "Prüfung erforderlich"],
  ["Published", "Veröffentlicht"],
  ["Archived", "Archiviert"],
  ["Menu status", "Menüstatus"],
  ["Updated", "Aktualisiert"],
  ["Add menu", "Menü hinzufügen"],
  ["Save menu", "Menü speichern"],
  ["Adding menu...", "Menü wird hinzugefügt ..."],
  ["Saving menu...", "Menü wird gespeichert ..."],
  ["Delete menu", "Menü löschen"],
  ["Deleting menu...", "Menü wird gelöscht ..."],
  ["Each partner has one menu with sections and items.", "Jeder Partner hat ein Menü mit Kategorien und Artikeln."],
  ["Edit menu", "Menü bearbeiten"],
  ["Close editor", "Editor schließen"],
  ["Add category", "Kategorie hinzufügen"],
  ["Edit category", "Kategorie bearbeiten"],
  ["No menu categories configured yet.", "Noch keine Menükategorien konfiguriert."],
  ["Items", "Artikel"],
  ["Other", "Weitere"],
  ["New item", "Neuer Artikel"],
  ["Add item", "Artikel hinzufügen"],
  ["Add menu item", "Menüartikel hinzufügen"],
  ["Edit item", "Artikel bearbeiten"],
  ["Edit menu item", "Menüartikel bearbeiten"],
  ["Duplicate", "Duplizieren"],
  ["Duplicate item", "Artikel duplizieren"],
  ["Duplicate menu item", "Menüartikel duplizieren"],
  ["Review the copied details, then create the new item.", "Prüfe die kopierten Angaben und erstelle anschließend den neuen Artikel."],
  ["Keep the menu focused by editing one item at a time.", "Bearbeite jeweils nur einen Artikel, damit das Menü übersichtlich bleibt."],
  ["Delete", "Löschen"],
  ["Popular", "Beliebt"],
  ["No category", "Keine Kategorie"],
  ["No description", "Keine Beschreibung"],
  ["No menu items configured yet.", "Noch keine Menüartikel angelegt."],
  ["No items in this category yet.", "Noch keine Artikel in dieser Kategorie."],
  ["Menu item categories", "Kategorien der Menüartikel"],
  ["Item name", "Artikelname"],
  ["Category", "Kategorie"],
  ["Price", "Preis"],
  ["Currency", "Währung"],
  ["Position in category", "Position in der Kategorie"],
  ["Position in menu", "Position im Menü"],
  ["Tags", "Tags"],
  ["Allergens", "Allergene"],
  ["Menu item", "Menüartikel"],
  ["Menu item picture", "Bild des Menüartikels"],
  ["Menu category picture", "Bild der Menükategorie"],
  ["Add menu category", "Menükategorie hinzufügen"],
  ["Edit menu category", "Menükategorie bearbeiten"],
  ["Save category", "Kategorie speichern"],
  ["Saving category...", "Kategorie wird gespeichert ..."],
  ["Adding category...", "Kategorie wird hinzugefügt ..."],
  ["Deleting category...", "Kategorie wird gelöscht ..."],
  ["Save item", "Artikel speichern"],
  ["Saving item...", "Artikel wird gespeichert ..."],
  ["Adding item...", "Artikel wird hinzugefügt ..."],
  ["Deleting item...", "Artikel wird gelöscht ..."],
  ["Description (optional)", "Beschreibung (optional)"],
  ["Cost", "Aufpreis"],
  ["Add-ons", "Extras"],
  ["Images matched", "Zugeordnete Bilder"],
  ["Images missing", "Fehlende Bilder"],
  ["Import menu", "Menü importieren"],
  ["Importing menu...", "Menü wird importiert ..."],
  ["Confirm ZIP import", "ZIP-Import bestätigen"],
  ["Importing ZIP...", "ZIP wird importiert ..."],
  ["ZIP import preview", "Vorschau des ZIP-Imports"],
  ["Separate tags with commas.", "Tags durch Kommas trennen."],
  ["Separate allergens with commas.", "Allergene durch Kommas trennen."],
  ["Smaller numbers appear first.", "Kleinere Zahlen erscheinen zuerst."],
  ["Add staff access", "Mitarbeiterzugriff hinzufügen"],
  ["Authorized staff", "Autorisierte Mitarbeiter"],
  ["Stamp-card progress", "Stempelkarten-Fortschritt"],
  ["Redemption history", "Einlösungsverlauf"],
  ["Scanned by", "Gescannt von"],
  ["Selected direct deal", "Ausgewählter direkter Deal"],
  ["Fallback deal", "Fallback-Deal"],
  ["Base stamps", "Basisstempel"],
  ["Bonus stamps", "Bonusstempel"],
  ["Total stamp delta", "Gesamte Stempeländerung"],
  ["Deal redemptions", "Deal-Einlösungen"],
  ["QR tokens", "QR-Token"],
  ["Discount", "Rabatt"],
  ["Savings", "Ersparnis"],
  ["User", "Benutzer"],
  ["Role", "Rolle"],
  ["User ID", "Benutzer-ID"],
  ["Cancel", "Abbrechen"],
  ["Close", "Schließen"],
  ["Edit access", "Zugriff bearbeiten"],
  ["Save", "Speichern"],
  ["Edit", "Bearbeiten"],
  ["Collapse", "Einklappen"],
  ["Advanced settings", "Erweiterte Einstellungen"],
  ["Partner PIN", "Partner-PIN"],
  ["Sign out", "Abmelden"],
  ["Signing out...", "Abmeldung ..."],
  ["Expand navigation", "Navigation ausklappen"],
  ["Collapse navigation", "Navigation einklappen"],
  ["Admin navigation", "Admin-Navigation"],
  ["Language", "Sprache"],
  ["English", "Englisch"],
  ["German", "Deutsch"],
  ["Microsite Builder", "Microsite-Builder"],
  ["Partner Microsite Builder", "Partner-Microsite-Builder"],
  ["Back to admin", "Zurück zur Administration"],
  ["Back to dashboard", "Zurück zum Dashboard"],
  ["Open live preview", "Live-Vorschau öffnen"],
  ["System overview", "Systemübersicht"],
  ["The central Benefitsi interfaces in one place", "Die zentralen Benefitsi-Oberflächen an einem Ort"],
  ["Manage system overview", "Systemübersicht verwalten"],
  ["Quickly switch between areas", "Schnell zwischen den Bereichen wechseln"],
  ["Mobile user app", "Mobile Nutzer-App"],
  ["App link coming soon", "App-Link folgt"],
  ["Drafts & live pages", "Entwürfe & Live-Seiten"],
  ["Cities, guides & local content", "Städte, Guides & lokale Inhalte"],
  ["City pages", "Städteseiten"],
  ["Public main site", "Öffentliche Hauptseite"],
  ["Public", "Öffentlich"],
  ["Linked", "Verknüpft"],
  ["Only draft", "Nur Entwurf"],
  ["Not created", "Nicht angelegt"],
  ["Open preview", "Vorschau öffnen"],
  ["Open live page", "Live-Seite öffnen"],
  ["Open the builder, review the draft, or visit the live page.", "Öffne den Builder, prüfe den Entwurf oder rufe die Live-Seite auf."],
  ["Back to partner management", "Zur Partnerverwaltung"],
  ["Supabase returned warnings", "Supabase-Warnungen"],
  ["No cities available", "Keine Städte verfügbar"],
  ["Unnamed partner", "Unbenannter Partner"],
  ["Untitled partner", "Partner ohne Titel"],
  ["Untitled menu", "Menü ohne Titel"],
  ["Untitled category", "Kategorie ohne Titel"],
  ["Untitled item", "Unbenannter Artikel"],
] as const

const englishToGerman = new Map<string, string>(translations)
const germanToEnglish = new Map<string, string>(
  translations.map(([english, german]) => [german, english]),
)

type AdminLanguageContextValue = {
  language: AdminLanguage
  setLanguage: (language: AdminLanguage) => void
  tr: (value: string) => string
}

const AdminLanguageContext = createContext<AdminLanguageContextValue | null>(null)

export function translateValue(value: string, language: AdminLanguage) {
  const leading = value.match(/^\s*/)?.[0] ?? ""
  const trailing = value.match(/\s*$/)?.[0] ?? ""
  const core = value.slice(leading.length, value.length - trailing.length)
  const dictionary = language === "de" ? englishToGerman : germanToEnglish
  const exact = dictionary.get(core)

  if (exact) return `${leading}${exact}${trailing}`

  if (core.endsWith(":")) {
    const translatedLabel = dictionary.get(core.slice(0, -1))
    if (translatedLabel) return `${leading}${translatedLabel}:${trailing}`
  }

  const duplicateLabel = core.match(/^Duplicate\s+(.+)$/i)
  if (duplicateLabel && language === "de") {
    return `${leading}Duplizieren: ${duplicateLabel[1]}${trailing}`
  }

  const menuStatus = core.match(/^Menu status:\s*(.+)$/)
  if (menuStatus) {
    const status = dictionary.get(menuStatus[1]) ?? menuStatus[1]
    return `${leading}${language === "de" ? "Menüstatus" : "Menu status"}: ${status}${trailing}`
  }

  const count = core.match(/^(\d+)\s+(item|items)$/i)
  if (count && language === "de") {
    return `${leading}${count[1]} Artikel${trailing}`
  }

  const stampReward = core.match(/^(\d+)\s+stamps?\s*-\s*(.+)$/i)
  if (stampReward && language === "de") {
    const rewardType = englishToGerman.get(stampReward[2]) ?? stampReward[2]
    return `${leading}${stampReward[1]} Stempel – ${rewardType}${trailing}`
  }

  const stampRewardPrefix = core.match(/^(\d+)\s+stamps?\s*-\s*$/i)
  if (stampRewardPrefix && language === "de") {
    return `${leading}${stampRewardPrefix[1]} Stempel –${trailing}`
  }

  if (/^stamps?\s*-\s*$/i.test(core) && language === "de") {
    return `${leading}Stempel –${trailing}`
  }

  const stampCount = core.match(/^(\d+)\s+stamps?$/i)
  if (stampCount && language === "de") {
    return `${leading}${stampCount[1]} Stempel${trailing}`
  }

  const milestoneCount = core.match(/^(\d+)\s+milestones?$/i)
  if (milestoneCount && language === "de") {
    return `${leading}${milestoneCount[1]} ${
      milestoneCount[1] === "1" ? "Prämienstufe" : "Prämienstufen"
    }${trailing}`
  }

  const dealCount = core.match(/^(\d+)\s+(deal|deals)$/i)
  if (dealCount && language === "de") {
    return `${leading}${dealCount[1]} ${dealCount[1] === "1" ? "Deal" : "Deals"}${trailing}`
  }

  const reviewCount = core.match(/^(\d+)\s+menu\s+(review|reviews)$/i)
  if (reviewCount && language === "de") {
    return `${leading}${reviewCount[1]} ${reviewCount[1] === "1" ? "Menüprüfung" : "Menüprüfungen"}${trailing}`
  }

  const characterCount = core.match(/^(\d+)\s*\/\s*(\d+)\s+characters$/i)
  if (characterCount && language === "de") {
    return `${leading}${characterCount[1]} / ${characterCount[2]} Zeichen${trailing}`
  }

  const openingTime = core.match(
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) opening time$/,
  )
  if (openingTime && language === "de") {
    return `${leading}Öffnungszeit am ${englishToGerman.get(openingTime[1])}${trailing}`
  }

  const closingTime = core.match(
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) closing time$/,
  )
  if (closingTime && language === "de") {
    return `${leading}Schließzeit am ${englishToGerman.get(closingTime[1])}${trailing}`
  }

  return value
}

export function AdminLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AdminLanguage>("en")
  const rootRef = useRef<HTMLDivElement>(null)
  const languageRef = useRef(language)
  const textOriginalsRef = useRef(new WeakMap<Text, string>())
  const attributeOriginalsRef = useRef(
    new WeakMap<Element, Map<string, string>>(),
  )

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved !== "en" && saved !== "de") return

    const timeout = window.setTimeout(() => setLanguageState(saved), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    languageRef.current = language
    window.localStorage.setItem(STORAGE_KEY, language)
    document.documentElement.lang = language

    const root = rootRef.current
    if (!root) return

    const translateTextNode = (node: Text) => {
      if (node.parentElement?.closest('[data-admin-i18n-ignore="true"]')) return

      const current = node.nodeValue ?? ""
      const originals = textOriginalsRef.current
      const stored = originals.get(node)

      if (!stored || current !== translateValue(stored, languageRef.current)) {
        originals.set(node, current)
      }

      const original = originals.get(node) ?? current
      const translated = translateValue(original, languageRef.current)
      if (current !== translated) node.nodeValue = translated
    }

    const translateElement = (element: Element) => {
      if (element.closest('[data-admin-i18n-ignore="true"]')) return

      const names = ["aria-label", "placeholder", "title"]
      let originals = attributeOriginalsRef.current.get(element)
      if (!originals) {
        originals = new Map()
        attributeOriginalsRef.current.set(element, originals)
      }

      names.forEach((name) => {
        const current = element.getAttribute(name)
        if (current === null) return
        const stored = originals?.get(name)
        if (!stored || current !== translateValue(stored, languageRef.current)) {
          originals?.set(name, current)
        }
        const original = originals?.get(name) ?? current
        const translated = translateValue(original, languageRef.current)
        if (current !== translated) element.setAttribute(name, translated)
      })
    }

    const translateTree = (target: Node) => {
      if (target instanceof Text) {
        translateTextNode(target)
        return
      }
      if (!(target instanceof Element)) return
      translateElement(target)
      const walker = document.createTreeWalker(
        target,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      )
      let node = walker.nextNode()
      while (node) {
        if (node instanceof Text) translateTextNode(node)
        else if (node instanceof Element) translateElement(node)
        node = walker.nextNode()
      }
    }

    translateTree(root)

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") translateTree(mutation.target)
        mutation.addedNodes.forEach(translateTree)
      })
    })
    observer.observe(root, { childList: true, characterData: true, subtree: true })

    return () => observer.disconnect()
  }, [language])

  const setLanguage = (nextLanguage: AdminLanguage) => {
    setLanguageState(nextLanguage)
  }

  const tr = (value: string) => translateValue(value, language)

  return (
    <AdminLanguageContext.Provider value={{ language, setLanguage, tr }}>
      <div ref={rootRef} className="admin-ui contents">
        {children}
      </div>
    </AdminLanguageContext.Provider>
  )
}

export function useAdminLanguage() {
  const context = useContext(AdminLanguageContext)
  if (!context) throw new Error("useAdminLanguage must be used inside AdminLanguageProvider")
  return context
}

export function AdminLanguageControl({ className = "" }: { className?: string }) {
  const { language, setLanguage, tr } = useAdminLanguage()

  return (
    <div
      className={`inline-flex h-10 items-center rounded-xl border border-zinc-200 bg-white p-1 shadow-sm ${className}`}
      role="group"
      aria-label={tr("Language")}
    >
      {(["en", "de"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLanguage(option)}
          aria-pressed={language === option}
          title={tr(option === "en" ? "English" : "German")}
          className={`grid h-8 min-w-9 place-items-center rounded-lg px-2 text-xs font-black tracking-[0.08em] transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#118cff] ${
            language === option
              ? "bg-[#061829] text-white shadow-sm"
              : "text-[#526170] hover:bg-zinc-100 hover:text-[#061829]"
          }`}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
