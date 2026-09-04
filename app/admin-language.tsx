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
  ["Generate with Ben", "Mit Ben generieren"],
  ["Generating...", "Wird mit Ben erstellt …"],
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
  ["deal", "Deal"],
  ["deals", "Deals"],
  ["item", "Artikel"],
  ["items", "Artikel"],
  ["characters", "Zeichen"],
  ["awaiting approval", "zur Freigabe ausstehend"],
  ["more", "weitere"],
  ["Select...", "Bitte auswählen ..."],
  ["Inactive", "Inaktiv"],
  ["Business Control Center", "Unternehmenssteuerung"],
  ["Business, product, marketing, and profit in one verified view", "Unternehmen, Produkt, Marketing und Gewinn in einer geprüften Ansicht"],
  ["Supabase configuration required", "Supabase-Konfiguration erforderlich"],
  ["The Business Control Center cannot load data until the URL and publishable key are configured for this environment.", "Das Business Control Center kann keine Daten laden, bis URL und veröffentlichbarer Schlüssel für diese Umgebung konfiguriert sind."],
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
  ["Business Health", "Unternehmenszustand"],
  ["Retention & CLV", "Kundenbindung & CLV"],
  ["Engagement & NES", "Engagement & NES"],
  ["Customer retention", "Kundenbindung"],
  ["Versioned user engagement score in shadow mode, lifecycle distribution, partner affinity, and city activity — without automated outreach.", "Versionierter Nutzer-Engagement-Score im Shadow Mode, Lifecycle-Verteilung, Partner-Affinität und Stadtaktivität – ohne automatische Ansprache."],
  ["Scored users", "Bewertete Nutzer"],
  ["Average NES", "Durchschnittlicher NES"],
  ["Loyal & regular", "Loyal & regelmäßig"],
  ["At risk & inactive", "Risiko & inaktiv"],
  ["NES trend", "NES-Entwicklung"],
  ["Engagement distribution", "Engagement-Verteilung"],
  ["Partner affinity", "Partner-Affinität"],
  ["City activity", "Stadtaktivität"],
  ["New", "Neu"],
  ["Loyal", "Loyal"],
  ["Regular", "Regelmäßig"],
  ["At risk", "Abwanderungsrisiko"],
  ["Scored users in the current NES shadow snapshot and applied partner/city filter.", "Nutzer im aktuellen NES-Shadow-Snapshot und angewendeten Partner-/Stadtfilter."],
  ["Average of the versioned global engagement score from 0 to 100.", "Durchschnitt des versionierten globalen Engagement-Scores von 0 bis 100."],
  ["Share of users in the loyal or regular shadow segments.", "Anteil der Nutzer in den Shadow-Segmenten loyal oder regelmäßig."],
  ["Share of users in the at-risk or inactive shadow segments.", "Anteil der Nutzer in den Shadow-Segmenten Abwanderungsrisiko oder inaktiv."],
  ["Daily shadow-mode average; the series grows without invented backfill.", "Täglicher Durchschnitt im Shadow Mode; die Reihe wächst ohne erfundenen Backfill."],
  ["Lifecycle segments of the current versioned shadow snapshot.", "Lifecycle-Segmente des aktuellen versionierten Shadow-Snapshots."],
  ["Confirmed usage events in the selected period by partner city.", "Bestätigte Nutzungsereignisse im gewählten Zeitraum nach Partnerstadt."],
  ["Active users", "Aktive Nutzer"],
  ["Users", "Nutzer"],
  ["Share", "Anteil"],
  ["Visits", "Besuche"],
  ["Active partners", "Aktive Partner"],
  ["Cohort", "Kohorte"],
  ["Average affinity", "Ø Affinität"],
  ["Strong", "Stark"],
  ["NES V1 runs exclusively in shadow mode and does not trigger communication or entitlements.", "NES V1 läuft ausschließlich im Shadow Mode und löst keine Kommunikation oder Berechtigung aus."],
  ["The small data set is not yet sufficient for validated score calibration.", "Der kleine Datenbestand reicht noch nicht für eine validierte Score-Kalibrierung."],
  ["Only aggregated partner cohorts with at least 10 users; no person-level lists.", "Nur aggregierte Partnerkohorten mit mindestens 10 Nutzern; keine Personenlisten."],
  ["Partner affinity is only displayed in aggregate for 10 or more users per partner.", "Partner-Affinität wird erst ab 10 Nutzern pro Partner aggregiert ausgegeben."],
  ["Verified", "Geprüft"],
  ["Estimated", "Geschätzt"],
  ["Provisional", "Vorläufig"],
  ["Partial", "Teilweise"],
  ["Unverified", "Ungeprüft"],
  ["Missing", "Fehlt"],
  ["Fresh", "Aktuell"],
  ["Stale", "Veraltet"],
  ["stale", "veraltet"],
  ["The most important outcomes and guardrails for the current reporting period.", "Die wichtigsten Ergebnisse und Leitplanken für den aktuellen Berichtszeitraum."],
  ["Channels, campaigns, attribution, and costs through value-generating activation.", "Kanäle, Kampagnen, Attribution und Kosten bis zur wertstiftenden Aktivierung."],
  ["From signup through time-to-value and deal usage to confirmed redemption.", "Von der Registrierung über die Zeit bis zum ersten Nutzen und die Deal-Nutzung bis zur bestätigten Einlösung."],
  ["Returning customers, cohorts, and realized customer value; forecasts remain clearly marked as provisional.", "Wiederkehrende Kunden, Kohorten und realisierter Kundenwert; vorläufige Prognosen bleiben klar gekennzeichnet."],
  ["Cash collections, period-adjusted revenue, contribution margin, and operating profit.", "Zahlungseingänge, periodengerechter Umsatz, Deckungsbeitrag und Betriebsergebnis."],
  ["Partner activity, confirmed redemptions, returning customers, and concentration risks.", "Partneraktivität, bestätigte Einlösungen, wiederkehrende Kunden und Konzentrationsrisiken."],
  ["Source status, freshness, caveats, and versioned definitions behind every number.", "Quellenstatus, Aktualität, Einschränkungen und versionierte Definitionen hinter jeder Kennzahl."],
  ["Filter business analytics", "Unternehmensanalyse filtern"],
  ["From", "Von"],
  ["To", "Bis"],
  ["City", "Stadt"],
  ["Channel", "Kanal"],
  ["Environment", "Umgebung"],
  ["All cities", "Alle Städte"],
  ["All partners", "Alle Partner"],
  ["All channels", "Alle Kanäle"],
  ["Direct", "Direkt"],
  ["Organic Search", "Organische Suche"],
  ["Organic Social", "Organische soziale Medien"],
  ["Paid Search", "Bezahlte Suche"],
  ["Paid Social", "Bezahlte soziale Medien"],
  ["Referral", "Verweis"],
  ["Unattributed", "Nicht zugeordnet"],
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
  ["Business Control Center sections", "Bereiche der Unternehmenssteuerung"],
  ["Missing metrics are shown as “Not measurable yet” and never as an artificial zero.", "Fehlende Kennzahlen erscheinen als „Noch nicht messbar“ und niemals als künstliche Null."],
  ["Not measurable yet", "Noch nicht messbar"],
  ["No verified aggregates are available for this filter yet.", "Für diesen Filter liegen noch keine geprüften Aggregate vor."],
  ["Interpretation notes", "Hinweise zur Interpretation"],
  ["Source freshness", "Quellenaktualität"],
  ["Expected freshness: operations within 5 minutes, cockpit hourly, ads and CLV daily.", "Erwartete Aktualität: operative Daten innerhalb von 5 Minuten, das Cockpit stündlich sowie Werbedaten und CLV täglich."],
  ["Metric registry", "Kennzahlenkatalog"],
  ["Metric Registry", "Kennzahlenkatalog"],
  ["Source Freshness", "Quellenaktualität"],
  ["30d Value-Active Users", "30-Tage-Nutzer mit Wertaktivität"],
  ["D30 Repeat Rate", "D30-Wiederkehrrate"],
  ["Contribution Margin II", "Deckungsbeitrag II"],
  ["Paywall to Paid", "Paywall-zu-Abo-Rate"],
  ["Blended CAC", "Gesamt-CAC"],
  ["Cost per Activated User", "Kosten pro aktiviertem Nutzer"],
  ["CAC Payback", "CAC-Amortisation"],
  ["Signup to First Visit", "Registrierung bis zum ersten Besuch"],
  ["Time to Value", "Zeit bis zum ersten Nutzen"],
  ["Redemptions", "Einlösungen"],
  ["Failed Redemption Rate", "Fehlerrate bei Einlösungen"],
  ["Trial to Paid", "Testphase-zu-Abo-Rate"],
  ["Paid Churn", "Kündigungsrate zahlender Nutzer"],
  ["Realized LTV", "Realisierter LTV"],
  ["Predictive CLV", "Prognostizierter CLV"],
  ["Cash Collections", "Zahlungseingänge"],
  ["Recognized Revenue", "Periodengerechter Umsatz"],
  ["Operating Profit", "Betriebsergebnis"],
  ["Refund / Chargeback Rate", "Erstattungs-/Rückbuchungsrate"],
  ["Active Partners", "Aktive Partner"],
  ["Partner Concentration", "Partnerkonzentration"],
  ["QR Tokens Generated (Diagnostic)", "Generierte QR-Token (Diagnose)"],
  ["Distinct production users with at least one server-confirmed visit or non-reversed redemption in the trailing 30 days.", "Eindeutige Produktionsnutzer mit mindestens einem serverseitig bestätigten Besuch oder einer nicht rückgängig gemachten Einlösung in den letzten 30 Tagen."],
  ["Share of fully observed first-visit cohorts with another confirmed visit within 30 days.", "Anteil vollständig beobachteter Erstbesuchs-Kohorten mit einem weiteren bestätigten Besuch innerhalb von 30 Tagen."],
  ["Recognized net revenue minus refunds and chargebacks, payment fees, partner commissions, variable costs and paid marketing.", "Periodengerechter Nettoumsatz abzüglich Erstattungen und Rückbuchungen, Zahlungsgebühren, Partnerprovisionen, variabler Kosten und bezahlten Marketings."],
  ["Share of users viewing the paywall who later receive a verified paid subscription event.", "Anteil der Nutzer mit Paywall-Aufruf, die später ein bestätigtes Ereignis für ein bezahltes Abonnement erhalten."],
  ["Paid marketing cost divided by verified new paying customers.", "Kosten für bezahltes Marketing geteilt durch bestätigte neue zahlende Kunden."],
  ["Paid marketing cost divided by users reaching a confirmed first value event.", "Kosten für bezahltes Marketing geteilt durch Nutzer, die ihr erstes bestätigtes Wertereignis erreichen."],
  ["Attributed recognized net revenue divided by paid media spend.", "Zugeordneter periodengerechter Nettoumsatz geteilt durch die Ausgaben für bezahlte Medien."],
  ["Customer lifetime contribution value divided by acquisition cost.", "Deckungsbeitrag über die Kundenlebensdauer geteilt durch die Akquisitionskosten."],
  ["Months required for cumulative contribution margin to recover CAC.", "Benötigte Monate, bis der kumulierte Deckungsbeitrag die Kundenakquisitionskosten ausgleicht."],
  ["Share of registered users reaching a server-confirmed first visit in the selected window.", "Anteil registrierter Nutzer mit einem serverseitig bestätigten Erstbesuch im ausgewählten Zeitraum."],
  ["Median hours from registration to first confirmed visit or redemption.", "Median der Stunden von der Registrierung bis zum ersten bestätigten Besuch oder zur ersten Einlösung."],
  ["Count of server-confirmed, non-reversed redemptions.", "Anzahl serverseitig bestätigter, nicht rückgängig gemachter Einlösungen."],
  ["Share of server redemption attempts rejected or failed.", "Anteil der serverseitigen Einlösungsversuche, die abgelehnt wurden oder fehlgeschlagen sind."],
  ["Share of trial users converting to a verified paid subscription.", "Anteil der Testnutzer, die in ein bestätigtes bezahltes Abonnement wechseln."],
  ["Share of paying subscriptions lost during the period.", "Anteil der im Zeitraum verlorenen zahlenden Abonnements."],
  ["Recognized net revenue per paying customer.", "Periodengerechter Nettoumsatz pro zahlendem Kunden."],
  ["Cumulative realized contribution per customer to date.", "Bis heute kumulierter realisierter Deckungsbeitrag pro Kunde."],
  ["Modeled future contribution value. It remains provisional until the minimum data threshold is reached.", "Modellierter zukünftiger Deckungsbeitrag. Er bleibt vorläufig, bis die Mindestdatenmenge erreicht ist."],
  ["Verified cash collected in the selected period, shown separately from recognized revenue.", "Bestätigte Zahlungseingänge im ausgewählten Zeitraum, getrennt vom periodengerechten Umsatz dargestellt."],
  ["Net revenue recognized across each invoice service period, excluding actual tax.", "Über den jeweiligen Leistungszeitraum der Rechnung periodengerecht erfasster Nettoumsatz ohne tatsächliche Steuern."],
  ["Monthly recurring revenue from verified active subscriptions, annual plans normalized to a month.", "Monatlich wiederkehrender Umsatz aus bestätigten aktiven Abonnements; Jahrespläne werden auf einen Monat normiert."],
  ["Annualized recurring revenue based on verified MRR.", "Auf Grundlage des bestätigten MRR hochgerechneter jährlicher wiederkehrender Umsatz."],
  ["Contribution Margin II minus periodized fixed operating costs.", "Deckungsbeitrag II abzüglich periodisierter fixer Betriebskosten."],
  ["Refunded and disputed value divided by collected value.", "Erstatteter und beanstandeter Betrag geteilt durch die Zahlungseingänge."],
  ["Partners with at least one confirmed visit or redemption in the selected period.", "Partner mit mindestens einem bestätigten Besuch oder einer Einlösung im ausgewählten Zeitraum."],
  ["Share of confirmed value events generated by the five largest partners.", "Anteil der bestätigten Wertereignisse, die von den fünf größten Partnern erzeugt wurden."],
  ["Age of the stalest required source for the current section.", "Alter der am längsten nicht aktualisierten erforderlichen Quelle des aktuellen Bereichs."],
  ["Diagnostic count only. This is never treated as usage or conversion.", "Reine Diagnoseanzahl. Sie wird niemals als Nutzung oder Conversion gewertet."],
  ["Binding, versioned definitions for cards, charts, and exports.", "Verbindliche, versionierte Definitionen für Karten, Diagramme und Exporte."],
  ["Metric", "Kennzahl"],
  ["Formula", "Formel"],
  ["Grain / source", "Granularität / Quelle"],
  ["Granularity / source", "Granularität / Quelle"],
  ["Owner / SLA", "Verantwortlich / SLA"],
  ["Version", "Version"],
  ["Target", "Ziel"],
  ["Current period", "Aktueller Zeitraum"],
  ["Comparison period", "Vergleichszeitraum"],
  ["Date", "Datum"],
  ["Current", "Aktuell"],
  ["Comparison", "Vergleich"],
  ["Data unavailable", "Datenquelle nicht erreichbar"],
  ["Analytics are temporarily unavailable", "Analytics sind vorübergehend nicht verfügbar"],
  ["The verified aggregates could not be loaded. No cached or estimated figures are presented as current.", "Die geprüften Aggregate konnten nicht geladen werden. Es werden keine zwischengespeicherten oder geschätzten Zahlen als aktuell ausgegeben."],
  ["Check the Supabase connection and RPC status, then reload.", "Prüfe die Supabase-Verbindung und den RPC-Status und lade die Seite anschließend neu."],
  ["Protected access", "Zugriff geschützt"],
  ["No analytics permission", "Keine Analytics-Berechtigung"],
  ["Your account is signed in as an admin but does not have the separate business_analytics:read permission. Admin status alone does not unlock business or financial data.", "Dein Konto ist als Admin angemeldet, besitzt aber nicht die separate Berechtigung business_analytics:read. Der Admin-Status allein schaltet keine Unternehmens- oder Finanzdaten frei."],
  ["Ask an authorized administrator to assign the permission.", "Lass die Berechtigung von einem autorisierten Administrator zuweisen."],
  ["Setup pending", "Einrichtung ausstehend"],
  ["Business Control Center is ready", "Die Unternehmenssteuerung ist vorbereitet"],
  ["The analytics RPCs or permission tables are not available in this environment yet. No substitute values are shown until the canonical Supabase migration has been applied.", "Die Analytics-RPCs oder Berechtigungstabellen sind in dieser Umgebung noch nicht verfügbar. Bis die kanonische Supabase-Migration angewendet wurde, werden bewusst keine Ersatzwerte angezeigt."],
  ["Apply the migration with get_my_analytics_permissions_v1 and get_business_analytics_v1.", "Wende die Migration mit get_my_analytics_permissions_v1 und get_business_analytics_v1 an."],
  ["Partner Profile", "Partnerprofil"],
  ["Hours & Rewards", "Zeiten & Prämien"],
  ["Deals & Offers", "Stempel & Deals"],
  ["Stamps & Deals", "Stempel & Deals"],
  ["Stamps and Deals", "Stempel & Deals"],
  ["Menu Management", "Menüverwaltung"],
  ["Staff Access", "Mitarbeiterzugriff"],
  ["Customer Activity", "Kundenaktivität"],
  ["Delete Partner", "Partner löschen"],
  ["Partner settings", "Partnereinstellungen"],
  ["Microsite builder", "Microsite-Builder"],
  ["Partner profile", "Partnerprofil"],
  ["Business information, opening hours, contact details, location, branding, and media.", "Unternehmensdaten, Öffnungszeiten, Kontaktdaten, Standort, Marke und Medien."],
  ["Hours and loyalty rewards", "Öffnungszeiten und Treueprämien"],
  ["Edit partner details, social handles, media, milestones, deals, menu, hours, and Supabase routing fields.", "Bearbeite Partnerdaten, Social-Media-Profile, Medien, Prämienstufen, Deals, Menü, Öffnungszeiten und die Supabase-Zuordnung."],
  ["Deals and offers", "Deals und Angebote"],
  ["Stamp-card rewards, customer offers, eligibility rules, availability, and redemption settings.", "Stempelkarten-Prämien, Kundendeals, Teilnahmebedingungen, Verfügbarkeit und Einlöseeinstellungen."],
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
  ["Enter the partner's identity, ownership, contact details, and location.", "Erfasse Identität, Inhaber, Kontaktdaten und Standort des Partners."],
  ["Configure opening hours, holiday closures, branding, and cover images.", "Lege Öffnungszeiten, Feiertagsschließungen, Branding und Titelbilder fest."],
  ["Set up stamp-card milestones and optional customer deals.", "Richte Stempelkarten-Prämien und optionale Kundendeals ein."],
  ["Create the initial menu, categories, items, prices, and images.", "Erstelle das erste Menü mit Kategorien, Artikeln, Preisen und Bildern."],
  ["Review required sections, then create the partner and all staged content.", "Prüfe alle Pflichtbereiche und erstelle anschließend den Partner samt vorbereiteten Inhalten."],
  ["Please complete all required partner fields before saving.", "Bitte fülle vor dem Speichern alle Pflichtfelder des Partners aus."],
  ["Please select at least one category in Business Profile before creating the partner.", "Bitte wähle vor dem Erstellen des Partners unter „Unternehmensprofil“ mindestens eine Kategorie aus."],
  ["Add partner steps", "Schritte zum Hinzufügen eines Partners"],
  ["Adding partner...", "Partner wird hinzugefügt ..."],
  ["Save partner", "Partner speichern"],
  ["Saving partner...", "Partner wird gespeichert ..."],
  ["Save partner changes?", "Partneränderungen speichern?"],
  ["Save changes", "Änderungen speichern"],
  ["Profile", "Profil"],
  ["Contact and Location", "Kontakt und Standort"],
  ["Contact, Location and Socials", "Kontakt, Standort & Socials"],
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
  ["Manage stamp-card rewards alongside customer deals.", "Verwalte Stempelkarten-Prämien gemeinsam mit Kundendeals."],
  ["Deals", "Deals"],
  ["Add deal", "Deal hinzufügen"],
  ["Save deal", "Deal speichern"],
  ["Adding deal...", "Deal wird hinzugefügt ..."],
  ["Saving deal...", "Deal wird gespeichert ..."],
  ["Deleting deal...", "Deal wird gelöscht ..."],
  ["Deal type", "Deal-Typ"],
  ["Reward/effect type", "Prämien-/Effekttyp"],
  ["Basics", "Grundlagen"],
  ["Setup", "Einrichtung"],
  ["Auto-set", "Automatisch gesetzt"],
  ["Discount percentage", "Rabatt in Prozent"],
  ["Discount amount", "Rabattbetrag"],
  ["Customer and staff copy", "Texte für Kunden und Mitarbeiter"],
  ["Optional advanced configuration for developers and experimental features.", "Optionale erweiterte Einstellungen für Entwickler und experimentelle Funktionen."],
  ["Valid from", "Gültig ab"],
  ["Valid until", "Gültig bis"],
  ["Valid weekdays", "Gültige Wochentage"],
  ["Max redemptions global", "Maximale Einlösungen insgesamt"],
  ["Max redemptions per user", "Maximale Einlösungen pro Nutzer"],
  ["Cooldown hours", "Wartezeit in Stunden"],
  ["Minimum spend", "Mindestbestellwert"],
  ["Max discount amount", "Maximaler Rabattbetrag"],
  ["Timezone", "Zeitzone"],
  ["Maximum total times this deal can be redeemed by all users.", "Maximale Anzahl der Einlösungen dieses Deals durch alle Nutzer."],
  ["Maximum times each user can redeem this deal.", "Maximale Anzahl der Einlösungen pro Nutzer."],
  ["Minimum time before the same user can use this deal again.", "Mindestwartezeit, bevor derselbe Nutzer den Deal erneut verwenden kann."],
  ["Minimum order value required to use this deal.", "Erforderlicher Mindestbestellwert für diesen Deal."],
  ["Maximum discount cap for percentage discounts.", "Maximaler Rabattbetrag bei prozentualen Rabatten."],
  ["Timezone used for time-based deals like Happy Hour.", "Zeitzone für zeitabhängige Deals wie Happy Hour."],
  ["Date/time range when this deal can be used.", "Zeitraum, in dem dieser Deal verwendet werden kann."],
  ["Selectable discount: A normal discount deal that the user selects before visiting. This can be a percentage or fixed currency amount. It does not stack with other direct deals.", "Auswählbarer Rabatt: Ein regulärer Rabatt, den der Nutzer vor dem Besuch auswählt. Er kann prozentual oder als fester Betrag gelten und ist nicht mit anderen direkten Deals kombinierbar."],
  ["A normal discount deal that the user selects before visiting. This can be a percentage or fixed currency amount. It does not stack with other direct deals.", "Ein regulärer Rabatt, den der Nutzer vor dem Besuch auswählt. Er kann prozentual oder als fester Betrag gelten und ist nicht mit anderen direkten Deals kombinierbar."],
  ["Example: 10% off or €5 off.", "Beispiel: 10 % oder 5 € Rabatt."],
  ["Display this as Selectable discount, not just Discount.", "Als „Auswählbarer Rabatt“ anzeigen, nicht nur als „Rabatt“."],
  ["Enter a percentage between 1 and 100.", "Gib einen Prozentwert zwischen 1 und 100 ein."],
  ["Example: 10 = 10% off.", "Beispiel: 10 entspricht 10 % Rabatt."],
  ["Menu", "Menü"],
  ["Required", "Erforderlich"],
  ["Required stamps", "Erforderliche Stempel"],
  ["Reward type", "Prämientyp"],
  ["Item", "Artikel"],
  ["Doner", "Döner"],
  ["Doner kebab", "Döner"],
  ["Burgers", "Burger"],
  ["Chinese", "Chinesisch"],
  ["Snack bar", "Imbiss"],
  ["Butcher shop", "Metzgerei"],
  ["Soups", "Suppen"],
  ["Café", "Café"],
  ["Bowls", "Bowls"],
  ["Asian", "Asiatisch"],
  ["Ice cream", "Eis"],
  ["Indian", "Indisch"],
  ["Greek", "Griechisch"],
  ["Fixed amount", "Fester Betrag"],
  ["Percent", "Prozent"],
  ["Bonus stamp", "Bonusstempel"],
  ["Bonus stamp count", "Anzahl der Bonusstempel"],
  ["Discount value", "Rabattwert"],
  ["Welcome reward", "Willkommensprämie"],
  ["Time-based bonus", "Zeitbonus"],
  ["Happy Hour deal", "Happy-Hour-Deal"],
  ["Permanent fallback discount", "Automatischer Basisrabatt"],
  ["Limited deal drop", "Limitierter Deal Drop"],
  ["Birthday reward", "Geburtstagsprämie"],
  ["Free item deal", "Deal mit Gratisartikel"],
  ["Selectable discount", "Auswählbarer Rabatt"],
  ["Automatic bonus stamp", "Automatischer Bonusstempel"],
  ["Streak reward", "Streak-Prämie"],
  ["Challenge reward", "Challenge-Prämie"],
  ["Comeback Deal", "Comeback-Deal"],
  ["No direct reward", "Keine direkte Prämie"],
  ["Fixed € discount", "Fester Euro-Rabatt"],
  ["Percentage discount", "Prozentualer Rabatt"],
  ["percentage off", "prozentualer Rabatt"],
  ["fixed € off", "fester Euro-Rabatt"],
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
  ["Free reward item", "Gratis-Prämienartikel"],
  ["Free dessert", "Gratisdessert"],
  ["Reward preview", "Prämienvorschau"],
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
  ["Partner name is required before asking Ben.", "Der Partnername ist erforderlich, bevor du Ben fragst."],
  ["Ben could not create a draft right now. Please try again later.", "Ben konnte gerade keinen Entwurf erstellen. Bitte versuche es später erneut."],
  ["Ben could not be reached right now. Please check the Hermes/M1 bridge.", "Ben konnte gerade nicht erreicht werden. Bitte prüfe die Hermes/M1-Bridge."],
  ["Ben is unavailable: The Hermes/M1 bridge is not configured.", "Ben ist nicht erreichbar: Die Hermes/M1-Bridge ist nicht konfiguriert."],
  ["Ben is unavailable: The Hermes bridge URL is invalid.", "Ben ist nicht erreichbar: Die Hermes-Bridge-URL ist ungültig."],
  ["Ben is unavailable: The Hermes bridge must use HTTPS.", "Ben ist nicht erreichbar: Die Hermes-Bridge muss HTTPS verwenden."],
  ["Ben has inserted a draft. Please review it before saving.", "Ben hat einen Entwurf eingesetzt. Bitte prüfe ihn vor dem Speichern."],
  ["Partner was not found while saving. Reload the partner and try again.", "Der Partner wurde beim Speichern nicht gefunden. Lade ihn neu und versuche es erneut."],
  ["Partner could not be created because no database row was returned.", "Der Partner konnte nicht angelegt werden, weil kein Datenbankeintrag zurückgegeben wurde."],
  ["Categories", "Kategorien"],
  ["Phone", "Telefon"],
  ["Website", "Webseite"],
  ["Coordinates", "Koordinaten"],
  ["Copy the latitude and longitude from Google Maps and paste them here.", "Kopiere Breiten- und Längengrad aus Google Maps und füge sie hier ein."],
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
  ["Optional. Add up to 5 social profiles. Enter a handle or full profile URL and the partner record will store the canonical link automatically.", "Optional. Füge bis zu fünf Social-Media-Profile hinzu. Gib einen Nutzernamen oder die vollständige Profil-URL ein; der Partnerdatensatz speichert automatisch den einheitlichen Link."],
  ["Platform", "Plattform"],
  ["YouTube", "YouTube"],
  ["Handle or profile URL", "Nutzername oder Profil-URL"],
  ["Add social handle", "Social-Media-Profil hinzufügen"],
  ["Rotate partner PIN", "Partner-PIN rotieren"],
  ["Rotating partner PIN...", "Partner-PIN wird rotiert ..."],
  ["Rotate partner PIN?", "Partner-PIN rotieren?"],
  ["Rotate PIN", "PIN rotieren"],
  ["Admin password", "Admin-Passwort"],
  ["Enter your admin password to continue.", "Gib dein Admin-Passwort ein, um fortzufahren."],
  ["Admin password is required to delete a partner.", "Zum Löschen eines Partners ist das Admin-Passwort erforderlich."],
  ["Admin password verification failed.", "Die Prüfung des Admin-Passworts ist fehlgeschlagen."],
  ["Logo size: 380px × 380px · Max 10 MB", "Logogröße: 380 × 380 px · max. 10 MB"],
  ["Feature size: 720px × 470px · Max 10 MB", "Feature-Größe: 720 × 470 px · max. 10 MB"],
  ["Discover size: 440px × 500px · Max 10 MB", "Entdecken-Größe: 440 × 500 px · max. 10 MB"],
  ["Drag previews to rearrange", "Vorschauen ziehen, um die Reihenfolge zu ändern"],
  ["Cover size: 1200px × 1200px. Images are resized automatically before upload. Max 5 cover photos, 10 MB each.", "Titelbildgröße: 1200 × 1200 px. Bilder werden vor dem Upload automatisch skaliert. Maximal fünf Titelbilder mit je 10 MB."],
  ["Open", "Öffnen"],
  ["Close", "Schließen"],
  ["Closed", "Geschlossen"],
  ["Apply to all open days", "Auf alle geöffneten Tage anwenden"],
  ["Applied", "Angewendet"],
  ["Toggle closed days, adjust times, then save the weekly schedule once.", "Markiere Ruhetage, passe die Zeiten an und speichere anschließend den Wochenplan."],
  ["Holiday closures", "Feiertagsschließungen"],
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
  ["Menu details", "Menüdetails"],
  ["Update the menu name, description, or approval status here.", "Aktualisiere hier den Menünamen, die Beschreibung oder den Freigabestatus."],
  ["Menu approval status", "Freigabestatus des Menüs"],
  ["Menu description", "Menübeschreibung"],
  ["Status", "Status"],
  ["Draft", "Entwurf"],
  ["Needs review", "Prüfung erforderlich"],
  ["Published", "Veröffentlicht"],
  ["Archived", "Archiviert"],
  ["Menu status", "Menüstatus"],
  ["Review queue", "Prüfwarteschlange"],
  ["Review submitted partner menus before publishing", "Eingereichte Partnermenüs vor der Veröffentlichung prüfen"],
  ["Preview every submitted menu here. Open its partner menu management page if changes are needed before approval.", "Prüfe hier jedes eingereichte Menü. Öffne bei Änderungsbedarf vor der Freigabe die Menüverwaltung des Partners."],
  ["All menus are reviewed", "Alle Menüs sind geprüft"],
  ["New submissions will appear here when their status is set to Needs review.", "Neue Einreichungen erscheinen hier, sobald ihr Status auf „Prüfung erforderlich“ gesetzt wird."],
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
  ["Give selected users scanner or administrative access.", "Erteile ausgewählten Nutzern Scan- oder Administratorzugriff."],
  ["Partner staff and scanners", "Partnermitarbeiter und Scanner"],
  ["Authorize partner users as scanners or admins for this partner.", "Autorisiere Partnernutzer für diesen Partner als Scanner oder Administratoren."],
  ["Save staff access", "Mitarbeiterzugriff speichern"],
  ["Search user", "Nutzer suchen"],
  ["Stamp-card progress", "Stempelkarten-Fortschritt"],
  ["Current card", "Aktuelle Stempelkarte"],
  ["Completed", "Abgeschlossen"],
  ["completed", "abgeschlossen"],
  ["Lifetime", "Gesamt"],
  ["Redemption history", "Einlösungsverlauf"],
  ["Applied benefits", "Angewendete Vorteile"],
  ["Base stamp", "Basisstempel"],
  ["Selectable deal", "Auswählbarer Deal"],
  ["Automatic benefit", "Automatischer Vorteil"],
  ["Fallback benefit", "Fallback-Vorteil"],
  ["Selected direct deal source", "Ausgewählter direkter Deal"],
  ["Reward milestone", "Prämienstufe"],
  ["Stamp delta", "Stempeländerung"],
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
  ["User", "Nutzer"],
  ["Role", "Rolle"],
  ["User ID", "Nutzer-ID"],
  ["Cancel", "Abbrechen"],
  ["Close", "Schließen"],
  ["Edit access", "Zugriff bearbeiten"],
  ["Save", "Speichern"],
  ["Edit", "Bearbeiten"],
  ["Collapse", "Einklappen"],
  ["Advanced settings", "Erweiterte Einstellungen"],
  ["Partner PIN", "Partner-PIN"],
  ["Generated automatically on creation", "Wird beim Erstellen automatisch erzeugt"],
  ["Automatically generated from the permanent partner record and kept read-only.", "Wird automatisch aus dem dauerhaften Partnerdatensatz erzeugt und kann nicht bearbeitet werden."],
  ["Auto-generated when the partner is created and kept read-only here.", "Wird beim Erstellen des Partners automatisch erzeugt und kann hier nicht bearbeitet werden."],
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
  ["Open Benefitsi systems", "Benefitsi-Systeme öffnen"],
  ["Benefitsi systems", "Benefitsi-Systeme"],
  ["Manage system overview", "Systemübersicht verwalten"],
  ["Quickly switch between areas", "Schnell zwischen den Bereichen wechseln"],
  ["Mobile user app", "Mobile Nutzer-App"],
  ["Mobile user app for deals, stamps, rewards, and challenges.", "Mobile Nutzer-App für Deals, Stempel, Prämien und Challenges."],
  ["App link coming soon", "App-Link folgt"],
  ["Drafts & live pages", "Entwürfe & Live-Seiten"],
  ["Builder, drafts & live pages", "Builder, Entwürfe & Live-Seiten"],
  ["Builder, drafts, previews, and published partner pages.", "Builder, Entwürfe, Vorschauen und veröffentlichte Partnerseiten."],
  ["Builder, drafts, and published partner pages", "Builder, Entwürfe und veröffentlichte Partnerseiten"],
  ["Cities, guides & local content", "Städte, Guides & lokale Inhalte"],
  ["City pages", "Städteseiten"],
  ["Cities, local guides, categories, and regional content.", "Städte, lokale Guides, Kategorien und regionale Inhalte."],
  ["Public main site", "Öffentliche Hauptseite"],
  ["Public main site and partner acquisition.", "Öffentliche Hauptseite und Partnergewinnung."],
  ["Benefitsi website", "Benefitsi-Webseite"],
  ["Public", "Öffentlich"],
  ["Linked", "Verknüpft"],
  ["Only draft", "Nur Entwurf"],
  ["Not created", "Nicht angelegt"],
  ["Open preview", "Vorschau öffnen"],
  ["Open live page", "Live-Seite öffnen"],
  ["Open the builder, review the draft, or visit the live page.", "Öffne den Builder, prüfe den Entwurf oder rufe die Live-Seite auf."],
  ["Partner microsites", "Partner-Microsites"],
  ["Preview", "Vorschau"],
  ["Live page", "Live-Seite"],
  ["System ownership", "Systemzuständigkeit"],
  ["Mobile app, user account, deals, stamps, rewards, and scanning.", "Mobile App, Nutzerkonto, Deals, Stempel, Prämien und Scanning."],
  ["Partner data, builder, draft, preview, publishing, and partner portal.", "Partnerdaten, Builder, Entwurf, Vorschau, Veröffentlichung und Partnerportal."],
  ["Main website, partner acquisition, city pages, and SEO pages.", "Hauptwebseite, Partnergewinnung, Städte- und SEO-Seiten."],
  ["Back to partner management", "Zur Partnerverwaltung"],
  ["Supabase returned warnings", "Supabase-Warnungen"],
  ["No cities available", "Keine Städte verfügbar"],
  ["Unnamed partner", "Unbenannter Partner"],
  ["Untitled partner", "Partner ohne Titel"],
  ["Untitled menu", "Menü ohne Titel"],
  ["Untitled category", "Kategorie ohne Titel"],
  ["Untitled item", "Unbenannter Artikel"],
  ["The current account is not an admin.", "Das aktuelle Konto besitzt keine Administratorrechte."],
  ["The current account is not linked to a partner shop.", "Das aktuelle Konto ist keinem Partnerbetrieb zugeordnet."],
  ["Enter your password", "Passwort eingeben"],
  ["Partner Dashboard", "Partner-Dashboard"],
  ["Import behavior", "Importoptionen"],
  ["Append", "Anhängen"],
  ["Keep the current menu and add the imported categories after it.", "Das vorhandene Menü beibehalten und die importierten Kategorien dahinter anhängen."],
  ["Replace", "Ersetzen"],
  ["Replace all current categories and items after the new import succeeds.", "Nach erfolgreichem Import alle vorhandenen Kategorien und Artikel ersetzen."],
  ["Update add-ons", "Extras aktualisieren"],
  ["Match existing categories and items by name and update only their add-ons. Images and other fields stay unchanged.", "Vorhandene Kategorien und Artikel anhand des Namens zuordnen und ausschließlich ihre Extras aktualisieren. Bilder und andere Felder bleiben unverändert."],
  ["Free drink", "Gratisgetränk"],
  ["No social handles added.", "Noch keine Social-Media-Profile hinzugefügt."],
  ["No stamp-card milestones configured yet.", "Noch keine Stempelkarten-Prämien eingerichtet."],
  ["No scanner or admin access configured yet.", "Noch kein Scanner- oder Administratorzugriff eingerichtet."],
  ["No menu configured yet.", "Noch kein Menü eingerichtet."],
  ["No items in this category.", "Keine Artikel in dieser Kategorie."],
  ["Other items", "Weitere Artikel"],
  ["No starter categories staged.", "Noch keine Startkategorien vorbereitet."],
  ["No starter items staged.", "Noch keine Startartikel vorbereitet."],
  ["CSV template", "CSV-Vorlage"],
  ["JSON template", "JSON-Vorlage"],
  ["Select a Knobi ZIP, or multiple menu JSON files and assets_manifest.json together. CSV remains supported.", "Wähle eine Knobi-ZIP-Datei oder mehrere Menü-JSON-Dateien gemeinsam mit der assets_manifest.json aus. CSV wird weiterhin unterstützt."],
  ["All days", "Alle Tage"],
  ["Weekdays", "Werktage"],
  ["Weekend", "Wochenende"],
  ["Clear", "Auswahl löschen"],
  ["Horizontal crop", "Horizontaler Bildausschnitt"],
  ["Vertical crop", "Vertikaler Bildausschnitt"],
  ["Validation errors", "Validierungsfehler"],
  ["Warnings", "Warnungen"],
  ["Copy from existing partner", "Von vorhandenem Partner übernehmen"],
  ["Select a partner…", "Partner auswählen …"],
  ["Usual cadence", "Üblicher Besuchsrhythmus"],
  ["Last visit", "Letzter Besuch"],
  ["Visits", "Besuche"],
  ["No stamp-card progress rows loaded for this partner.", "Für diesen Partner wurden keine Stempelkarten-Fortschritte geladen."],
  ["No redemption visits loaded for this partner.", "Für diesen Partner wurden keine Einlösungen geladen."],
  ["Square Post", "Quadratischer Beitrag"],
  ["Story Banner", "Story-Banner"],
  ["Landscape Banner", "Querformat-Banner"],
  ["Bold Offer", "Markantes Angebot"],
  ["Clean Story", "Klare Story"],
  ["Photo Spotlight", "Foto im Fokus"],
  ["Editorial Luxe", "Editorial Elegant"],
  ["Midnight Glow", "Mitternachtsglanz"],
  ["Food & drink", "Gastronomie"],
  ["Salon & beauty", "Salon & Beauty"],
  ["Wellness & care", "Wellness & Pflege"],
  ["Entertainment", "Unterhaltung"],
  ["Retail & services", "Einzelhandel & Dienstleistungen"],
  ["Add another", "Weiteres hinzufügen"],
  ["Add another milestone", "Weitere Prämienstufe hinzufügen"],
  ["Allow free user trial", "Kostenlose Testphase erlauben"],
  ["Approve menu", "Menü freigeben"],
  ["At least one deal is recommended, but the partner can be created without deals.", "Mindestens ein Deal wird empfohlen, der Partner kann jedoch auch ohne Deals erstellt werden."],
  ["At least one deal is recommended, but this partner can exist without deals.", "Mindestens ein Deal wird empfohlen, dieser Partner kann jedoch auch ohne Deals bestehen."],
  ["At least one milestone is required before a partner can be created.", "Vor dem Erstellen eines Partners ist mindestens eine Prämienstufe erforderlich."],
  ["Business snapshot", "Unternehmensüberblick"],
  ["Challenge name", "Name der Challenge"],
  ["Change menu item image", "Bild des Menüartikels ändern"],
  ["Choose a user and assign the appropriate role.", "Wähle einen Nutzer aus und weise ihm die passende Rolle zu."],
  ["Choose Files again to add another JSON file. Earlier selections stay attached to Add menu.", "Wähle erneut Dateien aus, um eine weitere JSON-Datei hinzuzufügen. Bereits ausgewählte Dateien bleiben dem neuen Menü zugeordnet."],
  ["Clear files", "Dateiauswahl leeren"],
  ["Close menu import", "Menüimport schließen"],
  ["Comeback candidates", "Comeback-Kandidaten"],
  ["Configure inactive-user filters and preview matching loaded users. The saved deal stores the filter config, not explicit user IDs.", "Konfiguriere Filter für inaktive Nutzer und prüfe die passenden geladenen Nutzer. Der gespeicherte Deal enthält die Filterkonfiguration, keine einzelnen Nutzer-IDs."],
  ["Configure selectable, automatic, and fallback benefits for the Supabase redemption flow.", "Konfiguriere auswählbare, automatische und ersatzweise angewendete Vorteile für den Supabase-Einlösungsprozess."],
  ["Copy and Instructions", "Texte und Hinweise"],
  ["Customer copy and staff instructions", "Kundentexte und Mitarbeiterhinweise"],
  ["Create starter menu", "Startmenü erstellen"],
  ["Deal Drop card image", "Kartenbild des Deal Drops"],
  ["Deal Drop card image (710×400)", "Kartenbild des Deal Drops (710 × 400)"],
  ["Deal Drop inventory", "Deal-Drop-Kontingent"],
  ["Delete partner?", "Partner löschen?"],
  ["Deleting milestone...", "Prämienstufe wird gelöscht ..."],
  ["Deleting partner...", "Partner wird gelöscht ..."],
  ["Dismiss notification", "Benachrichtigung schließen"],
  ["Duration unit", "Zeiteinheit"],
  ["Duration value", "Dauer"],
  ["Edit in partner menu", "Im Partnermenü bearbeiten"],
  ["Edit the microsite here, or open the full-width builder for more space.", "Bearbeite die Microsite hier oder öffne den Builder in voller Breite, um mehr Platz zu haben."],
  ["Estimated savings (€)", "Geschätzte Ersparnis (€)"],
  ["Example:", "Beispiel:"],
  ["Expiry days", "Gültigkeit in Tagen"],
  ["Free item name", "Name des Gratisartikels"],
  ["Happy hour end", "Ende der Happy Hour"],
  ["Happy hour start", "Beginn der Happy Hour"],
  ["Happy Hour weekdays", "Wochentage der Happy Hour"],
  ["Every day", "Täglich"],
  ["Mon-Fri", "Mo–Fr"],
  ["Sat-Sun", "Sa–So"],
  ["Mon", "Mo"],
  ["Tue", "Di"],
  ["Wed", "Mi"],
  ["Thu", "Do"],
  ["Fri", "Fr"],
  ["Sat", "Sa"],
  ["Sun", "So"],
  ["If customer description, staff instructions, or terms are left blank, a generic version will be entered automatically.", "Wenn Kundenbeschreibung, Mitarbeiterhinweise oder Bedingungen leer bleiben, wird automatisch ein allgemeiner Text eingetragen."],
  ["Inactive for at least", "Inaktiv seit mindestens"],
  ["Inactivity unit", "Einheit der Inaktivität"],
  ["Launch inventory", "Startkontingent"],
  ["Live preview", "Live-Vorschau"],
  ["Maximum visits", "Maximale Besuche"],
  ["Minimum visits", "Minimale Besuche"],
  ["More setup details", "Weitere Einstellungen"],
  ["Move cover photo earlier", "Titelbild nach vorne verschieben"],
  ["Move cover photo later", "Titelbild nach hinten verschieben"],
  ["No add-ons yet.", "Noch keine Extras hinzugefügt."],
  ["No applied benefit rows loaded for this visit.", "Für diesen Besuch wurden keine angewendeten Vorteile geladen."],
  ["No categories selected", "Keine Kategorien ausgewählt"],
  ["No deals staged.", "Noch keine Deals vorbereitet."],
  ["No matching users for the current filters.", "Keine Nutzer entsprechen den aktuellen Filtern."],
  ["Nothing has been saved yet. Review this preview before confirming.", "Es wurde noch nichts gespeichert. Prüfe diese Vorschau vor der Bestätigung."],
  ["Number of bonus stamps", "Anzahl der Bonusstempel"],
  ["Open full-width builder", "Builder in voller Breite öffnen"],
  ["Open the picker again to add more files; these selections will be retained.", "Öffne die Dateiauswahl erneut, um weitere Dateien hinzuzufügen; die bisherige Auswahl bleibt erhalten."],
  ["Open this tab again to refresh the partner summary.", "Öffne diesen Bereich erneut, um die Partnerübersicht zu aktualisieren."],
  ["Optional extras customers can add to this item.", "Optionale Extras, die Kunden zu diesem Artikel hinzufügen können."],
  ["Partner launch brief", "Übersicht zum Partnerstart"],
  ["Pre-fill this form from an existing partner&apos;s profile. You can edit anything afterwards.", "Fülle dieses Formular mit dem Profil eines vorhandenen Partners vor. Anschließend kannst du alle Angaben bearbeiten."],
  ["Pre-fill this form from an existing partner's profile. You can edit anything afterwards.", "Fülle dieses Formular mit dem Profil eines vorhandenen Partners vor. Anschließend kannst du alle Angaben bearbeiten."],
  ["Active on launch", "Beim Start aktiv"],
  ["Saved as inactive", "Wird inaktiv gespeichert"],
  ["complete", "vollständig"],
  ["Type not selected", "Partnertyp nicht ausgewählt"],
  ["City not selected", "Stadt nicht ausgewählt"],
  ["Owner not selected", "Inhaber nicht ausgewählt"],
  ["Email not added", "E-Mail nicht angegeben"],
  ["Phone not added", "Telefon nicht angegeben"],
  ["Website not added", "Webseite nicht angegeben"],
  ["Address not added", "Adresse nicht angegeben"],
  ["Set", "Eingerichtet"],
  ["Incomplete", "Unvollständig"],
  ["Ready to create. All required partner details are complete.", "Bereit zum Erstellen. Alle erforderlichen Partnerdaten sind vollständig."],
  ["Preparing cover images…", "Titelbilder werden vorbereitet …"],
  ["Preparing image…", "Bild wird vorbereitet …"],
  ["Removing access...", "Zugriff wird entfernt ..."],
  ["Removing deal...", "Deal wird entfernt ..."],
  ["Restore cover", "Titelbild wiederherstellen"],
  ["Reward details", "Prämiendetails"],
  ["Saving order...", "Reihenfolge wird gespeichert ..."],
  ["Select a ZIP or one or more menu JSON files with an optional assets manifest, or CSV. Name and status are still required.", "Wähle eine ZIP-Datei, eine oder mehrere Menü-JSON-Dateien mit optionalem Asset-Manifest oder eine CSV-Datei aus. Name und Status bleiben Pflichtfelder."],
  ["Select one or more menu JSON files and an optional assets manifest together. CSV remains supported. The menu name and status above remain required.", "Wähle eine oder mehrere Menü-JSON-Dateien gemeinsam mit einem optionalen Asset-Manifest aus. CSV wird weiterhin unterstützt. Menüname und Status oben bleiben Pflichtfelder."],
  ["Set the full weekly schedule in one pass.", "Lege den vollständigen Wochenplan in einem Schritt fest."],
  ["Stock remaining", "Verbleibendes Kontingent"],
  ["Stock total", "Gesamtkontingent"],
  ["This admin now supports one menu per partner. It is showing the first menu loaded for this partner.", "Die Administration unterstützt derzeit ein Menü pro Partner. Angezeigt wird das erste für diesen Partner geladene Menü."],
  ["This Deal Drop is currently sold out.", "Dieser Deal Drop ist aktuell ausverkauft."],
  ["This Deal Drop is sold out and users cannot redeem it.", "Dieser Deal Drop ist ausverkauft und kann von Nutzern nicht eingelöst werden."],
  ["This menu is empty. The imported categories and items will become its menu content.", "Dieses Menü ist leer. Die importierten Kategorien und Artikel werden als Menüinhalt übernommen."],
  ["Trigger value", "Auslösewert"],
  ["Enter an amount greater than 0.", "Gib einen Betrag größer als 0 ein."],
  ["Minimum spend is less than the discount amount — users may get more off than they spend.", "Der Mindestbestellwert liegt unter dem Rabattbetrag – Nutzer könnten dadurch mehr Rabatt erhalten, als sie ausgeben."],
  ["Enter the free item name.", "Gib den Namen des Gratisartikels ein."],
  ["Enter at least 1 bonus stamp.", "Gib mindestens einen Bonusstempel ein."],
  ["Enter a start time.", "Gib eine Startzeit ein."],
  ["Enter an end time.", "Gib eine Endzeit ein."],
  ["Enter a trigger value greater than 0.", "Gib einen Auslösewert größer als 0 ein."],
  ["Enter a challenge name.", "Gib einen Namen für die Challenge ein."],
  ["Enter a duration greater than 0.", "Gib eine Dauer größer als 0 ein."],
  ["Enter an inactivity period greater than 0.", "Gib einen Inaktivitätszeitraum größer als 0 ein."],
  ["Maximum visits must be at least minimum visits.", "Die maximale Besuchsanzahl muss mindestens der minimalen Besuchsanzahl entsprechen."],
  ["Limited Deal Drops must have an end time.", "Limitierte Deal Drops benötigen einen Endzeitpunkt."],
  ["Item rewards require a reward item.", "Prämien des Typs „Prämienartikel“ benötigen einen Artikel."],
  ["Item milestones require a reward item.", "Prämienstufen des Typs „Prämienartikel“ benötigen einen Artikel."],
  ["Fixed and percent milestones require a discount value.", "Prämienstufen mit festem oder prozentualem Rabatt benötigen einen Rabattwert."],
  ["Upload a highlight image for the deal card (710×400px).", "Lade ein Highlight-Bild für die Deal-Karte hoch (710 × 400 px)."],
  ["Uploading image…", "Bild wird hochgeladen …"],
  ["Visits can contain multiple applied benefits; the server decides the full reward bundle.", "Ein Besuch kann mehrere angewendete Vorteile enthalten; der Server bestimmt das vollständige Prämienpaket."],
  ["Will copy: type, city, description, categories, phone, website, social handles, and milestones. Name, email, address, and owner will not be copied.", "Übernommen werden Typ, Stadt, Beschreibung, Kategorien, Telefon, Webseite, Social-Media-Profile und Prämienstufen. Name, E-Mail-Adresse, Anschrift und Inhaber werden nicht übernommen."],
  ["+ Add option", "+ Option hinzufügen"],
  ["(optional)", "(optional)"],
  ["in the background…", "im Hintergrund …"],
  ["categories ·", "Kategorien ·"],
  ["categories and", "Kategorien und"],
  ["cover photos saved", "Titelbilder gespeichert"],
  ["cover photos, 10 MB each.", "Titelbildern mit jeweils höchstens 10 MB."],
  ["items · Updated", "Artikel · Aktualisiert"],
  ["items. Choose how the imported content should be handled.", "Artikel. Lege fest, wie die importierten Inhalte verarbeitet werden sollen."],
  ["Optional. Add up to", "Optional. Füge bis zu"],
  ["social profiles. Enter a handle or full profile URL and the partner record will store the canonical link automatically.", "Social-Media-Profile hinzu. Gib einen Benutzernamen oder die vollständige Profil-URL ein; im Partnerdatensatz wird automatisch der kanonische Link gespeichert."],
  ["This menu already has", "Dieses Menü enthält bereits"],
  [". Images are resized automatically before upload. Max", ". Bilder werden vor dem Hochladen automatisch angepasst. Maximal"],
  ["· Max 10 MB", "· Max. 10 MB"],
  ["- Position", "– Position"],
  ["Add your Supabase publishable key to `.env.local` to enable sign in.", "Füge deinen öffentlichen Supabase-Schlüssel in `.env.local` ein, um die Anmeldung zu aktivieren."],
  ["Admin Panel", "Admin-Bereich"],
  ["Auto photo audit", "Automatische Bildprüfung"],
  ["Create `.env.local` from `.env.example`, then add your Supabase publishable key.", "Erstelle `.env.local` aus `.env.example` und füge anschließend deinen öffentlichen Supabase-Schlüssel ein."],
  ["Edit microsite", "Microsite bearbeiten"],
  ["Edit your microsite content without affecting other partners.", "Bearbeite die Inhalte deiner Microsite, ohne andere Partner zu beeinflussen."],
  ["Loading admin workspace", "Admin-Bereich wird geladen"],
  ["Loading sign in", "Anmeldung wird geladen"],
  ["need attention. Replace blurry or undersized photos before publishing or printing.", "benötigen Aufmerksamkeit. Ersetze unscharfe oder zu kleine Bilder vor der Veröffentlichung oder dem Druck."],
  ["No partner shop is linked to this account yet.", "Diesem Konto ist noch kein Partnerbetrieb zugeordnet."],
  ["No location set", "Kein Standort hinterlegt"],
  ["Unnamed partner", "Unbenannter Partner"],
  ["Open a microsite builder below to update your live page content.", "Öffne unten einen Microsite-Builder, um die Inhalte deiner Live-Seite zu aktualisieren."],
  ["Only your assigned partner shop is accessible", "Du kannst ausschließlich auf den dir zugeordneten Partnerbetrieb zugreifen."],
  ["Partner Microsites", "Partner-Microsites"],
  ["Partner location", "Partnerbetrieb"],
  ["Partner self-service", "Partner-Selbstverwaltung"],
  ["Partner sign in", "Partner-Anmeldung"],
  ["Sign out of this account", "Von diesem Konto abmelden"],
  ["Signing out...", "Abmeldung läuft ..."],
  ["Supabase returned warnings", "Supabase hat Warnungen zurückgegeben"],
  ["Supabase env setup required", "Supabase-Umgebung muss eingerichtet werden"],
  ["Use your linked Supabase account to access your microsite dashboard.", "Melde dich mit deinem verknüpften Supabase-Konto an, um auf dein Microsite-Dashboard zuzugreifen."],
  ["Your partner microsites", "Deine Partner-Microsites"],
] as const

const englishToGerman = new Map<string, string>(translations)
const germanToEnglish = new Map<string, string>()
for (const [english, german] of translations) {
  if (!germanToEnglish.has(german)) germanToEnglish.set(german, english)
}
germanToEnglish.set("Artikel", "Item")
germanToEnglish.set("Döner", "Doner kebab")

const englishDealSummaryWeekdays = new Map([
  ["Every day", "Täglich"],
  ["Mon-Fri", "Mo–Fr"],
  ["Sat-Sun", "Sa–So"],
  ["Mon", "Mo"],
  ["Tue", "Di"],
  ["Wed", "Mi"],
  ["Thu", "Do"],
  ["Fri", "Fr"],
  ["Sat", "Sa"],
  ["Sun", "So"],
])

const germanDealSummaryWeekdays = new Map(
  [...englishDealSummaryWeekdays].map(([english, german]) => [german, english]),
)

const partnerCategoryLabels = new Set([
  "Doner",
  "Doner kebab",
  "Döner",
  "Pizza",
  "Shawarma",
  "Burger",
  "Burgers",
  "Chinese",
  "Chinesisch",
  "Snack bar",
  "Imbiss",
  "Butcher shop",
  "Metzgerei",
  "Soups",
  "Suppen",
  "Suppe",
  "Cafe",
  "Café",
  "Grill",
  "Falafel",
  "Bowl",
  "Bowls",
  "Thai",
  "Sushi",
  "Restaurant",
  "Asia",
  "Asian",
  "Asiatisch",
  "Eis",
  "Ice cream",
  "Inder",
  "Indian",
  "Indisch",
  "Grieche",
  "Greek",
  "Griechisch",
])

function translateDealSummarySuffix(
  value: string,
  language: AdminLanguage,
) {
  const weekdayMap =
    language === "de" ? englishDealSummaryWeekdays : germanDealSummaryWeekdays

  return value
    .split(/(\s+-\s+|\s+–\s+|,\s*)/)
    .map((part) => weekdayMap.get(part) ?? part)
    .join("")
    .replaceAll(language === "de" ? " - " : " – ", language === "de" ? " – " : " - ")
}

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

  const categoryList = core.split(/,\s*/)
  if (
    categoryList.length > 1 &&
    categoryList.every((category) => partnerCategoryLabels.has(category))
  ) {
    const translatedCategories = categoryList.map(
      (category) => dictionary.get(category) ?? category,
    )
    return `${leading}${translatedCategories.join(", ")}${trailing}`
  }

  const requiredCreateTab = core.match(
    /^Please complete the required fields in (.+) before creating the partner\.$/,
  )
  if (requiredCreateTab && language === "de") {
    const tab =
      englishToGerman.get(requiredCreateTab[1]) ?? requiredCreateTab[1]
    return `${leading}Bitte fülle vor dem Erstellen des Partners alle Pflichtfelder unter „${tab}“ aus.${trailing}`
  }

  const percentageOff = core.match(/^(\d+(?:[.,]\d+)?)%\s+off(.*)$/i)
  if (percentageOff && language === "de") {
    return `${leading}${percentageOff[1].replace(".", ",")} % Rabatt${translateDealSummarySuffix(percentageOff[2], language)}${trailing}`
  }

  const germanPercentageOff = core.match(
    /^(\d+(?:[.,]\d+)?)\s*%\s+Rabatt(.*)$/i,
  )
  if (germanPercentageOff && language === "en") {
    return `${leading}${germanPercentageOff[1].replace(",", ".")}% off${translateDealSummarySuffix(germanPercentageOff[2], language)}${trailing}`
  }

  const fixedAmountOff = core.match(/^€\s*(\d+(?:[.,]\d+)?)\s+off(.*)$/i)
  if (fixedAmountOff && language === "de") {
    return `${leading}${fixedAmountOff[1].replace(".", ",")} € Rabatt${translateDealSummarySuffix(fixedAmountOff[2], language)}${trailing}`
  }

  const germanFixedAmountOff = core.match(
    /^(\d+(?:[.,]\d+)?)\s*€\s+Rabatt(.*)$/i,
  )
  if (germanFixedAmountOff && language === "en") {
    return `${leading}€${germanFixedAmountOff[1].replace(",", ".")} off${translateDealSummarySuffix(germanFixedAmountOff[2], language)}${trailing}`
  }

  const bonusStampSummary = core.match(/^\+(\d+)\s+bonus\s+stamps?$/i)
  if (bonusStampSummary && language === "de") {
    return `${leading}+${bonusStampSummary[1]} Bonusstempel${trailing}`
  }

  const germanBonusStampSummary = core.match(
    /^\+(\d+)\s+Bonusstempel$/i,
  )
  if (germanBonusStampSummary && language === "en") {
    return `${leading}+${germanBonusStampSummary[1]} bonus ${
      germanBonusStampSummary[1] === "1" ? "stamp" : "stamps"
    }${trailing}`
  }

  const numericRangeHint = core.match(
    /^Must be between (\d+(?:[.,]\d+)?) and (\d+(?:[.,]\d+)?)\.$/i,
  )
  if (numericRangeHint && language === "de") {
    return `${leading}Der Wert muss zwischen ${numericRangeHint[1].replace(".", ",")} und ${numericRangeHint[2].replace(".", ",")} liegen.${trailing}`
  }

  const germanNumericRangeHint = core.match(
    /^Der Wert muss zwischen (\d+(?:[.,]\d+)?) und (\d+(?:[.,]\d+)?) liegen\.$/i,
  )
  if (germanNumericRangeHint && language === "en") {
    return `${leading}Must be between ${germanNumericRangeHint[1].replace(",", ".")} and ${germanNumericRangeHint[2].replace(",", ".")}.${trailing}`
  }

  const duplicateCategory = core.match(/^Duplicate\s+(.+)\s+and its items$/i)
  if (duplicateCategory && language === "de") {
    return `${leading}${duplicateCategory[1]} einschließlich Artikel duplizieren${trailing}`
  }

  const germanDuplicateCategory = core.match(
    /^(.+)\s+einschließlich Artikel duplizieren$/i,
  )
  if (germanDuplicateCategory && language === "en") {
    return `${leading}Duplicate ${germanDuplicateCategory[1]} and its items${trailing}`
  }

  const duplicateLabel = core.match(/^Duplicate\s+(.+)$/i)
  if (duplicateLabel && language === "de") {
    return `${leading}Duplizieren: ${duplicateLabel[1]}${trailing}`
  }

  const germanDuplicateLabel = core.match(/^Duplizieren:\s+(.+)$/i)
  if (germanDuplicateLabel && language === "en") {
    return `${leading}Duplicate ${germanDuplicateLabel[1]}${trailing}`
  }

  const pictureLabel = core.match(/^(.+)\s+picture$/i)
  if (pictureLabel && language === "de") {
    return `${leading}Bild von ${pictureLabel[1]}${trailing}`
  }

  const germanPictureLabel = core.match(/^Bild von\s+(.+)$/i)
  if (germanPictureLabel && language === "en") {
    return `${leading}${germanPictureLabel[1]} picture${trailing}`
  }

  const deleteLabel = core.match(/^Delete\s+(.+)$/i)
  if (deleteLabel && language === "de") {
    return `${leading}${deleteLabel[1]} löschen${trailing}`
  }

  const germanDeleteLabel = core.match(/^(.+)\s+löschen$/i)
  if (germanDeleteLabel && language === "en") {
    return `${leading}Delete ${germanDeleteLabel[1]}${trailing}`
  }

  const euroAmount = core.match(/^(\d+)\.(\d{2})\s+EUR$/i)
  if (euroAmount && language === "de") {
    return `${leading}${euroAmount[1]},${euroAmount[2]} €${trailing}`
  }

  const germanEuroAmount = core.match(/^(\d+),(\d{2})\s+€$/i)
  if (germanEuroAmount && language === "en") {
    return `${leading}${germanEuroAmount[1]}.${germanEuroAmount[2]} EUR${trailing}`
  }

  const decimalNumber = core.match(/^(-?\d+)\.(\d+)$/)
  if (decimalNumber && language === "de") {
    return `${leading}${decimalNumber[1]},${decimalNumber[2]}${trailing}`
  }

  const germanDecimalNumber = core.match(/^(-?\d+),(\d+)$/)
  if (germanDecimalNumber && language === "en") {
    return `${leading}${germanDecimalNumber[1]}.${germanDecimalNumber[2]}${trailing}`
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

  const germanItemCount = core.match(/^(\d+)\s+Artikel$/i)
  if (germanItemCount && language === "en") {
    return `${leading}${germanItemCount[1]} ${
      germanItemCount[1] === "1" ? "item" : "items"
    }${trailing}`
  }

  const partnerLocationType = core.match(
    /^(.+)\s+-\s+(Food & Drink|Services|Wellness|Activities)$/,
  )
  if (partnerLocationType && language === "de") {
    return `${leading}${partnerLocationType[1]} – ${
      englishToGerman.get(partnerLocationType[2]) ?? partnerLocationType[2]
    }${trailing}`
  }

  const germanPartnerLocationType = core.match(
    /^(.+)\s+[–-]\s+(Gastronomie|Dienstleistungen|Wellness|Aktivitäten)$/,
  )
  if (germanPartnerLocationType && language === "en") {
    return `${leading}${germanPartnerLocationType[1]} - ${
      germanToEnglish.get(germanPartnerLocationType[2]) ??
      germanPartnerLocationType[2]
    }${trailing}`
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

  const germanStampReward = core.match(
    /^(\d+)\s+Stempel\s*[–-]\s*(.+)$/i,
  )
  if (germanStampReward && language === "en") {
    const rewardType =
      germanToEnglish.get(germanStampReward[2]) ?? germanStampReward[2]
    return `${leading}${germanStampReward[1]} stamps - ${rewardType}${trailing}`
  }

  const germanStampRewardPrefix = core.match(
    /^(\d+)\s+Stempel\s*[–-]\s*$/i,
  )
  if (germanStampRewardPrefix && language === "en") {
    return `${leading}${germanStampRewardPrefix[1]} stamps -${trailing}`
  }

  const stampCount = core.match(/^(\d+)\s+stamps?$/i)
  if (stampCount && language === "de") {
    return `${leading}${stampCount[1]} Stempel${trailing}`
  }

  const germanStampCount = core.match(/^(\d+)\s+Stempel$/i)
  if (germanStampCount && language === "en") {
    return `${leading}${germanStampCount[1]} ${
      germanStampCount[1] === "1" ? "stamp" : "stamps"
    }${trailing}`
  }

  const milestoneCount = core.match(/^(\d+)\s+milestones?$/i)
  if (milestoneCount && language === "de") {
    return `${leading}${milestoneCount[1]} ${
      milestoneCount[1] === "1" ? "Prämienstufe" : "Prämienstufen"
    }${trailing}`
  }

  const germanMilestoneCount = core.match(
    /^(\d+)\s+Prämienstufe(?:n)?$/i,
  )
  if (germanMilestoneCount && language === "en") {
    return `${leading}${germanMilestoneCount[1]} ${
      germanMilestoneCount[1] === "1" ? "milestone" : "milestones"
    }${trailing}`
  }

  const dealCount = core.match(/^(\d+)\s+(deal|deals)$/i)
  if (dealCount && language === "de") {
    return `${leading}${dealCount[1]} ${dealCount[1] === "1" ? "Deal" : "Deals"}${trailing}`
  }

  const imageCount = core.match(/^(\d+)\s+images?$/i)
  if (imageCount && language === "de") {
    return `${leading}${imageCount[1]} ${
      imageCount[1] === "1" ? "Bild" : "Bilder"
    }${trailing}`
  }

  const configuredCount = core.match(/^(\d+)\s+set$/i)
  if (configuredCount && language === "de") {
    return `${leading}${configuredCount[1]} eingerichtet${trailing}`
  }

  const openDays = core.match(/^(\d+)\s*\/\s*(\d+)\s+days open$/i)
  if (openDays && language === "de") {
    return `${leading}${openDays[1]} von ${openDays[2]} Tagen geöffnet${trailing}`
  }

  const requiredFields = core.match(
    /^(\d+)\s+of\s+(\d+)\s+required fields are complete\. Review the marked tabs before creating\.$/i,
  )
  if (requiredFields && language === "de") {
    return `${leading}${requiredFields[1]} von ${requiredFields[2]} Pflichtfeldern sind vollständig. Prüfe vor dem Erstellen die markierten Bereiche.${trailing}`
  }

  const weeklyVisits = core.match(/^(\d+)\s+visits?\s+this week$/i)
  if (weeklyVisits && language === "de") {
    return `${leading}${weeklyVisits[1]} ${
      weeklyVisits[1] === "1" ? "Besuch" : "Besuche"
    } diese Woche${trailing}`
  }

  const reviewCount = core.match(/^(\d+)\s+menu\s+(review|reviews)$/i)
  if (reviewCount && language === "de") {
    return `${leading}${reviewCount[1]} ${reviewCount[1] === "1" ? "Menüprüfung" : "Menüprüfungen"}${trailing}`
  }

  const characterCount = core.match(/^(\d+)\s*\/\s*(\d+)\s+characters$/i)
  if (characterCount && language === "de") {
    return `${leading}${characterCount[1]} / ${characterCount[2]} Zeichen${trailing}`
  }

  const germanCharacterCount = core.match(
    /^(\d+)\s*\/\s*(\d+)\s+Zeichen$/i,
  )
  if (germanCharacterCount && language === "en") {
    return `${leading}${germanCharacterCount[1]} / ${germanCharacterCount[2]} characters${trailing}`
  }

  if (
    language === "en" &&
    (core.includes(" · Vergleich ") ||
      core.includes(" · Zeitzone ") ||
      core.includes(" · Währung "))
  ) {
    return `${leading}${core
      .replaceAll(" · Vergleich ", " · Comparison ")
      .replaceAll(" · Zeitzone ", " · Time zone ")
      .replaceAll(" · Währung ", " · Currency ")}${trailing}`
  }

  const socialHandle = core.match(/^Handle\s+(\d+)$/)
  if (socialHandle && language === "de") {
    return `${leading}Profil ${socialHandle[1]}${trailing}`
  }

  const coverPhotoCount = core.match(
    /^(\d+)\s+of\s+(\d+)\s+cover photos saved;\s+(\d+)\s+slots? available\.$/i,
  )
  if (coverPhotoCount && language === "de") {
    return `${leading}${coverPhotoCount[1]} von ${coverPhotoCount[2]} Titelbildern gespeichert; ${coverPhotoCount[3]} ${
      coverPhotoCount[3] === "1" ? "Platz" : "Plätze"
    } verfügbar.${trailing}`
  }

  const progressRows = core.match(
    /^Showing\s+(\d+)\s+of\s+(\d+)\s+progress rows?\.$/i,
  )
  if (progressRows && language === "de") {
    return `${leading}${progressRows[1]} von ${progressRows[2]} Fortschrittszeilen werden angezeigt.${trailing}`
  }

  const visitRows = core.match(
    /^Showing\s+(\d+)\s+of\s+(\d+)\s+visits?\.$/i,
  )
  if (visitRows && language === "de") {
    return `${leading}${visitRows[1]} von ${visitRows[2]} Besuchen werden angezeigt.${trailing}`
  }

  const visitReference = core.match(/^Visit\s+(.+)$/)
  if (visitReference && language === "de") {
    return `${leading}Besuch ${visitReference[1]}${trailing}`
  }

  const englishDate = core.match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/,
  )
  if (englishDate && language === "de") {
    const months: Record<string, string> = {
      Jan: "Jan.",
      Feb: "Feb.",
      Mar: "März",
      Apr: "Apr.",
      May: "Mai",
      Jun: "Juni",
      Jul: "Juli",
      Aug: "Aug.",
      Sep: "Sept.",
      Oct: "Okt.",
      Nov: "Nov.",
      Dec: "Dez.",
    }
    return `${leading}${Number(englishDate[1])}. ${months[englishDate[2]]} ${englishDate[3]}${trailing}`
  }

  const englishDateTime = core.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/,
  )
  if (englishDateTime && language === "de") {
    const months: Record<string, string> = {
      Jan: "Januar",
      Feb: "Februar",
      Mar: "März",
      Apr: "April",
      May: "Mai",
      Jun: "Juni",
      Jul: "Juli",
      Aug: "August",
      Sep: "September",
      Oct: "Oktober",
      Nov: "November",
      Dec: "Dezember",
    }
    const rawHour = Number(englishDateTime[4])
    const hour =
      englishDateTime[6] === "PM"
        ? rawHour === 12
          ? 12
          : rawHour + 12
        : rawHour === 12
          ? 0
          : rawHour
    return `${leading}${Number(englishDateTime[2])}. ${months[englishDateTime[1]]} ${englishDateTime[3]}, ${String(hour).padStart(2, "0")}:${englishDateTime[5]}${trailing}`
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

  const germanOpeningTime = core.match(
    /^Öffnungszeit am (Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)$/,
  )
  if (germanOpeningTime && language === "en") {
    return `${leading}${germanToEnglish.get(germanOpeningTime[1])} opening time${trailing}`
  }

  const germanClosingTime = core.match(
    /^Schließzeit am (Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)$/,
  )
  if (germanClosingTime && language === "en") {
    return `${leading}${germanToEnglish.get(germanClosingTime[1])} closing time${trailing}`
  }

  const germanDate = core.match(
    /^(\d{1,2})\.\s+(Jan\.|Feb\.|März|Apr\.|Mai|Juni|Juli|Aug\.|Sept\.|Okt\.|Nov\.|Dez\.)\s+(\d{4})$/,
  )
  if (germanDate && language === "en") {
    const months: Record<string, string> = {
      "Jan.": "Jan",
      "Feb.": "Feb",
      März: "Mar",
      "Apr.": "Apr",
      Mai: "May",
      Juni: "Jun",
      Juli: "Jul",
      "Aug.": "Aug",
      "Sept.": "Sep",
      "Okt.": "Oct",
      "Nov.": "Nov",
      "Dez.": "Dec",
    }
    return `${leading}${Number(germanDate[1])} ${months[germanDate[2]]} ${germanDate[3]}${trailing}`
  }

  return value
}

export function isTranslationVariant(value: string, original: string) {
  return (
    value === translateValue(original, "en") ||
    value === translateValue(original, "de")
  )
}

export function AdminLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AdminLanguage>("en")
  const [preferenceLoaded, setPreferenceLoaded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const languageRef = useRef(language)
  const textOriginalsRef = useRef(new WeakMap<Text, string>())
  const attributeOriginalsRef = useRef(
    new WeakMap<Element, Map<string, string>>(),
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === "en" || saved === "de") {
        setLanguageState(saved)
      }
      setPreferenceLoaded(true)
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!preferenceLoaded) return

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

      if (!stored || !isTranslationVariant(current, stored)) {
        originals.set(node, current)
      }

      const original = originals.get(node) ?? current
      const translated = translateValue(original, languageRef.current)
      if (current !== translated) node.nodeValue = translated
    }

    const translateElement = (element: Element) => {
      if (element.closest('[data-admin-i18n-ignore="true"]')) return

      const names = ["alt", "aria-label", "placeholder", "title"]
      let originals = attributeOriginalsRef.current.get(element)
      if (!originals) {
        originals = new Map()
        attributeOriginalsRef.current.set(element, originals)
      }

      names.forEach((name) => {
        const current = element.getAttribute(name)
        if (current === null) return
        const stored = originals?.get(name)
        if (!stored || !isTranslationVariant(current, stored)) {
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
  }, [language, preferenceLoaded])

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
