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
  ["Select a partner to edit.", "Wähle einen Partner zur Bearbeitung aus."],
  ["Add", "Hinzufügen"],
  ["Search partners", "Partner suchen"],
  ["No partners match your search.", "Keine Partner entsprechen deiner Suche."],
  ["Add partner", "Partner hinzufügen"],
  ["No partners yet", "Noch keine Partner"],
  ["Create the partner profile, assign its owner, upload media, and add any deals in one save.", "Erstelle das Partnerprofil, weise einen Inhaber zu und füge Medien sowie Deals in einem Schritt hinzu."],
  ["Add a partner to start managing deals.", "Füge einen Partner hinzu, um Deals zu verwalten."],
  ["No location or type", "Kein Standort oder Typ"],
  ["Deal recommended", "Deal empfohlen"],
  ["Inactive", "Inaktiv"],
  ["Business Control Center", "Business Control Center"],
  ["Overview", "Übersicht"],
  ["Acquisition & Marketing", "Akquisition & Marketing"],
  ["Product & Funnel", "Produkt & Funnel"],
  ["Revenue & Profit", "Umsatz & Profit"],
  ["Data quality & Definitions", "Datenqualität & Definitionen"],
  ["Growth", "Wachstum"],
  ["User journey", "Nutzerreise"],
  ["Customer value", "Kundenwert"],
  ["Finance", "Finanzen"],
  ["Network", "Netzwerk"],
  ["Trust", "Vertrauen"],
  ["The most important outcomes and guardrails for the current reporting period.", "Die wichtigsten Outcomes und Guardrails für den aktuellen Steuerungszeitraum."],
  ["Channels, campaigns, attribution, and costs through value-generating activation.", "Kanäle, Kampagnen, Attribution und Kosten bis zur wertstiftenden Aktivierung."],
  ["From signup through time-to-value and deal usage to confirmed redemption.", "Vom Signup über Time-to-Value und Deal-Nutzung bis zur bestätigten Redemption."],
  ["Returning customers, cohorts, and realized customer value; forecasts remain clearly marked as provisional.", "Wiederkehr, Kohorten und realisierter Kundenwert; Prognosen bleiben klar als provisional markiert."],
  ["Cash collections, period-adjusted revenue, contribution margin, and operating profit.", "Cash Collections, periodengerechter Umsatz, Deckungsbeitrag und Operating Profit."],
  ["Partner activity, confirmed redemptions, returning customers, and concentration risks.", "Partneraktivität, bestätigte Redemptions, Wiederkehr und Konzentrationsrisiken."],
  ["Source status, freshness, caveats, and versioned definitions behind every number.", "Quellenstatus, Aktualität, Caveats und versionierte Definitionen hinter jeder Zahl."],
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
  ["Menu details, categories, items, pricing, images, and display order.", "Menüdetails, Kategorien, Einträge, Preise, Bilder und Anzeigereihenfolge."],
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
  ["Deals", "Deals"],
  ["Menu", "Menü"],
  ["Required", "Erforderlich"],
  ["Required stamps", "Erforderliche Stempel"],
  ["Reward type", "Prämientyp"],
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
  ["Edit menu", "Menü bearbeiten"],
  ["Close editor", "Editor schließen"],
  ["Add category", "Kategorie hinzufügen"],
  ["Edit category", "Kategorie bearbeiten"],
  ["No menu categories configured yet.", "Noch keine Menükategorien konfiguriert."],
  ["Items", "Einträge"],
  ["Item", "Eintrag"],
  ["Other", "Weitere"],
  ["New item", "Neuer Eintrag"],
  ["Add item", "Eintrag hinzufügen"],
  ["Add menu item", "Menüeintrag hinzufügen"],
  ["Edit item", "Eintrag bearbeiten"],
  ["Edit menu item", "Menüeintrag bearbeiten"],
  ["Duplicate", "Duplizieren"],
  ["Duplicate item", "Eintrag duplizieren"],
  ["Duplicate menu item", "Menüeintrag duplizieren"],
  ["Review the copied details, then create the new item.", "Kopierte Angaben prüfen und anschließend den neuen Eintrag erstellen."],
  ["Keep the menu focused by editing one item at a time.", "Für eine übersichtliche Bearbeitung jeweils nur einen Eintrag öffnen."],
  ["Delete", "Löschen"],
  ["Popular", "Beliebt"],
  ["No category", "Keine Kategorie"],
  ["No description", "Keine Beschreibung"],
  ["No menu items configured yet.", "Noch keine Menüeinträge konfiguriert."],
  ["No items in this category yet.", "Noch keine Einträge in dieser Kategorie."],
  ["Menu item categories", "Menüeintragskategorien"],
  ["Item name", "Name des Eintrags"],
  ["Category", "Kategorie"],
  ["Price", "Preis"],
  ["Currency", "Währung"],
  ["Position in category", "Position in der Kategorie"],
  ["Position in menu", "Position im Menü"],
  ["Tags", "Tags"],
  ["Allergens", "Allergene"],
  ["Menu item picture", "Bild des Menüeintrags"],
  ["Menu category picture", "Bild der Menükategorie"],
  ["Add menu category", "Menükategorie hinzufügen"],
  ["Edit menu category", "Menükategorie bearbeiten"],
  ["Save item", "Eintrag speichern"],
  ["Saving item...", "Eintrag wird gespeichert ..."],
  ["Adding item...", "Eintrag wird hinzugefügt ..."],
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
  ["Untitled item", "Eintrag ohne Titel"],
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

function translateValue(value: string, language: AdminLanguage) {
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
    return `${leading}${count[1]} ${count[1] === "1" ? "Eintrag" : "Einträge"}${trailing}`
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
