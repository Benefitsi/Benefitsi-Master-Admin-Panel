"use client"

import {
  useActionState,
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useContext,
  type Dispatch,
  type FocusEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react"
import type { PartnerWithDeals } from "@/lib/admin-data"
import {
  resolveMicrositeConfig,
  type MicrositeConfig,
} from "@/lib/microsites"
import {
  createMicrositeReadinessReport,
  type MicrositeReadinessReport,
} from "@/lib/microsite-readiness"
import {
  applyMicrositeTemplatePreset,
  micrositeTemplatePresets,
  type MicrositeTemplatePreset,
} from "@/lib/microsite-templates"
import { MicrositeRenderer } from "@/components/microsite/microsite-renderer"
import { PrintableStudioPanel } from "@/components/microsite/printable-studio-panel"
import {
  defaultMicrositeTemplateForPartner,
  partnerSocialLabel,
  partnerSocialUrl,
} from "@/lib/microsite-personalization"
import {
  saveMicrositeVersion,
  type MicrositeActionState,
} from "./microsite-actions"

const initialState: MicrositeActionState = { ok: false, message: "" }
const BUILDER_LOCALE_STORAGE_KEY = "benefitsi:builder-locale"
const BUILDER_LOCALE_EVENT = "benefitsi:builder-locale-change"

type BuilderLocale = "de" | "en"

type BuilderI18nValue = {
  locale: BuilderLocale
  setLocale: (locale: BuilderLocale) => void
  tr: (text: string) => string
}

const BuilderI18nContext = createContext<BuilderI18nValue | null>(null)

function useBuilderI18n() {
  const value = useContext(BuilderI18nContext)

  if (!value) {
    throw new Error("BuilderI18nContext is missing.")
  }

  return value
}

function readBuilderLocaleSnapshot(): BuilderLocale {
  if (typeof window === "undefined") {
    return "de"
  }

  const storedLocale = window.localStorage.getItem(BUILDER_LOCALE_STORAGE_KEY)
  return storedLocale === "en" ? "en" : "de"
}

function subscribeToBuilderLocale(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined
  }

  const handleChange = () => onStoreChange()

  window.addEventListener("storage", handleChange)
  window.addEventListener(BUILDER_LOCALE_EVENT, handleChange)

  return () => {
    window.removeEventListener("storage", handleChange)
    window.removeEventListener(BUILDER_LOCALE_EVENT, handleChange)
  }
}

function writeBuilderLocale(locale: BuilderLocale) {
  window.localStorage.setItem(BUILDER_LOCALE_STORAGE_KEY, locale)
  window.dispatchEvent(new Event(BUILDER_LOCALE_EVENT))
}

const builderTranslations: Record<string, string> = {
  "Microsite": "Microsite",
  "Restaurant-Premium-Vorlage": "Restaurant premium template",
  "Für Mobilgeräte optimierte Vorlage · Daten vom Partnerprofil · versionierte Veröffentlichung":
    "Mobile-first template · partner-profile data · versioned publishing",
  "Aktuelle Vorschau öffnen": "Open current preview",
  "Gespeicherten Entwurf öffnen": "Open saved draft",
  "Noch nicht live": "Not live yet",
  "In Prüfung": "In review",
  "Entwurf vorhanden": "Draft available",
  "Editorbreite ändern": "Resize editor width",
  "Editorbreite per Ziehen ändern": "Drag to resize editor width",
  "Microsite-Bearbeitung einklappen": "Collapse microsite editor",
  "Microsite-Bearbeitung ausklappen": "Expand microsite editor",
  "Marke": "Brand",
  "Akzentfarbe": "Accent color",
  "Gradientfarbe": "Gradient color",
  "Im Partnerprofil hinterlegen": "Set in the partner profile",
  "Partnerprofil → Media": "Partner profile -> Media",
  "Badge-Icon URL": "Badge icon URL",
  "Neues Badge-Icon hochladen": "Upload new badge icon",
  "Startbereich": "Hero section",
  "Überschrift": "Headline",
  "Partnerprofil → Name": "Partner profile -> Name",
  "Ort": "Location",
  "Partnerprofil → Stadt/Adresse": "Partner profile -> City/address",
  "Öffnungszeiten": "Opening hours",
  "Partnerprofil → Öffnungszeiten": "Partner profile -> Opening hours",
  "Startbild URL": "Hero image URL",
  "Neues Startbild hochladen": "Upload new hero image",
  "Deals & Vorteile": "Deals & benefits",
  "Beschreibung": "Description",
  "Intro-Grafik URL": "Intro image URL",
  "Neue Intro-Grafik hochladen": "Upload new intro image",
  "Top-Deal Überschrift": "Top deal headline",
  "Top-Deal Bild URL": "Top deal image URL",
  "Neues Top-Deal Bild hochladen": "Upload new top deal image",
  "Weitere Bereiche": "More sections",
  "Speisekarte Überschrift": "Menu headline",
  "Speisekarte Beschreibung": "Menu description",
  "Über-uns Überschrift": "About headline",
  "Über-uns Text": "About text",
  "Kontakt Überschrift": "Contact headline",
  "App-Banner Überschrift": "App banner headline",
  "App-Banner Text": "App banner text",
  "Footer-Text": "Footer text",
  "Version & Notiz": "Version & note",
  "Interne Versionsnotiz": "Internal version note",
  "z. B. Knobi Design finalisiert, mobile geprüft":
    "e.g. Knobi design finalized, mobile QA done",
  "Speichert…": "Saving...",
  "Entwurf speichern": "Save draft",
  "Zur Prüfung markieren": "Mark for review",
  "Freigabe erst nach erfüllten Pflichtchecks möglich":
    "Approval is only available after all required checks are complete",
  "Microsite intern freigeben": "Approve microsite internally",
  "Freigeben": "Approve",
  "Diese Version live veröffentlichen": "Publish this version live",
  "Veröffentlichen": "Publish",
  "Live-Publish ist gesperrt, bis alle Pflichtchecks erledigt sind. Entwurf und Prüfung bleiben möglich.":
    "Live publish is locked until all required checks are complete. Draft and review actions are still available.",
  "Editor": "Editor",
  "Live-Vorschau": "Live preview",
  "Preview herauszoomen": "Zoom out preview",
  "Zoom zurücksetzen": "Reset zoom",
  "Preview reinzoomen": "Zoom in preview",
  "Mobil": "Mobile",
  "Bereitschaft": "Readiness",
  "Live-Bereitschaft": "Live readiness",
  "Live-bereit": "Live-ready",
  "Blockiert": "Blocked",
  "In Arbeit": "In progress",
  "Pflicht": "Required",
  "Empfohlen": "Recommended",
  "Nächste Aufgaben": "Next tasks",
  "Alle aktuellen Checks sind erfüllt.": "All current checks are complete.",
  "Veröffentlichung erst nach den Pflichtpunkten empfehlen.":
    "Only recommend publishing after the required items are complete.",
  "Builder-Bereiche": "Builder sections",
  "Top-Navigation": "Top navigation",
  "Restaurant Premium": "Restaurant Premium",
  "Local Restaurant": "Local Restaurant",
  "Clean Food Page": "Clean Food Page",
  "Emotionaler Hero, Deals, Stempelkarte, App-Banner und starke lokale Story.":
    "Emotional hero, deals, stamp card, app banner, and a strong local story.",
  "Ruhiger, regionaler Auftritt für Restaurants, Cafés und lokale Gastgeber.":
    "A calmer regional presentation for restaurants, cafes, and local hosts.",
  "Klarer, reduzierter Aufbau für schnelle Partnerseiten mit wenig Bildmaterial.":
    "A clean, reduced layout for fast partner pages with limited imagery.",
  "Salon Editorial": "Salon Editorial",
  "Wellness Serene": "Wellness Serene",
  "Cinema Spotlight": "Cinema Spotlight",
  "Magazinartiger Look für Hair, Beauty und Service-Studios mit Fokus auf Treatments.":
    "Editorial microsite for hair, beauty, and service studios with a treatment-first focus.",
  "Ruhige, hochwertige Wellness-Sprache für Massage, Spa und Regeneration.":
    "A calm premium wellness direction for massage, spa, and recovery partners.",
  "Kontrastreiche Event-Optik für Kino, Freizeit und erlebnisorientierte Partner.":
    "A high-contrast event look for cinema, activities, and experience-led partners.",
  "Top-Deal": "Top deal",
  "Stempelkarte": "Stamp card",
  "Speisekarte": "Menu",
  "Über uns": "About",
  "Kontakt": "Contact",
  "Footer": "Footer",
  "Vorlagen": "Templates",
  "Datenquellen": "Data sources",
  "Name": "Name",
  "Logo": "Logo",
  "Typ": "Type",
  "Kategorien": "Categories",
  "Adresse": "Address",
  "Telefon": "Phone",
  "Website": "Website",
  "E-Mail": "Email",
  "Einträge": "entries",
  "Menüs": "menus",
  "Belohnungen": "Rewards",
  "Microsite-Bilder": "Microsite images",
  "Start/Deals/Über uns separat": "Hero/deals/about are managed separately",
  "SEO": "SEO",
  "Title/Description separat": "Title/description managed separately",
  "Partnerprofil": "Partner profile",
  "Partnerprofil / Medien": "Partner profile / Media",
  "Menüs & Artikel": "Menus & items",
  "Fehlt": "Missing",
  "Asset-Bibliothek": "Asset library",
  "Asset-Status & Austauschbarkeit": "Asset status & reusability",
  "Partnerlogo": "Partner logo",
  "Feature-Karte": "Feature card",
  "Startbild": "Hero image",
  "Deals": "Deals",
  "Über uns 1": "About image 1",
  "Über uns 2": "About image 2",
  "bereit": "ready",
  "fehlt": "missing",
  "Gespeicherte Asset-Library": "Saved asset library",
  "Versionierung & Rückgängig": "Versioning & rollback",
  "Entwurf": "Draft",
  "Live": "Live",
  "Live-Version als Entwurf laden": "Load live version into draft",
  "Gespeicherten Entwurf neu laden": "Reload saved draft",
  "Jede Speicherung erzeugt eine neue Version. Veröffentlichen setzt nur the geprüfte Version live; alte Live-Versionen bleiben als Sicherheitsnetz erhalten.":
    "Every save creates a new version. Publishing only puts the approved version live; older live versions remain as a safety net.",
  "Jede Speicherung erzeugt eine neue Version. Veröffentlichen setzt nur die geprüfte Version live; alte Live-Versionen bleiben als Sicherheitsnetz erhalten.":
    "Every save creates a new version. Publishing only puts the approved version live; older live versions remain as a safety net.",
  "Speisekarte-System": "Menu system",
  "Artikel": "Items",
  "Preise": "Prices",
  "Bilder": "Images",
  "Darstellung": "Rendering",
  "Fenster + Platzhalter": "Window + placeholders",
  "SEO / LLM": "SEO / LLM",
  "SEO-Titel": "SEO title",
  "SEO-Beschreibung": "SEO description",
  "Suchbegriffe": "Keywords",
  "Döner, Pizza, Annweiler, Benefitsi":
    "doner, pizza, annweiler, benefitsi",
  "Social-Vorschau-Bild URL": "Social preview image URL",
  "Öffentliche Seite auf noindex setzen": "Set public page to noindex",
  "Finale Checks": "Final checks",
  "Partnerdaten geprüft": "Partner data reviewed",
  "Assets/Fallbacks geprüft": "Assets/fallbacks reviewed",
  "Desktopprüfung abgeschlossen": "Desktop QA complete",
  "Mobilprüfung abgeschlossen": "Mobile QA complete",
  "SEO/LLM geprüft": "SEO/LLM reviewed",
  "Veröffentlichung final geprüft": "Publishing review complete",
  "Ablauf": "Workflow",
  "Partnerdaten prüfen": "Review partner data",
  "Assets bereit": "Assets ready",
  "Mobilprüfung": "Mobile QA",
  "SEO/LLM-Prüfung": "SEO/LLM review",
  "Freigabe": "Approval",
  "Partner-Self-Service sollte nur Daten, Speisekarte und Bilder freigeben – Layout bleibt intern geschützt.":
    "Partner self-service should only expose data, menu, and images; layout stays protected internally.",
  "Partner-Modus prüfen": "Open partner mode",
  "Social Media": "Social media",
  "Beschriftung": "Label",
  "Link": "Link",
  "Logo-/Icon-URL": "Logo/icon URL",
  "Dieses Feld wird zentral aus den Partnerdaten übernommen und bleibt für Skalierung synchron.":
    "This field is synced from partner data so it stays consistent at scale.",
  "Ausgewähltes Element": "Selected element",
  "Direkt im Builder: Text anklicken und tippen. Bilder und Gruppen kannst du anklicken und leicht nach oben/unten ziehen, um den Abstand zu verändern.":
    "Edit text inline directly in the builder. Click images and groups, then drag slightly up or down to adjust spacing.",
  "Text": "Text",
  "Bild URL": "Image URL",
  "Bild hochladen und beim Speichern ersetzen":
    "Upload image and replace on save",
  "Vorlagen-Icon": "Template icon",
  "Eigenes Icon-Bild URL": "Custom icon image URL",
  "Eigenes Icon hochladen": "Upload custom icon",
  "Top-Nav Höhe": "Top nav height",
  "Schriftgröße": "Font size",
  "Icongröße": "Icon size",
  "Bildgröße": "Image scale",
  "Zurück auf Auto": "Reset to auto",
  "Elementfarbe auswählen": "Choose element color",
  "Elementfarbe Hex": "Element color hex",
  "Farbe": "Color",
  "Sprache": "Language",
  "Print-Studio": "Print studio",
  "Element": "Element",
  "Layout": "Layout",
  "Inhalt": "Content",
  "Assets": "Assets",
  "Print": "Print",
  "Alle Bereiche einklappen": "Collapse all sections",
  "Alle Bereiche ausklappen": "Expand all sections",
  "Formate": "Formats",
  "Designs": "Designs",
  "Headline": "Headline",
  "Subheadline": "Subheadline",
  "CTA": "CTA",
  "Hinweis": "Note",
  "Print-Vorschau öffnen": "Open print preview",
  "Jetzt drucken": "Print now",
  "Desktop": "Desktop",
  "Auto": "Auto",
  "Button-Abstand": "Button spacing",
  "Links/Rechts Position": "Left/right position",
  "Max. Textbreite": "Max text width",
  "Abstand oben": "Top spacing",
  "Abstand unten": "Bottom spacing",
  "Schriftart": "Font family",
  "Button sichtbar": "Button visible",
  "Logo/Icon hochladen": "Upload logo/icon",
  "Klicke ein Element in der Vorschau an, um es hier direkt zu bearbeiten.":
    "Click an element in the preview to edit it here.",
  "Logo (Partnerprofil)": "Logo (partner profile)",
  "Footer Logo (Partnerprofil)": "Footer logo (partner profile)",
  "Partnername": "Partner name",
  "Badge-Icon": "Badge icon",
  "Badge-Text": "Badge text",
  "Top-Deal Bild": "Top deal image",
  "Top-Deal Label": "Top deal label",
  "Top-Deal Beschreibung": "Top deal description",
  "Top-Deal Button": "Top deal button",
  "Speisekarte Label": "Menu label",
  "Benefit 1 Titel": "Benefit 1 title",
  "Benefit 1 Text": "Benefit 1 text",
  "Benefit 2 Titel": "Benefit 2 title",
  "Benefit 2 Text": "Benefit 2 text",
  "Willkommensbonus Titel": "Welcome bonus title",
  "Kontakt Öffnungszeiten": "Contact opening hours",
  "Footer Vertrauen 1": "Footer trust 1",
  "Footer Vertrauen 2": "Footer trust 2",
  "Footer Vertrauen 3": "Footer trust 3",
  "Footer Vertrauen Icon 1": "Footer trust icon 1",
  "Footer Vertrauen Icon 2": "Footer trust icon 2",
  "Footer Vertrauen Icon 3": "Footer trust icon 3",
  "App QR-Code": "App QR code",
  "Benefit 1 Icon": "Benefit 1 icon",
  "Benefit 2 Icon": "Benefit 2 icon",
  "Ort Icon": "Location icon",
  "App-Banner Icon": "App banner icon",
  "Willkommensbonus Icon": "Welcome bonus icon",
  "Adresse Icon": "Address icon",
  "Telefon Icon": "Phone icon",
  "Benefitsi Footer Logo": "Benefitsi footer logo",
  "Reward 5": "Reward 5",
  "Reward 10": "Reward 10",
  "QR-Code": "QR code",
  "FAQ Frage": "FAQ question",
  "FAQ Antwort": "FAQ answer",
  "Vorschau aktiv: {fileName}. Zum dauerhaften Speichern bitte Entwurf speichern.":
    "Preview active: {fileName}. Save the draft to keep this change.",
  "Schüssel": "Bowl",
  "Lächeln": "Smile",
  "Tasche": "Bag",
  "Blatt": "Leaf",
  "Karte": "Card",
  "Familie": "Family",
  "Geschenk": "Gift",
  "Stern/Funkeln": "Spark",
  "Prozent": "Percent",
  "Stern": "Star",
  "Uhr": "Clock",
  "Haken": "Check",
  "Standort": "Location",
  "Schild": "Shield",
  "Datenschutz": "Privacy",
  "Lokal": "Local",
  "Kontakt Logo (Partnerprofil)": "Contact logo (partner profile)",
  "Startbereich Überschrift": "Hero headline",
  "Deals-Label": "Deals label",
  "Startbereich Slogan": "Hero slogan",
  "Primärer Button": "Primary button",
  "Sekundärer Button": "Secondary button",
  "Deals Intro Bild": "Deals intro image",
  "Deals Überschrift": "Deals headline",
  "Deals Slogan": "Deals slogan",
  "Deals Beschreibung": "Deals description",
  "Stempelkarte Überschrift": "Stamp card headline",
  "Stempelkarte Label": "Stamp card label",
  "Stempelkarte Slogan": "Stamp card slogan",
  "Über uns Label": "About label",
  "Über uns Überschrift": "About headline",
  "Über uns Text": "About text",
  "Über uns Hintergrundbild": "About background image",
  "Über uns Zutatenbild": "About ingredients image",
  "Über uns Ortsbild": "About location image",
  "Über uns Detailbild": "About detail image",
  "Kontakt Label": "Contact label",
  "Kontakt Standort Icon": "Contact location icon",
  "FAQ Überschrift": "FAQ headline",
  "Über uns Slogan": "About slogan",
  "Über uns Zusatztext": "About secondary text",
  "Über uns Dank": "About thank-you text",
  "Über uns Signatur": "About signature",
  "Kontakt Slogan": "Contact slogan",
  "Social-Media-Text": "Social media text",
  "Kontakt Adresse": "Contact address",
  "Kontakt Telefon": "Contact phone",
  "FAQ-Label": "FAQ label",
  "FAQ Text": "FAQ text",
  "Über uns Wert 1": "About value 1",
  "Über uns Wert 2": "About value 2",
  "Über uns Wert 3": "About value 3",
  "Über uns Wert 4": "About value 4",
  "App-Banner Label": "App banner label",
  "App Vorteil 1": "App benefit 1",
  "App Vorteil 2": "App benefit 2",
  "App Vorteil 3": "App benefit 3",
  "QR-Code Hinweis": "QR-code note",
  "QR-Code Text": "QR-code text",
  "App-Schaltfläche": "App button",
  "Stempelkarte Hinweis": "Stamp-card note",
  "Sicher & geprüft": "Safe & verified",
  "Öffnungszeiten Icon": "Opening-hours icon",
  "Über uns Icon 1": "About icon 1",
  "Über uns Icon 2": "About icon 2",
  "Über uns Icon 3": "About icon 3",
  "Über uns Icon 4": "About icon 4",
  "5 Stempel Belohnung": "5-stamp reward",
  "10 Stempel Belohnung": "10-stamp reward",
}

const normalizedBuilderTranslations = Object.fromEntries(
  Object.entries(builderTranslations).map(([key, value]) => [
    normalizeBuilderTranslationKey(key),
    value,
  ]),
)

const cp1252ByteOverrides: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f,
}

function decodeBuilderMojibake(text: string) {
  let current = text

  for (let index = 0; index < 4; index += 1) {
    if (!/[ÃÂâ]/.test(current)) {
      break
    }

    const bytes: number[] = []
    let canDecode = true

    for (const char of current) {
      const override = cp1252ByteOverrides[char]
      const codePoint = override ?? char.codePointAt(0)

      if (codePoint === undefined || codePoint > 0xff) {
        canDecode = false
        break
      }

      bytes.push(codePoint)
    }

    if (!canDecode) {
      break
    }

    const decoded = new TextDecoder("utf-8").decode(Uint8Array.from(bytes))

    if (decoded === current) {
      break
    }

    current = decoded
  }

  return current
}

function normalizeBuilderTranslationKey(text: string) {
  return decodeBuilderMojibake(text)
    .replace(/Ã¢â‚¬Â¦/g, "...")
    .replace(/Ã¢â€ â€™/g, "->")
    .replace(/Ã‚Â·/g, " ")
    .replace(/ÃƒÂ¼|Ã¼/gi, "u")
    .replace(/ÃƒÂ¶|Ã¶/gi, "o")
    .replace(/ÃƒÂ¤|Ã¤/gi, "a")
    .replace(/ÃƒÅ¸|ÃŸ/g, "ss")
    .replace(/ÃƒÂ©|Ã©/gi, "e")
    .replace(/ÃƒÂ¡|Ã¡/gi, "a")
    .replace(/â€“|â€”/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function repairBuilderText(text: string) {
  return decodeBuilderMojibake(text)
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦|Ã¢â‚¬Â¦/g, "...")
    .replace(/ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢|Ã¢â€ â€™/g, "→")
    .replace(/ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢|Ã¢Ë†â€™/g, "−")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|Ã¢â‚¬â€œ/g, "–")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â|Ã¢â‚¬â€/g, "—")
    .replace(/Ã¢â‚¬Â¹/g, "‹")
    .replace(/Ã¢â‚¬Âº/g, "›")
    .replace(/Ã¢Å“â€œ/g, "✓")
    .replace(/ÃƒÆ’Ã¢â‚¬Å¾|Ãƒâ€ž/g, "Ä")
    .replace(/ÃƒÆ’Ã¢â‚¬â€œ|Ãƒâ€“/g, "Ö")
    .replace(/ÃƒÆ’Ã…â€œ|ÃƒÅ“/g, "Ü")
    .replace(/ÃƒÆ’Ã‚Â¼|ÃƒÂ¼/g, "ü")
    .replace(/ÃƒÆ’Ã‚Â¶|ÃƒÂ¶/g, "ö")
    .replace(/ÃƒÆ’Ã‚Â¤|ÃƒÂ¤/g, "ä")
    .replace(/ÃƒÆ’Ã…Â¸|ÃƒÅ¸/g, "ß")
    .replace(/ÃƒÆ’Ã‚Â©|ÃƒÂ©/g, "é")
    .replace(/ÃƒÆ’Ã‚Â¡|ÃƒÂ¡/g, "á")
    .replace(/Ã‚Â·|Ãƒâ€šÃ‚Â·/g, "·")
    .replace(/Ãƒâ€š/g, "")
    .replace(/Ã‚/g, "")
}

function normalizeRepairedBuilderTranslationKey(text: string) {
  return repairBuilderText(text)
    .replace(/->|â†’/g, " ")
    .replace(/Ã‚Â·|Â·/g, " ")
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€|â€“|â€”|âˆ’/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const repairedNormalizedBuilderTranslations = Object.fromEntries(
  Object.entries(builderTranslations).map(([key, value]) => [
    normalizeRepairedBuilderTranslationKey(key),
    value,
  ]),
)

function translateBuilderText(locale: BuilderLocale, text: string): string {
  const repairedText = repairBuilderText(text)

  if (locale === "de" || !repairedText) {
    return repairedText
  }

  const directTranslation =
    builderTranslations[repairedText] ??
    repairedNormalizedBuilderTranslations[
      normalizeRepairedBuilderTranslationKey(repairedText)
    ] ??
    normalizedBuilderTranslations[normalizeBuilderTranslationKey(repairedText)]

  if (directTranslation) {
    return directTranslation
  }

  const navigationMatch = repairedText.match(/^Navigation (.+)$/)
  if (navigationMatch) {
    return `Navigation ${translateBuilderText(locale, navigationMatch[1])}`
  }

  const faqQuestionMatch = repairedText.match(/^FAQ Frage (\d+)$/)
  if (faqQuestionMatch) {
    return `FAQ question ${faqQuestionMatch[1]}`
  }

  const faqAnswerMatch = repairedText.match(/^FAQ Antwort (\d+)$/)
  if (faqAnswerMatch) {
    return `FAQ answer ${faqAnswerMatch[1]}`
  }

  const serviceIconMatch = repairedText.match(/^Service (\d+) Icon$/)
  if (serviceIconMatch) {
    return `Service ${serviceIconMatch[1]} icon`
  }

  const serviceTextMatch = repairedText.match(/^Service (\d+) Text$/)
  if (serviceTextMatch) {
    return `Service ${serviceTextMatch[1]} text`
  }

  const topDealBulletMatch = repairedText.match(/^Top-Deal Punkt (\d+)$/)
  if (topDealBulletMatch) {
    return `Top-deal bullet ${topDealBulletMatch[1]}`
  }

  const topDealBulletIconMatch = repairedText.match(/^Top-Deal Punkt (\d+) Icon$/)
  if (topDealBulletIconMatch) {
    return `Top-deal bullet ${topDealBulletIconMatch[1]} icon`
  }

  const stampMatch = repairedText.match(/^Stempel (\d+)$/)
  if (stampMatch) {
    return `Stamp ${stampMatch[1]}`
  }

  const stampIconMatch = repairedText.match(/^(\d+) Stempel Icon$/)
  if (stampIconMatch) {
    return `${stampIconMatch[1]}-stamp icon`
  }

  const stampRewardImageMatch = repairedText.match(/^(\d+) Stempel Belohnungsbild$/)
  if (stampRewardImageMatch) {
    return `${stampRewardImageMatch[1]}-stamp reward image`
  }

  const appBenefitIconMatch = repairedText.match(/^App Vorteil (\d+) Icon$/)
  if (appBenefitIconMatch) {
    return `App benefit ${appBenefitIconMatch[1]} icon`
  }

  return repairedText
    .replace(/(\d+)\s+EintrÃ¤ge\b/g, "$1 entries")
    .replace(/(\d+)\s+MenÃ¼s\b/g, "$1 menus")
    .replace(/(\d+)\s+EintrÃ¤ge\b/g, "$1 entries")
    .replace(/(\d+)\s+MenÃ¼s\b/g, "$1 menus")
    .replace(/(\d+)\s+Belohnungen\b/g, "$1 rewards")
    .replace(/^([A-Za-z]+) Button$/, "$1 button")
    .replace(/^([A-Za-z]+) Label$/, "$1 label")
    .replace(/^([A-Za-z]+) Logo\/Icon$/, "$1 logo/icon")
    .replace(/^Pflichtpunkte fehlen:/, "Missing required items:")
}

export function MicrositePanel({
  partner,
  fullscreen = false,
  previewBasePath = "/microsite-preview",
}: {
  partner: PartnerWithDeals
  fullscreen?: boolean
  previewBasePath?: string
}) {
  const initialConfig = resolveMicrositeConfig(
    partner.microsite?.draftVersion?.config ??
      partner.microsite?.publishedVersion?.config,
    partner,
  )
  const [config, setConfig] = useState<MicrositeConfig>(initialConfig)
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop")
  const [previewZoom, setPreviewZoom] = useState(fullscreen ? 0.85 : 1)
  const [selectedElementId, setSelectedElementId] = useState("hero.headline")
  const [editorPanelOpen, setEditorPanelOpen] = useState(true)
  const [editorPanelWidth, setEditorPanelWidth] = useState(360)
  const [allBuilderSectionsCollapsed, setAllBuilderSectionsCollapsed] = useState(true)
  const builderLocale = useSyncExternalStore<BuilderLocale>(
    subscribeToBuilderLocale,
    readBuilderLocaleSnapshot,
    () => "de",
  )
  const previewRef = useRef<HTMLDivElement | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const selectedElementPanelRef = useRef<HTMLDivElement | null>(null)
  const inlineTextOverridesInputRef = useRef<HTMLInputElement | null>(null)
  const inlineTextOverridesRef = useRef<Record<string, string>>({})
  const spacingDragRef = useRef<{
    id: string
    startY: number
    startMarginTop: number
    moved: boolean
  } | null>(null)
  const [state, formAction, pending] = useActionState(
    saveMicrositeVersion,
    initialState,
  )
  const assetOptions = Array.from(new Set([
    partner.logo_url,
    partner.feature_card_url,
    ...(partner.cover_urls || []),
    config.branding.partnerBadgeUrl,
    config.hero.backgroundImageUrl,
    config.deals.illustrationUrl,
    config.deals.topDealImageUrl,
    config.seo.ogImageUrl,
    ...config.assets.library.map((asset) => asset.url),
    ...Object.values(config.elementText).filter((value) => /^https?:\/\/|^\//.test(value)),
  ].filter((asset): asset is string => Boolean(asset))))
  const readinessReport = useMemo(
    () => createMicrositeReadinessReport(partner, config),
    [partner, config],
  )
  const selectedElement = getEditableElement(selectedElementId, config)
  const activeTemplatePreset =
    micrositeTemplatePresets.find((template) => template.id === config.template) ??
    micrositeTemplatePresets[0]
  const recommendedTemplateId = defaultMicrositeTemplateForPartner(partner)
  const previewIdentifier = partner.slug || partner.subdomain || partner.id || "partner"
  const previewStorageKey = `benefitsi:microsite-preview:${partner.id || partner.slug || "partner"}`
  const previewHref = `${previewBasePath}/${encodeURIComponent(previewIdentifier)}?source=builder`
  const publishBlocked = readinessReport.status === "blocked"
  const publishBlockers = readinessReport.items.filter(
    (item) => item.severity === "required" && !item.ok,
  )
  const zoomPercent = Math.round(previewZoom * 100)
  const tr = useMemo(
    () => (text: string) => translateBuilderText(builderLocale, text),
    [builderLocale],
  )
  const builderQuickSections = [
    ["selected", tr("Element")],
    ["templates", tr("Layout")],
    ["brand", tr("Marke")],
    ["hero", tr("Inhalt")],
    ["assets", tr("Assets")],
    ["seo", "SEO"],
    ["print", tr("Print")],
  ] as const
  const useViewportShell = fullscreen
  const inlineSidebarClasses = editorPanelOpen
    ? "min-h-[calc(100dvh-11rem)] max-h-[calc(100dvh-11rem)] overflow-x-hidden overflow-y-auto border-b lg:min-h-0 lg:max-h-[calc(100vh-1rem)] lg:border-b-0 lg:border-r"
    : "overflow-x-hidden border-b lg:sticky lg:top-4 lg:max-h-[calc(100vh-1rem)] lg:overflow-x-hidden lg:overflow-y-auto lg:border-b-0 lg:border-r"

  function setBuilderLocale(locale: BuilderLocale) {
    writeBuilderLocale(locale)
  }

  function syncBuilderSectionCollapseState() {
    const details = sidebarRef.current?.querySelectorAll<HTMLDetailsElement>("details")

    if (!details?.length) {
      return
    }

    setAllBuilderSectionsCollapsed(Array.from(details).every((item) => !item.open))
  }

  function toggleAllBuilderSections() {
    const details = sidebarRef.current?.querySelectorAll<HTMLDetailsElement>("details")

    if (!details?.length) {
      return
    }

    const nextOpen = allBuilderSectionsCollapsed
    details.forEach((item) => {
      item.open = nextOpen
    })
    setAllBuilderSectionsCollapsed(!nextOpen)
  }

  function jumpToBuilderSection(section: string) {
    const sidebar = sidebarRef.current
    const target = sidebar?.querySelector<HTMLElement>(`[data-builder-section="${section}"]`)

    if (!sidebar || !target) {
      return
    }

    const nestedDetails = target.querySelectorAll<HTMLDetailsElement>("details")

    nestedDetails.forEach((item) => {
      item.open = true
    })
    if (nestedDetails.length) {
      setAllBuilderSectionsCollapsed(false)
    }

    sidebar.scrollTo({
      top: Math.max(target.offsetTop - 28, 0),
      behavior: "smooth",
    })
  }

  useEffect(() => {
    const sidebar = sidebarRef.current

    if (!sidebar) {
      return
    }

    syncBuilderSectionCollapseState()

    const handleToggle = (event: Event) => {
      if (event.target instanceof HTMLDetailsElement) {
        syncBuilderSectionCollapseState()
      }
    }

    sidebar.addEventListener("toggle", handleToggle, true)

    return () => {
      sidebar.removeEventListener("toggle", handleToggle, true)
    }
  }, [editorPanelOpen])

  const previewToolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-zinc-700">{tr("Live-Vorschau")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-zinc-200 bg-white p-1">
          <button
            type="button"
            onClick={() => adjustPreviewZoom(-0.1)}
            className="grid size-8 place-items-center rounded text-sm font-black text-zinc-700 transition hover:bg-zinc-100"
            aria-label={tr("Preview herauszoomen")}
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setPreviewZoom(1)}
            className="h-8 min-w-14 rounded px-2 text-xs font-black text-zinc-700 transition hover:bg-zinc-100"
            title={tr("Zoom zurücksetzen")}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            onClick={() => adjustPreviewZoom(0.1)}
            className="grid size-8 place-items-center rounded text-sm font-black text-zinc-700 transition hover:bg-zinc-100"
            aria-label={tr("Preview reinzoomen")}
          >
            +
          </button>
        </div>
        <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1">
          {(["desktop", "mobile"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setViewport(item)}
              className={`rounded px-3 py-1.5 text-xs font-semibold ${
                viewport === item ? "bg-zinc-950 text-white" : "text-zinc-600"
              }`}
            >
              {item === "desktop" ? tr("Desktop") : tr("Mobil")}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  function adjustPreviewZoom(delta: number) {
    setPreviewZoom((current) =>
      Math.max(0.5, Math.min(1.5, Number((current + delta).toFixed(2)))),
    )
  }

  useEffect(() => {
    if (state.ok && state.config) {
      let cancelled = false

      queueMicrotask(() => {
        if (!cancelled && state.config) {
          setConfig(resolveMicrositeConfig(state.config, partner))
          inlineTextOverridesRef.current = {}

          if (inlineTextOverridesInputRef.current) {
            inlineTextOverridesInputRef.current.value = "{}"
          }
        }
      })

      return () => {
        cancelled = true
      }
    }
  }, [partner, state.config, state.ok])

  useEffect(() => {
    const root = previewRef.current

    if (!root) {
      return
    }

    root
      .querySelectorAll(".microsite-builder-selected")
      .forEach((element) =>
        element.classList.remove("microsite-builder-selected"),
      )

    root
      .querySelector(`[data-microsite-editable="${cssEscape(selectedElementId)}"]`)
      ?.classList.add("microsite-builder-selected")
  }, [selectedElementId, config])

  useEffect(() => {
    selectedElementPanelRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    })
  }, [selectedElementId])

  useEffect(() => {
    const root = previewRef.current

    if (!root) {
      return
    }

    root
      .querySelectorAll<HTMLElement>(
        '[data-microsite-editable-kind="text"]',
      )
      .forEach((element) => {
        element.contentEditable = "true"
        element.spellcheck = false
        element.dataset.builderInlineText = "true"
      })
  }, [config, previewZoom, viewport])

  function syncInlineTextOverride(id: string, value: string) {
    if (!id) {
      return
    }

    inlineTextOverridesRef.current = {
      ...inlineTextOverridesRef.current,
      [id]: value,
    }

    if (inlineTextOverridesInputRef.current) {
      inlineTextOverridesInputRef.current.value = JSON.stringify(
        inlineTextOverridesRef.current,
      )
    }
  }

  function handleInlineTextInput(event: FormEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    const editableTarget = target?.closest<HTMLElement>(
      '[data-microsite-editable-kind="text"]',
    )

    if (!editableTarget || !previewRef.current?.contains(editableTarget)) {
      return
    }

    const id = editableTarget.dataset.micrositeEditable || ""

    setSelectedElementId(id)
    syncInlineTextOverride(id, textFromEditableElement(editableTarget))
  }

  function handleInlineTextBlur(event: FocusEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    const editableTarget = target?.closest<HTMLElement>(
      '[data-microsite-editable-kind="text"]',
    )

    if (!editableTarget || !previewRef.current?.contains(editableTarget)) {
      return
    }

    const id = editableTarget.dataset.micrositeEditable || ""
    const value = textFromEditableElement(editableTarget)
    const element = getEditableElement(id, config)

    syncInlineTextOverride(id, value)

    if (element?.kind === "text") {
      setConfig((current) => element.update(current, value))
    }
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    const editableTarget = target?.closest<HTMLElement>(
      "[data-microsite-editable]",
    )

    if (!editableTarget || !previewRef.current?.contains(editableTarget)) {
      return
    }

    const kind = editableTarget.dataset.micrositeEditableKind
    const isInteractiveText =
      kind === "text" &&
      Boolean(editableTarget.closest("a, button, summary, input, textarea, select"))

    if (kind !== "text" || isInteractiveText) {
      event.preventDefault()
    }

    setSelectedElementId(editableTarget.dataset.micrositeEditable || "")
  }

  function handlePreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement | null
    const editableTarget = target?.closest<HTMLElement>(
      "[data-microsite-editable]",
    )

    if (!editableTarget || !previewRef.current?.contains(editableTarget)) {
      return
    }

    const id = editableTarget.dataset.micrositeEditable || ""

    if (!id) {
      return
    }

    setSelectedElementId(id)

    if (editableTarget.dataset.micrositeEditableKind === "text") {
      window.requestAnimationFrame(() => {
        placeCaretAtPoint(editableTarget, event.clientX, event.clientY)
      })
      return
    }

    spacingDragRef.current = {
      id,
      startY: event.clientY,
      startMarginTop: config.elementStyles[id]?.marginTop ?? 0,
      moved: false,
    }

    const handlePointerMove = (pointerEvent: globalThis.PointerEvent) => {
      const drag = spacingDragRef.current

      if (!drag) {
        return
      }

      const delta = Math.round(pointerEvent.clientY - drag.startY)

      if (Math.abs(delta) < 8 && !drag.moved) {
        return
      }

      drag.moved = true
      setElementStyle(setConfig, drag.id, {
        marginTop: Math.max(-120, Math.min(240, drag.startMarginTop + delta)),
      })
    }

    const handlePointerUp = () => {
      spacingDragRef.current = null
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp, { once: true })
  }

  function handleEditorResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") {
      return
    }

    if (!fullscreen || !editorPanelOpen || event.button !== 0) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    startEditorPanelResize(event.clientX)
  }

  function handleEditorResizeMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!fullscreen || !editorPanelOpen || event.button !== 0) {
      return
    }

    event.preventDefault()
    startEditorPanelResize(event.clientX, "mouse")
  }

  function startEditorPanelResize(
    resizeStartX: number,
    mode: "pointer" | "mouse" = "pointer",
  ) {
    const resizeStartWidth = editorPanelWidth

    const handleMove = (
      pointerEvent: globalThis.PointerEvent | globalThis.MouseEvent,
    ) => {
      setEditorPanelWidth(
        Math.max(
          280,
          Math.min(560, resizeStartWidth + pointerEvent.clientX - resizeStartX),
        ),
      )
    }

    const handleUp = () => {
      if (mode === "mouse") {
        window.removeEventListener("mousemove", handleMove)
        window.removeEventListener("mouseup", handleUp)
      } else {
        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", handleUp)
      }
    }

    if (mode === "mouse") {
      window.addEventListener("mousemove", handleMove)
      window.addEventListener("mouseup", handleUp, { once: true })
    } else {
      window.addEventListener("pointermove", handleMove)
      window.addEventListener("pointerup", handleUp, { once: true })
    }
  }

  return (
    <BuilderI18nContext.Provider
      value={{
        locale: builderLocale,
        setLocale: setBuilderLocale,
        tr,
      }}
    >
    <section
      className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm"
    >
      <header className="border-b border-zinc-200 bg-white">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
            {tr("Microsite")}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-normal">
            {tr(activeTemplatePreset.name)}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {tr(activeTemplatePreset.description)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white p-1">
            <span className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              {tr("Sprache")}
            </span>
            {(["de", "en"] as const).map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => setBuilderLocale(locale)}
                className={`rounded px-2.5 py-1 text-[11px] font-bold uppercase transition ${
                  builderLocale === locale
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {locale}
              </button>
            ))}
          </div>
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              window.localStorage.setItem(previewStorageKey, JSON.stringify(config))
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            {tr("Aktuelle Vorschau öffnen")}
          </a>
          <a
            href={`${previewBasePath}/${encodeURIComponent(previewIdentifier)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            {tr("Gespeicherten Entwurf öffnen")}
          </a>
          <StatusBadge
            label={partner.microsite?.publishedVersion ? "Live" : "Noch nicht live"}
            active={Boolean(partner.microsite?.publishedVersion)}
          />
          {partner.microsite?.status === "review" ? (
            <StatusBadge label="In Prüfung" tone="review" />
          ) : null}
          {partner.microsite?.draftVersion ? (
            <StatusBadge label="Entwurf vorhanden" active={false} />
          ) : null}
        </div>
        </div>
        {editorPanelOpen ? (
          <div
            className={`border-t border-zinc-200 px-5 py-3 ${
              fullscreen ? "sticky top-0 z-30 bg-white/95 backdrop-blur" : ""
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAllBuilderSections}
                title={allBuilderSectionsCollapsed ? tr("Alle Bereiche ausklappen") : tr("Alle Bereiche einklappen")}
                aria-label={allBuilderSectionsCollapsed ? tr("Alle Bereiche ausklappen") : tr("Alle Bereiche einklappen")}
                className="grid size-8 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-xs font-black text-zinc-700 shadow-sm transition hover:bg-zinc-50"
              >
                {allBuilderSectionsCollapsed ? "+" : "-"}
              </button>
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                {builderQuickSections.map(([section, label]) => (
                  <button
                    key={section}
                    type="button"
                    onClick={() => jumpToBuilderSection(section)}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </header>
      <form
        action={formAction}
        className={`grid gap-0 transition-[grid-template-columns] duration-200 ${
          useViewportShell
            ? "min-h-[calc(100vh-8rem)]"
            : editorPanelOpen
              ? "lg:grid-cols-[330px_minmax(0,1fr)]"
              : "lg:grid-cols-[56px_minmax(0,1fr)]"
        } ${!fullscreen ? (editorPanelOpen ? "lg:grid-cols-[330px_minmax(0,1fr)]" : "lg:grid-cols-[56px_minmax(0,1fr)]") : ""}`}
        style={
          fullscreen
            ? {
                gridTemplateColumns: editorPanelOpen
                  ? `${editorPanelWidth}px minmax(0,1fr)`
                  : "64px minmax(0,1fr)",
              }
            : undefined
        }
      >
        <input type="hidden" name="partner_id" value={partner.id || ""} />
        <input type="hidden" name="existing_config" value={JSON.stringify(config)} />
        <input
          ref={inlineTextOverridesInputRef}
          type="hidden"
          name="inline_text_overrides"
          defaultValue="{}"
        />
        <datalist id={`microsite-assets-${partner.id || "new"}`}>
          {assetOptions.map((asset) => (
            <option key={asset} value={asset} />
          ))}
        </datalist>

        <aside
          ref={sidebarRef}
          className={`relative min-w-0 self-start overflow-x-hidden border-zinc-200 bg-white ${
            fullscreen
              ? "sticky top-0 h-[calc(100vh-8rem)] max-h-[calc(100vh-8rem)] overflow-x-hidden overflow-y-auto border-r"
              : inlineSidebarClasses
          } ${editorPanelOpen ? "space-y-6 p-5" : "p-2"}`}
        >
          {fullscreen && editorPanelOpen ? (
            <div
              role="separator"
              aria-label={tr("Editorbreite ändern")}
              title={tr("Editorbreite per Ziehen ändern")}
              onPointerDown={handleEditorResizePointerDown}
              onMouseDown={handleEditorResizeMouseDown}
              className="absolute -right-1 top-0 z-50 h-full w-4 cursor-col-resize touch-none bg-transparent transition hover:bg-blue-200/70"
            />
          ) : null}
          <button
            type="button"
            onClick={() => setEditorPanelOpen((current) => !current)}
            aria-label={
              editorPanelOpen
                ? tr("Microsite-Bearbeitung einklappen")
                : tr("Microsite-Bearbeitung ausklappen")
            }
            aria-expanded={editorPanelOpen}
            className="mb-3 grid size-10 place-items-center rounded-md border border-zinc-200 bg-white text-lg font-bold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            {editorPanelOpen ? "<" : ">"}
          </button>

          {editorPanelOpen ? (
            <>
          <div
            ref={selectedElementPanelRef}
            data-builder-section="selected"
            className="relative min-w-0"
          >
            <SelectedElementPanel
              partner={partner}
              element={selectedElement}
              config={config}
              setConfig={setConfig}
              onInlineTextOverride={syncInlineTextOverride}
            />
          </div>
          <ReadinessPanel report={readinessReport} />
          <BuilderSectionsPanel onSelect={setSelectedElementId} />
          <div data-builder-section="templates">
            <TemplateSystemPanel
              recommendedTemplateId={recommendedTemplateId}
              selectedTemplateId={config.template}
              onApply={(templateId) =>
                setConfig((current) =>
                  applyMicrositeTemplatePreset(current, templateId),
                )
              }
            />
          </div>
          <DataSourcePanel partner={partner} />
          <MenuSystemPanel partner={partner} />
          <div data-builder-section="assets">
            <AssetReadinessPanel partner={partner} config={config} setConfig={setConfig} />
          </div>
          <VersionRollbackPanel partner={partner} setConfig={setConfig} />
          <div data-builder-section="seo">
            <SeoSystemPanel config={config} setConfig={setConfig} />
          </div>
          <BuilderChecklistPanel config={config} setConfig={setConfig} />
          <WorkflowPanel
            partner={partner}
            report={readinessReport}
            previewIdentifier={previewIdentifier}
          />

          <div data-builder-section="brand">
          <ConfigSection title="Marke">
            <ColorField
              name="accent"
              label="Akzentfarbe"
              value={config.branding.accent}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  branding: { ...current.branding, accent: value },
                }))
              }
            />
            <ColorField
              name="accent_secondary"
              label="Gradientfarbe"
              value={config.branding.accentSecondary}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  branding: { ...current.branding, accentSecondary: value },
                }))
              }
            />
            <SourceLockedField
              label="Logo"
              value={partner.logo_url || "Im Partnerprofil hinterlegen"}
              source="Partnerprofil → Media"
            />
            <EditorField
              name="partner_badge_url"
              label="Badge-Icon URL"
              value={config.branding.partnerBadgeUrl}
              onChange={(value) =>
                updateBranding(setConfig, "partnerBadgeUrl", value)
              }
              placeholder="https://..."
              list={`microsite-assets-${partner.id || "new"}`}
            />
            <AssetUploadField
              name="badge_file"
              label="Neues Badge-Icon hochladen"
              onPreview={(url) =>
                updateBranding(setConfig, "partnerBadgeUrl", url)
              }
            />
          </ConfigSection>
          </div>

          <div data-builder-section="hero">
          <ConfigSection title="Startbereich">
            <SourceLockedField
              label="Überschrift"
              value={config.hero.headline}
              source="Partnerprofil → Name"
            />
            <EditorField
              name="hero_slogan"
              label="Slogan"
              value={config.hero.slogan}
              onChange={(value) => updateHero(setConfig, "slogan", value)}
            />
            <SourceLockedField
              label="Ort"
              value={config.hero.locationText}
              source="Partnerprofil → Stadt/Adresse"
            />
            <SourceLockedField
              label="Öffnungszeiten"
              value={config.hero.openingText}
              source="Partnerprofil → Öffnungszeiten"
            />
            <EditorField
              name="hero_image_url"
              label="Startbild URL"
              value={config.hero.backgroundImageUrl}
              onChange={(value) =>
                updateHero(setConfig, "backgroundImageUrl", value)
              }
              list={`microsite-assets-${partner.id || "new"}`}
            />
            <AssetUploadField
              name="hero_file"
              label="Neues Startbild hochladen"
              onPreview={(url) =>
                updateHero(setConfig, "backgroundImageUrl", url)
              }
            />
          </ConfigSection>
          </div>

          <ConfigSection title="Deals & Vorteile">
            <EditorField
              name="deals_headline"
              label="Überschrift"
              value={config.deals.headline}
              onChange={(value) => updateDeals(setConfig, "headline", value)}
            />
            <EditorField
              name="deals_slogan"
              label="Slogan"
              value={config.deals.slogan}
              onChange={(value) => updateDeals(setConfig, "slogan", value)}
            />
            <EditorField
              name="deals_description"
              label="Beschreibung"
              value={config.deals.description}
              onChange={(value) => updateDeals(setConfig, "description", value)}
              multiline
            />
            <EditorField
              name="deals_illustration_url"
              label="Intro-Grafik URL"
              value={config.deals.illustrationUrl}
              onChange={(value) =>
                updateDeals(setConfig, "illustrationUrl", value)
              }
              list={`microsite-assets-${partner.id || "new"}`}
            />
            <AssetUploadField
              name="deals_illustration_file"
              label="Neue Intro-Grafik hochladen"
              onPreview={(url) =>
                updateDeals(setConfig, "illustrationUrl", url)
              }
            />
            <EditorField
              name="top_deal_headline"
              label="Top-Deal Überschrift"
              value={config.deals.topDealHeadline}
              onChange={(value) =>
                updateDeals(setConfig, "topDealHeadline", value)
              }
            />
            <EditorField
              name="top_deal_image_url"
              label="Top-Deal Bild URL"
              value={config.deals.topDealImageUrl}
              onChange={(value) =>
                updateDeals(setConfig, "topDealImageUrl", value)
              }
              list={`microsite-assets-${partner.id || "new"}`}
            />
            <AssetUploadField
              name="top_deal_file"
              label="Neues Top-Deal Bild hochladen"
              onPreview={(url) => updateDeals(setConfig, "topDealImageUrl", url)}
            />
          </ConfigSection>

          <ConfigSection title="Weitere Bereiche">
            <EditorField
              name="menu_headline"
              label="Speisekarte Überschrift"
              value={config.content.menuHeadline}
              onChange={(value) => updateContent(setConfig, "menuHeadline", value)}
            />
            <EditorField
              name="menu_description"
              label="Speisekarte Beschreibung"
              value={config.content.menuDescription}
              onChange={(value) =>
                updateContent(setConfig, "menuDescription", value)
              }
              multiline
            />
            <EditorField
              name="about_headline"
              label="Über-uns Überschrift"
              value={config.content.aboutHeadline}
              onChange={(value) =>
                updateContent(setConfig, "aboutHeadline", value)
              }
            />
            <EditorField
              name="about_text"
              label="Über-uns Text"
              value={config.content.aboutText}
              onChange={(value) => updateContent(setConfig, "aboutText", value)}
              multiline
            />
            <EditorField
              name="contact_headline"
              label="Kontakt Überschrift"
              value={config.content.contactHeadline}
              onChange={(value) =>
                updateContent(setConfig, "contactHeadline", value)
              }
            />
            <EditorField
              name="app_headline"
              label="App-Banner Überschrift"
              value={config.content.appHeadline}
              onChange={(value) => updateContent(setConfig, "appHeadline", value)}
            />
            <EditorField
              name="app_text"
              label="App-Banner Text"
              value={config.content.appText}
              onChange={(value) => updateContent(setConfig, "appText", value)}
              multiline
            />
            <EditorField
              name="footer_text"
              label="Footer-Text"
              value={config.content.footerText}
              onChange={(value) => updateContent(setConfig, "footerText", value)}
            />
          </ConfigSection>

          <ConfigSection title="Version & Notiz">
            <EditorField
              name="builder_version_note"
              label="Interne Versionsnotiz"
              value={config.builder.versionNote}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  builder: { ...current.builder, versionNote: value },
                }))
              }
              placeholder="z. B. Knobi Design finalisiert, mobile geprüft"
              multiline
            />
          </ConfigSection>

          <SocialMediaPanel partner={partner} config={config} setConfig={setConfig} />

          <div data-builder-section="print">
            <ConfigSection title="Print-Studio">
              <PrintableStudioPanel
                partner={partner}
                config={config}
                setConfig={setConfig}
                tr={tr}
              />
            </ConfigSection>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              name="intent"
              value="draft"
              disabled={pending}
              className="h-11 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 disabled:opacity-60"
            >
              {pending ? tr("Speichert…") : tr("Entwurf speichern")}
            </button>
            <button
              type="submit"
              name="intent"
              value="review"
              disabled={pending}
              className="h-11 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
            >
              {tr("Zur Prüfung markieren")}
            </button>
            <button
              type="submit"
              name="intent"
              value="approve"
              disabled={pending || publishBlocked}
              title={
                publishBlocked
                  ? tr("Freigabe erst nach erfüllten Pflichtchecks möglich")
                  : tr("Microsite intern freigeben")
              }
              className="h-11 rounded-md border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
            >
              {tr("Freigeben")}
            </button>
            <button
              type="submit"
              name="intent"
              value="publish"
              disabled={pending || publishBlocked}
              title={
                publishBlocked
                  ? `Pflichtpunkte fehlen: ${publishBlockers
                      .slice(0, 4)
                      .map((item) => tr(item.label))
                      .join(", ")}`
                  : tr("Diese Version live veröffentlichen")
              }
              className="h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {tr("Veröffentlichen")}
            </button>
            {publishBlocked ? (
              <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-700">
                {tr("Live-Publish ist gesperrt, bis alle Pflichtchecks erledigt sind. Entwurf und Prüfung bleiben möglich.")}
              </p>
            ) : null}
            {state.message ? (
              <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
                {tr(state.message)}
              </p>
            ) : null}
          </div>
            </>
          ) : (
            <div className="mt-4 flex justify-center">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 [writing-mode:vertical-rl]">
                {tr("Editor")}
              </span>
            </div>
          )}
        </aside>

        <div
          className={`min-w-0 overflow-hidden bg-zinc-50 ${
            useViewportShell ? "flex min-h-0 flex-col p-3" : "p-3 sm:p-5"
          }`}
        >
          <div className="mb-4">{previewToolbar}</div>{false ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-700">{tr("Live-Vorschau")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-md border border-zinc-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => adjustPreviewZoom(-0.1)}
                  className="grid size-8 place-items-center rounded text-sm font-black text-zinc-700 transition hover:bg-zinc-100"
                  aria-label={tr("Preview herauszoomen")}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(1)}
                  className="h-8 min-w-14 rounded px-2 text-xs font-black text-zinc-700 transition hover:bg-zinc-100"
                  title={tr("Zoom zurücksetzen")}
                >
                  {zoomPercent}%
                </button>
                <button
                  type="button"
                  onClick={() => adjustPreviewZoom(0.1)}
                  className="grid size-8 place-items-center rounded text-sm font-black text-zinc-700 transition hover:bg-zinc-100"
                  aria-label={tr("Preview reinzoomen")}
                >
                  +
                </button>
              </div>
              <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1">
                {(["desktop", "mobile"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setViewport(item)}
                    className={`rounded px-3 py-1.5 text-xs font-semibold ${
                      viewport === item ? "bg-zinc-950 text-white" : "text-zinc-600"
                    }`}
                  >
              {item === "desktop" ? tr("Desktop") : tr("Mobil")}
            </button>
                ))}
              </div>
            </div>
          </div>
          ) : null}
          <div
            ref={previewRef}
            onClickCapture={handlePreviewClick}
            onPointerDownCapture={handlePreviewPointerDown}
            onInputCapture={handleInlineTextInput}
            onBlurCapture={handleInlineTextBlur}
            className={`microsite-builder-surface mx-auto overflow-x-hidden overflow-y-auto transition-all ${
              viewport === "mobile"
                ? "w-full max-w-[390px]"
                : "w-full max-w-full"
            } ${useViewportShell ? "min-h-0 flex-1" : ""}`}
          >
            <div
              className={
                viewport === "mobile"
                  ? "w-full"
                  : "w-full min-w-0"
              }
              style={{
                zoom: previewZoom,
              }}
            >
              <MicrositeRenderer partner={partner} config={config} />
            </div>
          </div>
        </div>
      </form>
    </section>
    </BuilderI18nContext.Provider>
  )
}

type EditableElement = {
  id: string
  label: string
  kind: "text" | "image" | "icon" | "group"
  value: string
  update: (config: MicrositeConfig, value: string) => MicrositeConfig
  uploadName?: string
}

const themeIconOptions = [
  { value: "bag", label: "Tasche" },
  { value: "leaf", label: "Blatt" },
  { value: "card", label: "Karte" },
  { value: "people", label: "Familie" },
  { value: "gift", label: "Geschenk" },
  { value: "spark", label: "Stern/Funkeln" },
  { value: "percent", label: "Prozent" },
  { value: "star", label: "Stern" },
  { value: "clock", label: "Uhr" },
  { value: "check", label: "Haken" },
  { value: "pin", label: "Standort" },
  { value: "phone", label: "Telefon" },
  { value: "shield", label: "Schild" },
  { value: "privacy", label: "Datenschutz" },
  { value: "local", label: "Lokal" },
  { value: "bowl", label: "Schüssel" },
  { value: "smile", label: "Lächeln" },
  { value: "pizza", label: "Pizza" },
  { value: "website", label: "Website" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "google", label: "Google" },
  { value: "benefitsi", label: "Benefitsi" },
]

const socialPlatformOptions = [
  { id: "instagram", label: "Instagram", defaultVisible: true },
  { id: "facebook", label: "Facebook", defaultVisible: true },
  { id: "tiktok", label: "TikTok", defaultVisible: true },
  { id: "youtube", label: "YouTube", defaultVisible: false },
  { id: "whatsapp", label: "WhatsApp", defaultVisible: false },
  { id: "website", label: "Website", defaultVisible: false },
  { id: "google", label: "Google", defaultVisible: false },
  { id: "linkedin", label: "LinkedIn", defaultVisible: false },
] as const

const fontFamilyOptions = [
  { value: "", label: "Template-Schrift" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Brush Script MT, cursive", label: "Script" },
]

function ReadinessPanel({ report }: { report: MicrositeReadinessReport }) {
  const { tr } = useBuilderI18n()
  const blockedItems = report.items.filter(
    (item) => item.severity === "required" && !item.ok,
  )
  const nextItems = report.items.filter((item) => !item.ok).slice(0, 5)

  return (
    <ConfigSection title="Bereitschaft">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              {tr("Live-Bereitschaft")}
            </p>
            <p className="mt-1 text-2xl font-black tracking-[-0.05em] text-zinc-950">
              {report.score}%
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${
              report.status === "live-ready"
                ? "bg-emerald-100 text-emerald-800"
                : report.status === "blocked"
                  ? "bg-rose-100 text-rose-800"
                  : "bg-amber-100 text-amber-800"
            }`}
            >
              {report.status === "live-ready"
                ? tr("Live-bereit")
                : report.status === "blocked"
                  ? tr("Blockiert")
                  : tr("In Arbeit")}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <ReadinessMetric
            label="Pflicht"
            value={`${report.requiredDone}/${report.requiredTotal}`}
          />
          <ReadinessMetric
            label="Empfohlen"
            value={`${report.recommendedDone}/${report.recommendedTotal}`}
          />
        </div>
        {nextItems.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">
              {tr("Nächste Aufgaben")}
            </p>
            {nextItems.map((item) => (
              <ReadinessItemRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            {tr("Alle aktuellen Checks sind erfüllt.")}
          </p>
        )}
        {blockedItems.length ? (
          <p className="mt-3 text-xs leading-5 text-rose-700">
            {tr("Veröffentlichung erst nach den Pflichtpunkten empfehlen.")}
          </p>
        ) : null}
      </div>
    </ConfigSection>
  )
}

function ReadinessMetric({ label, value }: { label: string; value: string }) {
  const { tr } = useBuilderI18n()
  return (
    <div className="rounded-lg bg-zinc-50 p-3">
      <p className="font-semibold text-zinc-500">{tr(label)}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-950">{value}</p>
    </div>
  )
}

function ReadinessItemRow({
  item,
}: {
  item: MicrositeReadinessReport["items"][number]
}) {
  const { tr } = useBuilderI18n()
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-black ${
            item.ok ? "bg-emerald-500 text-white" : "bg-amber-400 text-white"
          }`}
        >
          {item.ok ? "\u2713" : "!"}
        </span>
        <div>
          <p className="text-xs font-bold text-zinc-900">{tr(item.label)}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">
            {tr(item.detail)}
          </p>
        </div>
      </div>
    </div>
  )
}

function BuilderSectionsPanel({
  onSelect,
}: {
  onSelect: (id: string) => void
}) {
  const { tr } = useBuilderI18n()
  const sections = [
    ["Top-Navigation", "navigation.group"],
    ["Startbereich", "hero.headline"],
    ["Deals & Vorteile", "deals.headline"],
    ["Top-Deal", "deals.topDealHeadline"],
    ["Stempelkarte", "stamps.headline"],
    ["Speisekarte", "content.menuHeadline"],
    ["Über uns", "content.aboutHeadline"],
    ["Kontakt", "content.contactHeadline"],
    ["FAQ", "content.faqHeadline"],
    ["Footer", "content.footerText"],
  ] as const

  return (
    <ConfigSection title="Builder-Bereiche">
      <div className="grid grid-cols-2 gap-2">
        {sections.map(([label, id]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-black text-zinc-800 transition hover:border-blue-300 hover:bg-blue-50"
          >
            {tr(label)}
          </button>
        ))}
      </div>
    </ConfigSection>
  )
}

function templatePreviewMeta(templateId: MicrositeTemplatePreset["id"]) {
  if (templateId === "restaurant-local") {
    return {
      category: "Local dining",
      mood: "Warm, regional, and story-led.",
      frame: "border-amber-200 bg-[#fff7ed]",
      badge: "bg-white text-amber-700",
      hero: "bg-[linear-gradient(135deg,#fed7aa_0%,#fdba74_48%,#0ea5e9_100%)]",
      cardStrong: "bg-white/95",
      cardSoft: "bg-amber-100/90",
      lineStrong: "bg-amber-700/80",
      lineSoft: "bg-sky-400/75",
      orb: "bg-sky-400/80",
    }
  }

  if (templateId === "restaurant-clean") {
    return {
      category: "Minimal food",
      mood: "Reduced, fast, and image-light.",
      frame: "border-zinc-200 bg-zinc-50",
      badge: "bg-white text-zinc-700",
      hero: "bg-[linear-gradient(135deg,#111827_0%,#334155_58%,#14b8a6_100%)]",
      cardStrong: "bg-white/95",
      cardSoft: "bg-zinc-200/90",
      lineStrong: "bg-zinc-700/80",
      lineSoft: "bg-teal-400/80",
      orb: "bg-teal-400/90",
    }
  }

  if (templateId === "salon-editorial") {
    return {
      category: "Beauty studio",
      mood: "Editorial, premium, and service-led.",
      frame: "border-rose-200 bg-[#fff1f2]",
      badge: "bg-white text-rose-700",
      hero: "bg-[linear-gradient(135deg,#fbcfe8_0%,#fda4af_52%,#b45309_100%)]",
      cardStrong: "bg-white/95",
      cardSoft: "bg-rose-100/90",
      lineStrong: "bg-rose-700/80",
      lineSoft: "bg-amber-500/75",
      orb: "bg-amber-500/80",
    }
  }

  if (templateId === "atelier-noir") {
    return {
      category: "Beauty noir",
      mood: "Dark, luxe, and fashion-forward.",
      frame: "border-amber-300 bg-[#17131c]",
      badge: "bg-white/10 text-amber-100",
      hero: "bg-[linear-gradient(135deg,#18111b_0%,#3b1f2e_46%,#f59e0b_100%)]",
      cardStrong: "bg-white/12",
      cardSoft: "bg-white/6",
      lineStrong: "bg-amber-300/90",
      lineSoft: "bg-rose-300/75",
      orb: "bg-rose-300/80",
    }
  }

  if (templateId === "wellness-serene") {
    return {
      category: "Wellness",
      mood: "Calm, restorative, and breathable.",
      frame: "border-emerald-200 bg-[#ecfdf5]",
      badge: "bg-white text-emerald-700",
      hero: "bg-[linear-gradient(135deg,#d1fae5_0%,#a7f3d0_50%,#93c5fd_100%)]",
      cardStrong: "bg-white/95",
      cardSoft: "bg-emerald-100/90",
      lineStrong: "bg-emerald-700/75",
      lineSoft: "bg-sky-400/75",
      orb: "bg-sky-300/90",
    }
  }

  if (templateId === "festival-neon") {
    return {
      category: "Nightlife",
      mood: "Electric, bold, and high-energy.",
      frame: "border-cyan-300 bg-[#07111f]",
      badge: "bg-white/10 text-cyan-100",
      hero: "bg-[linear-gradient(135deg,#07111f_0%,#2563eb_38%,#22d3ee_62%,#f43f5e_100%)]",
      cardStrong: "bg-white/12",
      cardSoft: "bg-white/6",
      lineStrong: "bg-cyan-300/90",
      lineSoft: "bg-rose-300/80",
      orb: "bg-cyan-300/80",
    }
  }

  if (templateId === "cinema-spotlight") {
    return {
      category: "Entertainment",
      mood: "High-contrast, event-forward, and dramatic.",
      frame: "border-fuchsia-300 bg-[#18181b]",
      badge: "bg-white/10 text-fuchsia-100",
      hero: "bg-[linear-gradient(135deg,#111827_0%,#7e22ce_48%,#e11d48_100%)]",
      cardStrong: "bg-white/10",
      cardSoft: "bg-white/5",
      lineStrong: "bg-rose-300/90",
      lineSoft: "bg-fuchsia-300/75",
      orb: "bg-fuchsia-400/80",
    }
  }

  return {
    category: "Restaurant",
    mood: "Emotional, offer-led, and conversion-focused.",
    frame: "border-amber-200 bg-[#fffbeb]",
    badge: "bg-white text-amber-700",
    hero: "bg-[linear-gradient(135deg,#f59e0b_0%,#f97316_46%,#16c4cc_100%)]",
    cardStrong: "bg-white/95",
    cardSoft: "bg-amber-100/90",
    lineStrong: "bg-amber-700/80",
    lineSoft: "bg-cyan-400/75",
    orb: "bg-cyan-400/85",
  }
}

function TemplateSystemPanel({
  recommendedTemplateId,
  selectedTemplateId,
  onApply,
}: {
  recommendedTemplateId: MicrositeTemplatePreset["id"]
  selectedTemplateId: MicrositeConfig["template"]
  onApply: (templateId: MicrositeTemplatePreset["id"]) => void
}) {
  const { tr } = useBuilderI18n()
  return (
    <ConfigSection title="Vorlagen">
      <div className="space-y-2">
        {micrositeTemplatePresets.map((template) => {
          const preview = templatePreviewMeta(template.id)

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onApply(template.id)}
              className={`w-full rounded-xl border p-2.5 text-left transition ${
                selectedTemplateId === template.id
                  ? "border-teal-400 bg-teal-50 shadow-[0_14px_35px_rgba(20,184,166,.12)]"
                  : "border-zinc-200 bg-white hover:border-teal-300 hover:bg-teal-50/60"
              }`}
            >
              <div className={`overflow-hidden rounded-xl border p-2.5 ${preview.frame}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${preview.badge}`}>
                    {preview.category}
                  </span>
                  <span className={`size-6 rounded-full ${preview.orb}`} />
                </div>
                <div className="mt-2.5 grid grid-cols-[minmax(0,1.2fr)_minmax(72px,.8fr)] gap-2">
                  <div className={`min-h-20 rounded-[1rem] ${preview.hero}`} />
                  <div className="grid gap-2">
                    <div className={`h-8 rounded-[0.85rem] ${preview.cardStrong}`} />
                    <div className={`h-10 rounded-[0.85rem] ${preview.cardSoft}`} />
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className={`h-2 w-12 rounded-full ${preview.lineStrong}`} />
                  <span className={`h-2 w-8 rounded-full ${preview.lineSoft}`} />
                </div>
              </div>
              <span className="mt-2.5 flex flex-wrap items-center gap-2 text-sm font-black text-zinc-950">
                <span>{tr(template.name)}</span>
                {recommendedTemplateId === template.id ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-teal-700">
                    Auto
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                {preview.mood}
              </span>
              <span className="mt-1 block text-[11px] leading-5 text-zinc-500">
                {tr(template.description)}
              </span>
            </button>
          )
        })}
      </div>
    </ConfigSection>
  )
}

function DataSourcePanel({ partner }: { partner: PartnerWithDeals }) {
  const { tr } = useBuilderI18n()
  const socialCount = partner.socials.filter((item) => Boolean(item.url || item.handle)).length
  const categoryLabel = partner.category?.filter(Boolean).join(", ") || "Fehlt"
  const rows = [
    ["Name", partner.name, "Partnerprofil"],
    ["Logo", partner.logo_url, "Partnerprofil / Medien"],
    ["Typ", partner.type, "Partnerprofil"],
    ["Kategorien", categoryLabel, "Partnerprofil"],
    ["Beschreibung", partner.description, "Partnerprofil"],
    ["Adresse", partner.address, "Partnerprofil"],
    ["Telefon", partner.phone, "Partnerprofil"],
    ["Website", partner.website, "Partnerprofil"],
    ["E-Mail", partner.email, "Partnerprofil"],
    ["Social Media", `${socialCount} Einträge`, "Partnerprofil"],
    ["Öffnungszeiten", `${partner.opening_hours.length} Einträge`, "Öffnungszeiten"],
    ["Speisekarte", `${partner.menus.length} Menüs`, "Menüs & Artikel"],
    ["Belohnungen", `${partner.reward_milestones.length} Belohnungen`, "Stempelkarte"],
    ["Microsite-Bilder", "Start/Deals/Über uns separat", "Microsite"],
    ["SEO", "Title/Description separat", "Microsite"],
  ]

  return (
    <ConfigSection title="Datenquellen">
      <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
        {rows.map(([label, value, source]) => (
          <div key={String(label)} className="flex items-start justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="font-bold text-zinc-800">{tr(String(label))}</p>
              <p className="mt-0.5 break-words text-zinc-500">
                {tr(String(value || "Fehlt"))}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 font-semibold text-zinc-600">
              {tr(String(source))}
            </span>
          </div>
        ))}
      </div>
    </ConfigSection>
  )
}

type AssetQualityTarget = {
  label: string
  value: string
  source: string
  slot: string
  minWidth: number
  minHeight: number
  preferredAspect?: number
  aspectTolerance?: number
}

type AssetQualitySnapshot = {
  status: "loading" | "ready" | "error"
  width?: number
  height?: number
}

function useAssetQualitySnapshots(urls: string[]) {
  const [snapshots, setSnapshots] = useState<Record<string, AssetQualitySnapshot>>({})
  const validUrlKey = JSON.stringify(Array.from(new Set(urls.filter(Boolean))))
  const validUrls = useMemo(() => JSON.parse(validUrlKey) as string[], [validUrlKey])

  useEffect(() => {
    if (!validUrls.length) {
      return
    }

    let cancelled = false

    validUrls.forEach((url) => {
      const image = new Image()

      image.onload = () => {
        if (cancelled) {
          return
        }

        setSnapshots((current) => ({
          ...current,
          [url]: {
            status: "ready",
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
        }))
      }

      image.onerror = () => {
        if (cancelled) {
          return
        }

        setSnapshots((current) => ({
          ...current,
          [url]: { status: "error" },
        }))
      }

      image.src = url
    })

    return () => {
      cancelled = true
    }
  }, [validUrls])

  return validUrls.reduce<Record<string, AssetQualitySnapshot>>((accumulator, url) => {
    if (snapshots[url]) {
      accumulator[url] = snapshots[url]
    }

    return accumulator
  }, {})
}

function evaluateAssetQuality(
  target: AssetQualityTarget,
  snapshot?: AssetQualitySnapshot,
) {
  if (!target.value) {
    return {
      tone: "missing" as const,
      label: "Missing",
      detail: `Upload at least ${target.minWidth} x ${target.minHeight}px.`,
    }
  }

  if (!snapshot || snapshot.status === "loading") {
    return {
      tone: "loading" as const,
      label: "Checking",
      detail: "Reading image size...",
    }
  }

  if (snapshot.status === "error" || !snapshot.width || !snapshot.height) {
    return {
      tone: "error" as const,
      label: "Broken",
      detail: "The image could not be loaded. Re-upload or replace it.",
    }
  }

  const resolutionTooSmall =
    snapshot.width < target.minWidth || snapshot.height < target.minHeight
  const aspectRatio =
    target.preferredAspect && snapshot.height
      ? snapshot.width / snapshot.height
      : undefined
  const aspectMismatch =
    typeof aspectRatio === "number" &&
    typeof target.preferredAspect === "number" &&
    Math.abs(aspectRatio - target.preferredAspect) >
      (target.aspectTolerance ?? 0.28)

  if (resolutionTooSmall) {
    return {
      tone: "warn" as const,
      label: "Low-res",
      detail: `Use at least ${target.minWidth} x ${target.minHeight}px. Current: ${snapshot.width} x ${snapshot.height}px.`,
    }
  }

  if (aspectMismatch) {
    return {
      tone: "warn" as const,
      label: "Aspect",
      detail: `The crop may feel awkward. Current: ${snapshot.width} x ${snapshot.height}px.`,
    }
  }

  return {
    tone: "good" as const,
    label: "Good",
    detail: `${snapshot.width} x ${snapshot.height}px`,
  }
}

function AssetReadinessPanel({
  partner,
  config,
  setConfig,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  const { tr } = useBuilderI18n()
  const rows: AssetQualityTarget[] = [
    { label: "Partnerlogo", value: partner.logo_url || "", source: "Profil", slot: "branding.logo", minWidth: 512, minHeight: 512, preferredAspect: 1, aspectTolerance: 0.2 },
    { label: "Feature-Karte", value: partner.feature_card_url || "", source: "Profil", slot: "partner.feature", minWidth: 1200, minHeight: 900, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    { label: "Startbild", value: config.hero.backgroundImageUrl, source: "Microsite", slot: "hero.backgroundImageUrl", minWidth: 1600, minHeight: 1200, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    { label: "Deals", value: config.deals.illustrationUrl, source: "Microsite", slot: "deals.illustrationUrl", minWidth: 1200, minHeight: 900, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    { label: "Top-Deal", value: config.deals.topDealImageUrl, source: "Microsite", slot: "deals.topDealImageUrl", minWidth: 1200, minHeight: 900, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    { label: "Über uns 1", value: config.elementText["content.aboutHeroImageUrl"] || "", source: "Microsite", slot: "content.aboutHeroImageUrl", minWidth: 1200, minHeight: 900, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    { label: "Über uns 2", value: config.elementText["content.aboutIngredientImageUrl"] || "", source: "Microsite", slot: "content.aboutIngredientImageUrl", minWidth: 1200, minHeight: 900, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    { label: "Reward 5", value: config.elementText["stamps.reward.5.image"] || "", source: "Microsite", slot: "stamps.reward.5.image", minWidth: 900, minHeight: 900, preferredAspect: 1, aspectTolerance: 0.2 },
    { label: "Reward 10", value: config.elementText["stamps.reward.10.image"] || "", source: "Microsite", slot: "stamps.reward.10.image", minWidth: 900, minHeight: 900, preferredAspect: 1, aspectTolerance: 0.2 },
    { label: "QR-Code", value: config.elementText["content.appQrCodeUrl"] || "", source: "Microsite", slot: "content.appQrCodeUrl", minWidth: 600, minHeight: 600, preferredAspect: 1, aspectTolerance: 0.12 },
  ]
  const assetSnapshots = useAssetQualitySnapshots(rows.map((row) => row.value))
  const qualityIssues = rows.filter((row) => {
    const quality = evaluateAssetQuality(row, assetSnapshots[row.value])
    return quality.tone === "warn" || quality.tone === "error" || quality.tone === "missing"
  })

  return (
    <ConfigSection title="Asset-Bibliothek">
      <details className="rounded-xl border border-zinc-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-black text-zinc-950">
          {tr("Asset-Status & Austauschbarkeit")}
        </summary>
        {qualityIssues.length ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            <p className="font-black">Auto photo audit</p>
            <p className="mt-1">
              {qualityIssues.length} asset{qualityIssues.length === 1 ? "" : "s"} need attention. Replace blurry or undersized photos before publishing or printing.
            </p>
          </div>
        ) : null}
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const quality = evaluateAssetQuality(row, assetSnapshots[row.value])
            const qualityToneClass =
              quality.tone === "good"
                ? "bg-emerald-100 text-emerald-700"
                : quality.tone === "loading"
                  ? "bg-zinc-200 text-zinc-700"
                  : quality.tone === "error"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-amber-100 text-amber-800"

            return (
              <div
                key={row.label}
                className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-lg bg-zinc-50 p-2 text-xs"
              >
                <div className="grid size-11 place-items-center overflow-hidden rounded-md border border-zinc-200 bg-white">
                  {row.value ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.value} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                      N/A
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-zinc-800">{tr(row.label)}</span>
                    <span className={row.value ? "text-emerald-700" : "text-amber-700"}>
                      {row.value ? `\u2713 ${tr("bereit")}` : tr("fehlt")}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${qualityToneClass}`}
                    >
                      {quality.label}
                    </span>
                    <p className="min-w-0 flex-1 text-[11px] leading-4 text-zinc-500">
                      {quality.detail}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-zinc-500">
                    {tr(row.source)} · {row.slot}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 border-t border-zinc-200 pt-3">
          <p className="text-xs font-black text-zinc-900">
            {tr("Gespeicherte Asset-Library")}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {config.assets.library.slice(-12).map((asset) => (
              <button
                key={`${asset.slot}-${asset.url}`}
                type="button"
                title={`${asset.label} · ${asset.slot}`}
                onClick={() => setConfig((current) => applyAssetToSlot(current, asset.slot, asset.url))}
                className="group overflow-hidden rounded-lg border border-zinc-200 bg-white text-left transition hover:border-teal-400"
              >
                <span className="block aspect-square bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="block truncate px-1.5 py-1 text-[10px] font-bold text-zinc-600 group-hover:text-teal-700">
                  {asset.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </details>
    </ConfigSection>
  )
}

function VersionRollbackPanel({
  partner,
  setConfig,
}: {
  partner: PartnerWithDeals
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  const { tr } = useBuilderI18n()
  const publishedConfig = partner.microsite?.publishedVersion?.config
  const draftConfig = partner.microsite?.draftVersion?.config

  return (
    <ConfigSection title="Versionierung & Rückgängig">
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <ReadinessMetric
            label="Entwurf"
            value={partner.microsite?.draftVersion?.version_number ? `v${partner.microsite.draftVersion.version_number}` : "—"}
          />
          <ReadinessMetric
            label="Live"
            value={partner.microsite?.publishedVersion?.version_number ? `v${partner.microsite.publishedVersion.version_number}` : "—"}
          />
        </div>
        <button
          type="button"
          disabled={!publishedConfig}
          onClick={() => {
            if (publishedConfig) {
              setConfig((current) => resolveMicrositeConfig(publishedConfig, { ...partner, logo_url: partner.logo_url || current.branding.logoUrl }))
            }
          }}
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-black text-zinc-800 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tr("Live-Version als Entwurf laden")}
        </button>
        <button
          type="button"
          disabled={!draftConfig}
          onClick={() => {
            if (draftConfig) {
              setConfig((current) => resolveMicrositeConfig(draftConfig, { ...partner, logo_url: partner.logo_url || current.branding.logoUrl }))
            }
          }}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-black text-zinc-800 transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tr("Gespeicherten Entwurf neu laden")}
        </button>
        <p className="text-[11px] leading-5 text-zinc-500">
          {tr("Jede Speicherung erzeugt eine neue Version. Veröffentlichen setzt nur die geprüfte Version live; alte Live-Versionen bleiben als Sicherheitsnetz erhalten.")}
        </p>
      </div>
    </ConfigSection>
  )
}

function MenuSystemPanel({ partner }: { partner: PartnerWithDeals }) {
  const menuItems = partner.menus.flatMap((menu) =>
    menu.categories.length
      ? menu.categories.flatMap((category) => category.items)
      : menu.items,
  )
  const imageCount = menuItems.filter((item) => item.image_url).length
  const priceCount = menuItems.filter((item) => item.price !== null && item.price !== "").length

  return (
    <ConfigSection title="Speisekarte-System">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs">
        <ReadinessMetric label="Artikel" value={`${menuItems.length}`} />
        <ReadinessMetric label="Preise" value={`${priceCount}/${menuItems.length}`} />
        <ReadinessMetric label="Bilder" value={`${imageCount}/${menuItems.length}`} />
        <ReadinessMetric label="Darstellung" value="Fenster + Platzhalter" />
      </div>
    </ConfigSection>
  )
}

function SeoSystemPanel({
  config,
  setConfig,
}: {
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  const { tr } = useBuilderI18n()
  return (
    <ConfigSection title="SEO / LLM">
      <EditorField
        name="seo_title"
        label="SEO-Titel"
        value={config.seo.title}
        onChange={(value) => updateSeo(setConfig, "title", value)}
      />
      <EditorField
        name="seo_description"
        label="SEO-Beschreibung"
        value={config.seo.description}
        onChange={(value) => updateSeo(setConfig, "description", value)}
        multiline
      />
      <EditorField
        name="seo_keywords"
        label="Suchbegriffe"
        value={config.seo.keywords.join(", ")}
        onChange={(value) =>
          setConfig((current) => ({
            ...current,
            seo: {
              ...current.seo,
              keywords: value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            },
          }))
        }
        placeholder={tr("Döner, Pizza, Annweiler, Benefitsi")}
      />
      <EditorField
        name="seo_og_image_url"
        label="Social-Vorschau-Bild URL"
        value={config.seo.ogImageUrl}
        onChange={(value) => updateSeo(setConfig, "ogImageUrl", value)}
      />
      <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs font-bold text-zinc-700">
        <input
          type="checkbox"
          checked={config.seo.noIndex}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              seo: { ...current.seo, noIndex: event.target.checked },
            }))
          }
        />
        {tr("Öffentliche Seite auf noindex setzen")}
      </label>
    </ConfigSection>
  )
}

function BuilderChecklistPanel({
  config,
  setConfig,
}: {
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  const { tr } = useBuilderI18n()
  const rows = [
    ["partnerDataReviewDone", "Partnerdaten geprüft"],
    ["assetReviewDone", "Assets/Fallbacks geprüft"],
    ["desktopQaDone", "Desktopprüfung abgeschlossen"],
    ["mobileQaDone", "Mobilprüfung abgeschlossen"],
    ["seoReviewDone", "SEO/LLM geprüft"],
    ["publishReviewDone", "Veröffentlichung final geprüft"],
  ] as const

  return (
    <ConfigSection title="Finale Checks">
      <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
        {rows.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-xs font-bold text-zinc-800">
            <input
              type="checkbox"
              checked={config.builder[key]}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  builder: {
                    ...current.builder,
                    [key]: event.target.checked,
                    lastQaAt: new Date().toISOString(),
                  },
                }))
              }
            />
            {tr(label)}
          </label>
        ))}
      </div>
    </ConfigSection>
  )
}

function WorkflowPanel({
  partner,
  report,
  previewIdentifier,
}: {
  partner: PartnerWithDeals
  report: MicrositeReadinessReport
  previewIdentifier: string
}) {
  const { tr } = useBuilderI18n()
  const steps = [
    ["1", "Partnerdaten prüfen", report.items.filter((item) => item.area === "Daten" && !item.ok).length === 0],
    ["2", "Assets bereit", report.items.filter((item) => item.area === "Assets" && !item.ok).length === 0],
    ["3", "Mobilprüfung", report.items.filter((item) => item.area === "Mobile" && !item.ok).length === 0],
    ["4", "SEO/LLM-Prüfung", report.items.filter((item) => item.area === "SEO & LLM" && !item.ok).length === 0],
    ["5", "Freigabe", partner.microsite?.status === "approved" || Boolean(partner.microsite?.publishedVersion)],
    ["6", "Live", Boolean(partner.microsite?.publishedVersion)],
  ] as const

  return (
    <ConfigSection title="Ablauf">
      <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
        {steps.map(([number, label, ok]) => (
          <div key={number} className="flex items-center gap-3 text-xs">
            <span className={`grid size-6 place-items-center rounded-full font-black ${ok ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-600"}`}>
              {ok ? "✓" : number}
            </span>
            <span className="font-semibold text-zinc-800">{tr(label)}</span>
          </div>
        ))}
        <p className="pt-2 text-[11px] leading-5 text-zinc-500">
          {tr("Partner-Self-Service sollte nur Daten, Speisekarte und Bilder freigeben – Layout bleibt intern geschützt.")}
        </p>
        <a
          href={`/partner-self-service/${encodeURIComponent(previewIdentifier)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-black text-zinc-800 transition hover:border-teal-300 hover:bg-teal-50"
        >
          {tr("Partner-Modus prüfen")}
        </a>
      </div>
    </ConfigSection>
  )
}

function SocialMediaPanel({
  partner,
  config,
  setConfig,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  return (
    <ConfigSection title="Social Media">
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
        {socialPlatformOptions.map((platform) => {
          const id = `social.${platform.id}`
          const visible = socialEnabledValue(
            config,
            platform.id,
            platform.defaultVisible,
          )

          return (
            <div key={platform.id} className="rounded-lg bg-zinc-50 p-3">
              <label className="flex items-center justify-between gap-3 text-xs font-black text-zinc-800">
                {platform.label}
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) =>
                    setConfig((current) =>
                      setElementTextValue(
                        current,
                        `${id}.enabled`,
                        event.target.checked ? "true" : "false",
                      ),
                    )
                  }
                />
              </label>
              <div className="mt-3 grid gap-2">
                <EditorField
                  name={`${id}_label`}
                  label="Beschriftung"
                  value={
                    config.elementText[`${id}.label`] ||
                    partnerSocialLabel(partner, platform.id) ||
                    platform.label
                  }
                  onChange={(value) =>
                    setConfig((current) =>
                      setElementTextValue(current, `${id}.label`, value),
                    )
                  }
                />
                <EditorField
                  name={`${id}_url`}
                  label="Link"
                  value={config.elementText[`${id}.url`] || partnerSocialUrl(partner, platform.id)}
                  onChange={(value) =>
                    setConfig((current) =>
                      setElementTextValue(current, `${id}.url`, value),
                    )
                  }
                  placeholder="https://..."
                />
                <EditorField
                  name={`${id}_icon_url`}
                  label="Logo-/Icon-URL"
                  value={config.elementText[`${id}.iconUrl`] || ""}
                  onChange={(value) =>
                    setConfig((current) =>
                      setElementTextValue(current, `${id}.iconUrl`, value),
                    )
                  }
                  placeholder="https://..."
                />
                <AssetUploadField
                  name={genericElementUploadName(`${id}.iconUrl`)}
                  label={`${platform.label} Logo hochladen`}
                  onPreview={(url) =>
                    setConfig((current) =>
                      setElementTextValue(current, `${id}.iconUrl`, url),
                    )
                  }
                />
              </div>
            </div>
          )
        })}
      </div>
    </ConfigSection>
  )
}

function SourceLockedField({
  label,
  value,
  source,
}: {
  label: string
  value: string
  source: string
}) {
  const { tr } = useBuilderI18n()
  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-zinc-700">{tr(label)}</span>
        <span className="rounded-full bg-white px-2 py-1 font-semibold text-teal-700">
          {tr(source)}
        </span>
      </div>
      <p className="break-words text-sm font-semibold text-zinc-950">{value}</p>
      <p className="text-[11px] leading-4 text-zinc-500">
        {tr("Dieses Feld wird zentral aus den Partnerdaten übernommen und bleibt für Skalierung synchron.")}
      </p>
    </div>
  )
}

function SelectedElementPanel({
  partner,
  element,
  config,
  setConfig,
  onInlineTextOverride,
}: {
  partner: PartnerWithDeals
  element: EditableElement | null
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
  onInlineTextOverride: (id: string, value: string) => void
}) {
  const { tr } = useBuilderI18n()
  if (!element) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
        {tr("Klicke ein Element in der Vorschau an, um es hier direkt zu bearbeiten.")}
      </div>
    )
  }

  const elementStyle = config.elementStyles[element.id] ?? {}
  const isText = element.kind === "text"
  const isIcon = element.kind === "icon"
  const isImage = element.kind === "image"
  const isGroup = element.kind === "group"
  const isNavigationGroup = element.id === "navigation.group"
  const socialGroupMatch = element.id.match(/^social\.([a-z]+)$/)
  const iconImageId = `${element.id}.image`

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
        {tr("Ausgewähltes Element")}
      </p>
      <h3 className="mt-1 text-sm font-semibold text-zinc-950">
        {tr(element.label)}
      </h3>

      <div className="mt-4 space-y-3">
        <p className="rounded-md bg-white/80 px-3 py-2 text-[11px] font-medium leading-5 text-zinc-600">
          {tr("Direkt im Builder: Text anklicken und tippen. Bilder und Gruppen kannst du anklicken und leicht nach oben/unten ziehen, um den Abstand zu verändern.")}
        </p>

        {isText ? (
          <EditorField
            name={`visual_${element.id}`}
            label="Text"
            value={element.value}
            onChange={(value) => {
              onInlineTextOverride(element.id, value)
              setConfig((current) => element.update(current, value))
            }}
            multiline={element.value.length > 48}
          />
        ) : null}

        {isImage ? (
          <>
            <EditorField
              name={`visual_${element.id}`}
              label="Bild URL"
              value={element.value}
              onChange={(value) =>
                setConfig((current) => element.update(current, value))
              }
            />
            {element.uploadName ? (
              <AssetUploadField
                name={element.uploadName}
                label="Bild hochladen und beim Speichern ersetzen"
                onPreview={(url) =>
                  setConfig((current) => element.update(current, url))
                }
              />
            ) : null}
          </>
        ) : null}

        {isIcon ? (
          <>
            <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
              {tr("Vorlagen-Icon")}
              <select
                value={element.value}
                onChange={(event) =>
                  setConfig((current) =>
                    element.update(current, event.target.value),
                  )
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              >
                {themeIconOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {tr(option.label)}
                  </option>
                ))}
              </select>
            </label>
            <EditorField
              name={`visual_${iconImageId}`}
              label="Eigenes Icon-Bild URL"
              value={config.elementText[iconImageId] || ""}
              onChange={(value) =>
                setConfig((current) => setElementTextValue(current, iconImageId, value))
              }
              placeholder="https://..."
            />
            <AssetUploadField
              name={genericElementUploadName(iconImageId)}
              label="Eigenes Icon hochladen"
              onPreview={(url) =>
                setConfig((current) => setElementTextValue(current, iconImageId, url))
              }
            />
          </>
        ) : null}

        {isNavigationGroup ? (
          <>
            <RangeField
              label="Top-Nav Höhe"
              min={52}
              max={150}
              value={elementStyle.height}
              emptyLabel="Auto"
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { height: value })
              }
            />
            <RangeField
              label="Button-Abstand"
              min={0}
              max={80}
              value={elementStyle.gap}
              emptyLabel="Auto"
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { gap: value })
              }
            />
            <RangeField
              label="Links/Rechts Position"
              min={-240}
              max={240}
              value={elementStyle.xOffset}
              emptyLabel="0px"
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { xOffset: value })
              }
            />
          </>
        ) : null}

        {socialGroupMatch ? (
          <SocialElementFields
            partner={partner}
            platform={socialGroupMatch[1]}
            config={config}
            setConfig={setConfig}
          />
        ) : null}

        {isText || isGroup ? (
          <>
            <RangeField
              label="Schriftgröße"
              min={10}
              max={120}
              value={elementStyle.fontSize}
              emptyLabel="Auto"
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { fontSize: value })
              }
            />
            <RangeField
              label="Max. Textbreite"
              min={120}
              max={1000}
              value={elementStyle.maxWidth}
              emptyLabel="Auto"
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { maxWidth: value })
              }
            />
            <RangeField
              label="Abstand oben"
              min={-120}
              max={240}
              value={elementStyle.marginTop}
              emptyLabel="0px"
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { marginTop: value })
              }
            />
            <RangeField
              label="Abstand unten"
              min={-120}
              max={240}
              value={elementStyle.marginBottom}
              emptyLabel="0px"
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { marginBottom: value })
              }
            />
            <div className="grid grid-cols-3 gap-2">
              <ToggleButton
                active={Boolean(elementStyle.bold)}
                label="B"
                onClick={() =>
                  setElementStyle(setConfig, element.id, {
                    bold: !elementStyle.bold,
                  })
                }
              />
              <ToggleButton
                active={Boolean(elementStyle.italic)}
                label="I"
                onClick={() =>
                  setElementStyle(setConfig, element.id, {
                    italic: !elementStyle.italic,
                  })
                }
              />
              <ToggleButton
                active={Boolean(elementStyle.underline)}
                label="U"
                onClick={() =>
                  setElementStyle(setConfig, element.id, {
                    underline: !elementStyle.underline,
                  })
                }
              />
            </div>
            <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
              {tr("Schriftart")}
              <select
                value={elementStyle.fontFamily ?? ""}
                onChange={(event) =>
                  setElementStyle(setConfig, element.id, {
                    fontFamily: event.target.value || undefined,
                  })
                }
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              >
                {fontFamilyOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <ElementColorField
              value={elementStyle.color ?? ""}
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { color: value })
              }
            />
          </>
        ) : null}

        {isIcon ? (
          <>
            <RangeField
              label="Icongröße"
              min={12}
              max={96}
              value={elementStyle.iconSize}
              emptyLabel="Auto"
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { iconSize: value })
              }
            />
            <ElementColorField
              value={elementStyle.color ?? ""}
              onChange={(value) =>
                setElementStyle(setConfig, element.id, { color: value })
              }
            />
          </>
        ) : null}

        {isImage ? (
          <RangeField
            label="Bildgröße"
            min={50}
            max={180}
            value={elementStyle.imageScale ?? 100}
            emptyLabel="100%"
            suffix="%"
            onChange={(value) =>
              setElementStyle(setConfig, element.id, {
                imageScale: value || 100,
              })
            }
          />
        ) : null}
      </div>
    </div>
  )
}

function SocialElementFields({
  partner,
  platform,
  config,
  setConfig,
}: {
  partner: PartnerWithDeals
  platform: string
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  const { tr } = useBuilderI18n()
  const id = `social.${platform}`
  const platformOption = socialPlatformOptions.find((item) => item.id === platform)
  const label = platformOption?.label ?? platform
  const defaultVisible = platformOption?.defaultVisible ?? false

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
      <label className="flex items-center justify-between gap-3 text-xs font-black text-zinc-800">
        {tr("Button sichtbar")}
        <input
          type="checkbox"
          checked={socialEnabledValue(config, platform, defaultVisible)}
          onChange={(event) =>
            setConfig((current) =>
              setElementTextValue(
                current,
                `${id}.enabled`,
                event.target.checked ? "true" : "false",
              ),
            )
          }
        />
      </label>
      <EditorField
        name={`${id}_selected_label`}
        label="Beschriftung"
        value={
          config.elementText[`${id}.label`] ||
          partnerSocialLabel(partner, platform) ||
          label
        }
        onChange={(value) =>
          setConfig((current) => setElementTextValue(current, `${id}.label`, value))
        }
      />
      <EditorField
        name={`${id}_selected_url`}
        label="Link"
        value={config.elementText[`${id}.url`] || partnerSocialUrl(partner, platform)}
        onChange={(value) =>
          setConfig((current) => setElementTextValue(current, `${id}.url`, value))
        }
        placeholder="https://..."
      />
      <EditorField
        name={`${id}_selected_icon_url`}
        label="Logo-/Icon-URL"
        value={config.elementText[`${id}.iconUrl`] || ""}
        onChange={(value) =>
          setConfig((current) =>
            setElementTextValue(current, `${id}.iconUrl`, value),
          )
        }
        placeholder="https://..."
      />
      <AssetUploadField
        name={genericElementUploadName(`${id}.iconUrl`)}
        label="Logo/Icon hochladen"
        onPreview={(url) =>
          setConfig((current) => setElementTextValue(current, `${id}.iconUrl`, url))
        }
      />
    </div>
  )
}

function RangeField({
  label,
  min,
  max,
  value,
  emptyLabel,
  suffix = "px",
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number | undefined
  emptyLabel: string
  suffix?: string
  onChange: (value: number | undefined) => void
}) {
  const { tr } = useBuilderI18n()
  const hasValue = value !== undefined
  const displayValue = hasValue ? value : min

  return (
    <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
      <span className="flex items-center justify-between gap-3">
        {tr(label)}
        <span className="text-sm font-semibold tabular-nums text-zinc-500">
          {hasValue ? `${value}${suffix}` : tr(emptyLabel)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={displayValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-teal-700"
      />
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className="text-[11px] font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
      >
        {tr("Zurück auf Auto")}
      </button>
    </label>
  )
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-md border text-sm font-black ${
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-300 bg-white text-zinc-800"
      }`}
    >
      {label}
    </button>
  )
}

function ElementColorField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string | undefined) => void
}) {
  const { tr } = useBuilderI18n()
  const displayValue = value || "#111111"

  return (
    <div className="space-y-1.5 text-xs font-medium text-zinc-600">
      {tr("Farbe")}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={displayValue}
          onChange={(event) => onChange(event.target.value)}
          aria-label={tr("Elementfarbe auswählen")}
          className="h-10 w-14 cursor-pointer rounded-md border border-zinc-300 bg-white p-1"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value || undefined)}
          placeholder={tr("Auto")}
          pattern="#[0-9a-fA-F]{6}"
          aria-label={tr("Elementfarbe Hex")}
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </div>
    </div>
  )
}

function getEditableElement(
  id: string,
  config: MicrositeConfig,
): EditableElement | null {
  const simpleElements: Record<
    string,
    Omit<EditableElement, "id" | "value"> & { value: string }
  > = {
    "branding.logo": {
      label: "Logo (Partnerprofil)",
      kind: "group",
      value: config.branding.logoUrl,
      update: (current) => current,
    },
    "footer.logo": {
      label: "Footer Logo (Partnerprofil)",
      kind: "group",
      value: config.branding.logoUrl,
      update: (current) => current,
    },
    "contact.logo": {
      label: "Kontakt Logo (Partnerprofil)",
      kind: "group",
      value: config.branding.logoUrl,
      update: (current) => current,
    },
    "branding.partnerName": textOverrideElement(
      "Partnername",
      config,
      "branding.partnerName",
      config.hero.headline,
    ),
    "branding.partnerBadgeUrl": {
      label: "Badge-Icon",
      kind: "image",
      value: config.branding.partnerBadgeUrl,
      uploadName: "badge_file",
      update: (current, value) => ({
        ...current,
        branding: { ...current.branding, partnerBadgeUrl: value },
      }),
    },
    "hero.backgroundImageUrl": {
      label: "Startbild",
      kind: "image",
      value: config.hero.backgroundImageUrl,
      uploadName: "hero_file",
      update: (current, value) => ({
        ...current,
        hero: { ...current.hero, backgroundImageUrl: value },
      }),
    },
    "hero.headline": textElement("Startbereich Überschrift", config.hero.headline, (current, value) => ({
      ...current,
      hero: { ...current.hero, headline: value },
    })),
    "deals.label": textElement("Deals-Label", config.deals.label, (current, value) => ({
      ...current,
      deals: { ...current.deals, label: value },
    })),
    "hero.slogan": textElement("Startbereich Slogan", config.hero.slogan, (current, value) => ({
      ...current,
      hero: { ...current.hero, slogan: value },
    })),
    "hero.locationText": textElement("Ort", config.hero.locationText, (current, value) => ({
      ...current,
      hero: { ...current.hero, locationText: value },
    })),
    "hero.openingText": textElement("Öffnungszeiten", config.hero.openingText, (current, value) => ({
      ...current,
      hero: { ...current.hero, openingText: value },
    })),
    "hero.badgeText": textElement("Badge-Text", config.hero.badgeText, (current, value) => ({
      ...current,
      hero: { ...current.hero, badgeText: value },
    })),
    "hero.primaryButtonLabel": textElement("Primärer Button", config.hero.primaryButtonLabel, (current, value) => ({
      ...current,
      hero: { ...current.hero, primaryButtonLabel: value },
    })),
    "hero.secondaryButtonLabel": textElement("Sekundärer Button", config.hero.secondaryButtonLabel, (current, value) => ({
      ...current,
      hero: { ...current.hero, secondaryButtonLabel: value },
    })),
    "deals.illustrationUrl": {
      label: "Deals Intro Bild",
      kind: "image",
      value: config.deals.illustrationUrl,
      uploadName: "deals_illustration_file",
      update: (current, value) => ({
        ...current,
        deals: { ...current.deals, illustrationUrl: value },
      }),
    },
    "deals.topDealImageUrl": {
      label: "Top-Deal Bild",
      kind: "image",
      value: config.deals.topDealImageUrl,
      uploadName: "top_deal_file",
      update: (current, value) => ({
        ...current,
        deals: { ...current.deals, topDealImageUrl: value },
      }),
    },
    "deals.headline": textElement("Deals Überschrift", config.deals.headline, (current, value) => ({
      ...current,
      deals: { ...current.deals, headline: value },
    })),
    "deals.slogan": textElement("Deals Slogan", config.deals.slogan, (current, value) => ({
      ...current,
      deals: { ...current.deals, slogan: value },
    })),
    "deals.description": textElement("Deals Beschreibung", config.deals.description, (current, value) => ({
      ...current,
      deals: { ...current.deals, description: value },
    })),
    "deals.topDealHeadline": textElement("Top-Deal Überschrift", config.deals.topDealHeadline, (current, value) => ({
      ...current,
      deals: { ...current.deals, topDealHeadline: value },
    })),
    "deals.topDealLabel": textElement("Top-Deal Label", config.deals.topDealLabel, (current, value) => ({
      ...current,
      deals: { ...current.deals, topDealLabel: value },
    })),
    "deals.topDealDescription": textElement("Top-Deal Beschreibung", config.deals.topDealDescription, (current, value) => ({
      ...current,
      deals: { ...current.deals, topDealDescription: value },
    })),
    "deals.topDealButtonLabel": textElement("Top-Deal Button", config.deals.topDealButtonLabel, (current, value) => ({
      ...current,
      deals: { ...current.deals, topDealButtonLabel: value },
    })),
    "stamps.headline": textElement("Stempelkarte Überschrift", config.stamps.headline, (current, value) => ({
      ...current,
      stamps: { ...current.stamps, headline: value },
    })),
    "stamps.label": textElement("Stempelkarte Label", config.stamps.label, (current, value) => ({
      ...current,
      stamps: { ...current.stamps, label: value },
    })),
    "stamps.slogan": textElement("Stempelkarte Slogan", config.stamps.slogan, (current, value) => ({
      ...current,
      stamps: { ...current.stamps, slogan: value },
    })),
    "content.menuLabel": textElement("Speisekarte Label", config.content.menuLabel, (current, value) => ({
      ...current,
      content: { ...current.content, menuLabel: value },
    })),
    "content.menuHeadline": textElement("Speisekarte Überschrift", config.content.menuHeadline, (current, value) => ({
      ...current,
      content: { ...current.content, menuHeadline: value },
    })),
    "content.menuDescription": textElement("Speisekarte Beschreibung", config.content.menuDescription, (current, value) => ({
      ...current,
      content: { ...current.content, menuDescription: value },
    })),
    "content.aboutLabel": textElement("Über uns Label", config.content.aboutLabel, (current, value) => ({
      ...current,
      content: { ...current.content, aboutLabel: value },
    })),
    "content.aboutHeadline": textElement("Über uns Überschrift", config.content.aboutHeadline, (current, value) => ({
      ...current,
      content: { ...current.content, aboutHeadline: value },
    })),
    "content.aboutText": textElement("Über uns Text", config.content.aboutText, (current, value) => ({
      ...current,
      content: { ...current.content, aboutText: value },
    })),
    "content.aboutHeroImageUrl": {
      label: "Über uns Hintergrundbild",
      kind: "image",
      value: config.elementText["content.aboutHeroImageUrl"] || "",
      uploadName: "about_hero_file",
      update: (current, value) => ({
        ...current,
        elementText: {
          ...current.elementText,
          "content.aboutHeroImageUrl": value,
        },
      }),
    },
    "content.aboutIngredientImageUrl": {
      label: "Über uns Zutatenbild",
      kind: "image",
      value: config.elementText["content.aboutIngredientImageUrl"] || "",
      uploadName: "about_ingredient_file",
      update: (current, value) => ({
        ...current,
        elementText: {
          ...current.elementText,
          "content.aboutIngredientImageUrl": value,
        },
      }),
    },
    "content.aboutLocationImageUrl": {
      label: "Über uns Ortsbild",
      kind: "image",
      value: config.elementText["content.aboutLocationImageUrl"] || "",
      uploadName: "about_location_file",
      update: (current, value) => ({
        ...current,
        elementText: {
          ...current.elementText,
          "content.aboutLocationImageUrl": value,
        },
      }),
    },
    "content.aboutPrepImageUrl": {
      label: "Über uns Detailbild",
      kind: "image",
      value: config.elementText["content.aboutPrepImageUrl"] || "",
      uploadName: "about_prep_file",
      update: (current, value) => ({
        ...current,
        elementText: {
          ...current.elementText,
          "content.aboutPrepImageUrl": value,
        },
      }),
    },
    "content.contactLabel": textElement("Kontakt Label", config.content.contactLabel, (current, value) => ({
      ...current,
      content: { ...current.content, contactLabel: value },
    })),
    "content.contactHeadline": textElement("Kontakt Überschrift", config.content.contactHeadline, (current, value) => ({
      ...current,
      content: { ...current.content, contactHeadline: value },
    })),
    "content.appHeadline": textElement("App-Banner Überschrift", config.content.appHeadline, (current, value) => ({
      ...current,
      content: { ...current.content, appHeadline: value },
    })),
    "content.appText": textElement("App-Banner Text", config.content.appText, (current, value) => ({
      ...current,
      content: { ...current.content, appText: value },
    })),
    "content.footerText": textElement("Footer-Text", config.content.footerText, (current, value) => ({
      ...current,
      content: { ...current.content, footerText: value },
    })),
  }

  if (simpleElements[id]) {
    return { id, ...simpleElements[id] }
  }

  if (id === "navigation.group") {
    return {
      id,
      label: "Top-Navigation",
      kind: "group",
      value: "Top-Navigation",
      update: (current) => current,
    }
  }

  if (id === "footer.benefitsiLogo") {
    return {
      id,
      label: "Benefitsi Footer Logo",
      kind: "image",
      value: config.elementText[id] || "",
      uploadName: genericElementUploadName(id),
      update: (current, value) => setElementTextValue(current, id, value),
    }
  }

  const socialGroupMatch = id.match(/^social\.([a-z]+)$/)

  if (socialGroupMatch) {
    const platform = socialPlatformOptions.find(
      (item) => item.id === socialGroupMatch[1],
    )

    return {
      id,
      label: `${platform?.label ?? socialGroupMatch[1]} Button`,
      kind: "group",
      value: platform?.label ?? socialGroupMatch[1],
      update: (current) => current,
    }
  }

  const socialImageMatch = id.match(/^social\.([a-z]+)\.iconUrl$/)

  if (socialImageMatch) {
    const platform = socialPlatformOptions.find(
      (item) => item.id === socialImageMatch[1],
    )

    return {
      id,
      label: `${platform?.label ?? socialImageMatch[1]} Logo/Icon`,
      kind: "image",
      value: config.elementText[id] || "",
      uploadName: genericElementUploadName(id),
      update: (current, value) => setElementTextValue(current, id, value),
    }
  }

  const socialLabelMatch = id.match(/^social\.([a-z]+)\.label$/)

  if (socialLabelMatch) {
    const platform = socialPlatformOptions.find(
      (item) => item.id === socialLabelMatch[1],
    )

    return {
      id,
      ...textOverrideElement(
        `${platform?.label ?? socialLabelMatch[1]} Label`,
        config,
        id,
        platform?.label ?? socialLabelMatch[1],
      ),
    }
  }

  const navLink = config.navigation.links.find(
    (link) => id === `navigation.${link.anchor}`,
  )

  if (navLink) {
    return {
      id,
      label: `Navigation ${navLink.label}`,
      kind: "text",
      value: config.elementText[id] || navLink.label,
      update: (current, value) => ({
        ...current,
        elementText: {
          ...current.elementText,
          [id]: value,
        },
      }),
    }
  }

  const topDealBulletMatch = id.match(/^deals\.topDealBullets\.(\d+)$/)

  if (topDealBulletMatch) {
    const index = Number(topDealBulletMatch[1])
    const bullet = config.deals.topDealBullets[index]

    if (!bullet) {
      return null
    }

    return {
      id,
      label: `Top-Deal Punkt ${index + 1}`,
      kind: "text",
      value: bullet,
      update: (current, value) => ({
        ...current,
        deals: {
          ...current.deals,
          topDealBullets: current.deals.topDealBullets.map((item, itemIndex) =>
            itemIndex === index ? value : item,
          ),
        },
      }),
    }
  }

  const stampNumberMatch = id.match(/^stamps\.number\.(\d+)$/)

  if (stampNumberMatch) {
    const number = stampNumberMatch[1]

    return {
      id,
      ...textOverrideElement(`Stempel ${number}`, config, id, number),
    }
  }

  const editableTextFallbacks: Record<string, { label: string; fallback: string }> = {
    "deals.benefit.0.title": {
      label: "Benefit 1 Titel",
      fallback: "Exklusive Partner Deals",
    },
    "deals.benefit.0.text": {
      label: "Benefit 1 Text",
      fallback: "Nur für Benefitsi Mitglieder",
    },
    "deals.benefit.1.title": {
      label: "Benefit 2 Titel",
      fallback: "Einfach & automatisch",
    },
    "deals.benefit.1.text": {
      label: "Benefit 2 Text",
      fallback: "Vorteile nutzen & sparen",
    },
    "stamps.reward.5.label": {
      label: "5 Stempel Belohnung",
      fallback: "Bonus",
    },
    "stamps.reward.10.label": {
      label: "10 Stempel Belohnung",
      fallback: "Hauptbelohnung",
    },
    "stamps.welcomeBonus.title": {
      label: "Willkommensbonus Titel",
      fallback: "Direkt 2 Stempel beim ersten Besuch.",
    },
    "content.aboutSlogan": {
      label: "Über uns Slogan",
      fallback: "Aus Leidenschaft für gutes Essen und unsere Heimat.",
    },
    "content.aboutTextSecond": {
      label: "Über uns Zusatztext",
      fallback:
        "Ob in der Mittagspause, nach der Wanderung oder beim Abendessen mit Freunden – wir sind für dich da. Schnell, lecker und immer mit einem Lächeln.",
    },
    "content.aboutThanks": {
      label: "Über uns Dank",
      fallback: "Danke, Annweiler – ihr seid die Besten!",
    },
    "content.aboutSignature": {
      label: "Über uns Signatur",
      fallback: "Euer Knobi-Team",
    },
    "content.contactSlogan": {
      label: "Kontakt Slogan",
      fallback: "Wir freuen uns auf dich.",
    },
    "content.contactOpening": {
      label: "Kontakt Öffnungszeiten",
      fallback: config.hero.openingText.replace("Heute geöffnet ·", "Täglich"),
    },
    "content.contactSocialText": {
      label: "Social-Media-Text",
      fallback: "Folge uns für Aktionen & Neuigkeiten.",
    },
    "content.contact.address": {
      label: "Kontakt Adresse",
      fallback: "Adresse im Admin ergänzen",
    },
    "content.contact.phone": {
      label: "Kontakt Telefon",
      fallback: "Telefon im Admin ergänzen",
    },
    "content.contact.opening": {
      label: "Kontakt Öffnungszeiten",
      fallback: config.hero.openingText.replace("Heute geöffnet ·", "Täglich"),
    },
    "content.faqLabel": {
      label: "FAQ-Label",
      fallback: "FAQ",
    },
    "content.faqHeadline": {
      label: "FAQ Überschrift",
      fallback: "Häufige Fragen. Schnelle Antworten.",
    },
    "content.faqText": {
      label: "FAQ Text",
      fallback:
        "Alles Wichtige zu deiner Benefitsi Mitgliedschaft und den Vorteilen bei Knobi Döner & Pizza Haus.",
    },
    "content.aboutValue.0": {
      label: "Über uns Wert 1",
      fallback: "Täglich frisch",
    },
    "content.aboutValue.1": {
      label: "Über uns Wert 2",
      fallback: "Hausgemachte Saucen",
    },
    "content.aboutValue.2": {
      label: "Über uns Wert 3",
      fallback: "Freundlicher Service",
    },
    "content.aboutValue.3": {
      label: "Über uns Wert 4",
      fallback: "Döner, Pizza und Fast Food",
    },
    "content.appKicker": {
      label: "App-Banner Label",
      fallback: "In der Benefitsi App",
    },
    "content.appBenefit.0": {
      label: "App Vorteil 1",
      fallback: "Stempelstand jederzeit einsehbar",
    },
    "content.appBenefit.1": {
      label: "App Vorteil 2",
      fallback: "Belohnungen automatisch freischalten",
    },
    "content.appBenefit.2": {
      label: "App Vorteil 3",
      fallback: "Einfach, schnell & digital",
    },
    "content.appQrLabel": {
      label: "QR-Code Hinweis",
      fallback: "App öffnen & einchecken",
    },
    "content.appQrText": {
      label: "QR-Code Text",
      fallback: "QR-Code scannen",
    },
    "content.appButtonLabel": {
      label: "App-Schaltfläche",
      fallback: "App öffnen",
    },
    "stamps.description": {
      label: "Stempelkarte Hinweis",
      fallback:
        "Belohnungen und benötigte Stempel werden direkt aus den Partnerdaten übernommen.",
    },
    "footer.trust.0.label": {
      label: "Footer Vertrauen 1",
      fallback: "Sicher & geprüft",
    },
    "footer.trust.1.label": {
      label: "Footer Vertrauen 2",
      fallback: "DSGVO konform",
    },
    "footer.trust.2.label": {
      label: "Footer Vertrauen 3",
      fallback: "Lokale Partner",
    },
  }

  if (editableTextFallbacks[id]) {
    const item = editableTextFallbacks[id]
    return { id, ...textOverrideElement(item.label, config, id, item.fallback) }
  }

  const rewardImageMatch = id.match(/^stamps\.reward\.(\d+)\.image$/)

  if (rewardImageMatch) {
    const stamp = rewardImageMatch[1]

    return {
      id,
      label: `${stamp} Stempel Belohnungsbild`,
      kind: "image",
      value: config.elementText[id] || "",
      uploadName: genericElementUploadName(id),
      update: (current, value) => ({
        ...current,
        elementText: {
          ...current.elementText,
          [id]: value,
        },
      }),
    }
  }

  if (id === "content.appQrCodeUrl") {
    return {
      id,
      label: "App QR-Code",
      kind: "image",
      value: config.elementText[id] || "",
      uploadName: "app_qr_code_file",
      update: (current, value) => ({
        ...current,
        elementText: {
          ...current.elementText,
          [id]: value,
        },
      }),
    }
  }

  if (id === "content.contactLocationIcon") {
    return {
      id,
      label: "Kontakt Standort Icon",
      kind: "image",
      value: config.elementText[id] || "/benefitsi-location-pin.png",
      uploadName: "contact_location_icon_file",
      update: (current, value) => ({
        ...current,
        elementText: {
          ...current.elementText,
          [id]: value,
        },
      }),
    }
  }

  const faqMatch = id.match(/^content\.faq\.(\d+)\.(question|answer)$/)

  if (faqMatch) {
    const index = Number(faqMatch[1])
    const field = faqMatch[2] as "question" | "answer"
    const faqFallbacks = [
      {
        question: "Wie funktioniert die Stempelkarte?",
        answer:
          "Nach deinem Besuch checkst du in der Benefitsi App ein und sammelst automatisch Stempel. Sobald eine Belohnung erreicht ist, wird sie in der App freigeschaltet.",
      },
      {
        question: "Welche Vorteile gibt es mit Premium?",
        answer:
          "Premium-Mitglieder erhalten zusätzliche Deals, exklusive Belohnungen und besondere Aktionen bei teilnehmenden lokalen Partnern.",
      },
      {
        question: "Wie nutze ich den 2 für 1 Deal?",
        answer:
          "Aktiviere den Vorteil vor deiner Bestellung in der App. Vor Ort zeigst du den aktiven Vorteil einfach beim Bezahlen vor.",
      },
      {
        question: "Brauche ich die Benefitsi App?",
        answer:
          "Ja, Deals, Stempel und Belohnungen werden digital in der App gesammelt und eingelöst.",
      },
      {
        question: "Kann ich online bestellen?",
        answer:
          "Wenn der Partner Online-Bestellung anbietet, findest du den passenden Button direkt auf der Microsite oder in der Benefitsi App.",
      },
      {
        question: "Kostet die Teilnahme etwas?",
        answer:
          "Viele Vorteile sind kostenlos nutzbar. Manche Premium-Vorteile sind Benefitsi Premium-Mitgliedern vorbehalten.",
      },
    ]
    const fallback = faqFallbacks[index]?.[field]

    if (!fallback) {
      return null
    }

    return {
      id,
      ...textOverrideElement(
        field === "question" ? `FAQ Frage ${index + 1}` : `FAQ Antwort ${index + 1}`,
        config,
        id,
        fallback,
      ),
    }
  }

  const benefitIconFallbacks: Record<string, { label: string; fallback: string }> = {
    "deals.benefit.0.icon": {
      label: "Benefit 1 Icon",
      fallback: "gift",
    },
    "deals.benefit.1.icon": {
      label: "Benefit 2 Icon",
      fallback: "spark",
    },
  }

  const genericIconFallbacks: Record<string, { label: string; fallback: string }> = {
    ...benefitIconFallbacks,
    "hero.locationIcon": {
      label: "Ort Icon",
      fallback: "pin",
    },
    "hero.openingIcon": {
      label: "Öffnungszeiten Icon",
      fallback: "status",
    },
    "content.appKicker.icon": {
      label: "App-Banner Icon",
      fallback: "benefitsi",
    },
    "stamps.welcomeBonus.icon": {
      label: "Willkommensbonus Icon",
      fallback: "check",
    },
    "content.aboutValue.0.icon": {
      label: "Über uns Icon 1",
      fallback: "leaf",
    },
    "content.aboutValue.1.icon": {
      label: "Über uns Icon 2",
      fallback: "bowl",
    },
    "content.aboutValue.2.icon": {
      label: "Über uns Icon 3",
      fallback: "smile",
    },
    "content.aboutValue.3.icon": {
      label: "Über uns Icon 4",
      fallback: "pizza",
    },
    "content.contact.address.icon": {
      label: "Adresse Icon",
      fallback: "pin",
    },
    "content.contact.phone.icon": {
      label: "Telefon Icon",
      fallback: "phone",
    },
    "content.contact.opening.icon": {
      label: "Öffnungszeiten Icon",
      fallback: "clock",
    },
    "footer.trust.0.icon": {
      label: "Footer Vertrauen Icon 1",
      fallback: "shield",
    },
    "footer.trust.1.icon": {
      label: "Footer Vertrauen Icon 2",
      fallback: "privacy",
    },
    "footer.trust.2.icon": {
      label: "Footer Vertrauen Icon 3",
      fallback: "local",
    },
  }

  const stampIconMatch = id.match(/^stamps\.(?:number|reward)\.(\d+)\.icon$/)

  if (stampIconMatch) {
    return {
      id,
      ...iconOverrideElement(
        `${stampIconMatch[1]} Stempel Icon`,
        config,
        id,
        id.includes(".reward.") ? "gift" : "check",
      ),
    }
  }

  if (genericIconFallbacks[id]) {
    const item = genericIconFallbacks[id]
    return { id, ...iconOverrideElement(item.label, config, id, item.fallback) }
  }

  const topDealBulletIconMatch = id.match(/^deals\.topDealBullets\.(\d+)\.icon$/)

  if (topDealBulletIconMatch) {
    return {
      id,
      ...iconOverrideElement(
        `Top-Deal Punkt ${Number(topDealBulletIconMatch[1]) + 1} Icon`,
        config,
        id,
        "check",
      ),
    }
  }

  const appBenefitIconMatch = id.match(/^content\.appBenefit\.(\d+)\.icon$/)

  if (appBenefitIconMatch) {
    return {
      id,
      ...iconOverrideElement(
        `App Vorteil ${Number(appBenefitIconMatch[1]) + 1} Icon`,
        config,
        id,
        "check",
      ),
    }
  }

  const serviceMatch = id.match(/^hero\.services\.(\d+)\.(label|icon)$/)

  if (serviceMatch) {
    const index = Number(serviceMatch[1])
    const field = serviceMatch[2]
    const service = config.hero.services[index]

    if (!service) {
      return null
    }

    return {
      id,
      label:
        field === "icon"
          ? `Service ${index + 1} Icon`
          : `Service ${index + 1} Text`,
      kind: field === "icon" ? "icon" : "text",
      value: field === "icon" ? service.icon : service.label,
      update: (current, value) => ({
        ...current,
        hero: {
          ...current.hero,
          services: current.hero.services.map((item, itemIndex) =>
            itemIndex === index ? { ...item, [field]: value } : item,
          ),
        },
      }),
    }
  }

  return null
}

function textElement(
  label: string,
  value: string,
  update: EditableElement["update"],
) {
  return {
    label,
    kind: "text" as const,
    value,
    update,
  }
}

function textOverrideElement(
  label: string,
  config: MicrositeConfig,
  id: string,
  fallback: string,
): Omit<EditableElement, "id"> {
  return textElement(label, config.elementText[id] || fallback, (current, value) => ({
    ...current,
    elementText: {
      ...current.elementText,
      [id]: value,
    },
  }))
}

function iconOverrideElement(
  label: string,
  config: MicrositeConfig,
  id: string,
  fallback: string,
): Omit<EditableElement, "id"> {
  return {
    label,
    kind: "icon",
    value: config.elementText[id] || fallback,
    update: (current, value) => setElementTextValue(current, id, value),
  }
}

function applyAssetToSlot(
  config: MicrositeConfig,
  slot: string,
  url: string,
): MicrositeConfig {
  switch (slot) {
    case "branding.partnerBadge":
      return { ...config, branding: { ...config.branding, partnerBadgeUrl: url } }
    case "hero.backgroundImageUrl":
      return { ...config, hero: { ...config.hero, backgroundImageUrl: url } }
    case "deals.illustrationUrl":
      return { ...config, deals: { ...config.deals, illustrationUrl: url } }
    case "deals.topDealImageUrl":
      return { ...config, deals: { ...config.deals, topDealImageUrl: url } }
    case "seo.ogImageUrl":
      return { ...config, seo: { ...config.seo, ogImageUrl: url } }
    default:
      if (slot.startsWith("content.") || slot.startsWith("stamps.") || slot.startsWith("social.") || slot.startsWith("footer.")) {
        return setElementTextValue(config, slot, url)
      }
      return config
  }
}

function setElementStyle(
  setter: Dispatch<SetStateAction<MicrositeConfig>>,
  id: string,
  patch: Partial<MicrositeConfig["elementStyles"][string]>,
) {
  setter((current) => {
    const nextStyle = {
      ...(current.elementStyles[id] ?? {}),
      ...patch,
    }

    for (const [key, value] of Object.entries(nextStyle)) {
      if (value === undefined || value === "") {
        delete nextStyle[key as keyof typeof nextStyle]
      }
    }

    return {
      ...current,
      elementStyles: {
        ...current.elementStyles,
        [id]: nextStyle,
      },
    }
  })
}

function cssEscape(value: string) {
  return value.replace(/["\\]/g, "\\$&")
}

function genericElementUploadName(id: string) {
  return `element_image_file__${encodeURIComponent(id)}`
}

function setElementTextValue(
  config: MicrositeConfig,
  id: string,
  value: string,
): MicrositeConfig {
  const nextElementText = {
    ...config.elementText,
  }

  if (value.trim()) {
    nextElementText[id] = value
  } else {
    delete nextElementText[id]
  }

  return {
    ...config,
    elementText: nextElementText,
  }
}

function socialEnabledValue(
  config: MicrositeConfig,
  platform: string,
  defaultVisible: boolean,
) {
  const value = config.elementText[`social.${platform}.enabled`]

  if (value === "true") {
    return true
  }

  if (value === "false") {
    return false
  }

  return defaultVisible
}

function textFromEditableElement(element: HTMLElement) {
  return element.innerText
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function placeCaretAtPoint(element: HTMLElement, x: number, y: number) {
  const ownerDocument = element.ownerDocument
  const selection = ownerDocument.defaultView?.getSelection()

  if (!selection) {
    return
  }

  const documentWithCaret = ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }

  let range: Range | null = null
  const caretPosition = documentWithCaret.caretPositionFromPoint?.(x, y)

  if (caretPosition) {
    range = ownerDocument.createRange()
    range.setStart(caretPosition.offsetNode, caretPosition.offset)
  } else {
    range = documentWithCaret.caretRangeFromPoint?.(x, y) ?? null
  }

  if (!range) {
    return
  }

  if (
    range.startContainer !== element &&
    !element.contains(range.startContainer)
  ) {
    return
  }

  element.focus({ preventScroll: true })
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  const { tr } = useBuilderI18n()
  return (
    <details className="min-w-0 space-y-3">
      <summary className="cursor-pointer break-words text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
        {tr(title)}
      </summary>
      <div className="min-w-0 space-y-3 pt-2">{children}</div>
    </details>
  )
}

function EditorField({
  name,
  label,
  value,
  onChange,
  placeholder,
  multiline,
  list,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  list?: string
}) {
  const { tr } = useBuilderI18n()
  const classes =
    "w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"

  return (
    <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
      {tr(label)}
      {multiline ? (
        <textarea
          name={name}
          value={value}
          placeholder={placeholder ? tr(placeholder) : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`${classes} min-h-20 py-2`}
        />
      ) : (
        <input
          name={name}
          value={value}
          placeholder={placeholder ? tr(placeholder) : undefined}
          list={list}
          onChange={(event) => onChange(event.target.value)}
          className={`${classes} h-10`}
        />
      )}
    </label>
  )
}

function ColorField({
  name,
  label,
  value,
  onChange,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const { tr } = useBuilderI18n()
  return (
    <div className="space-y-1.5 text-xs font-medium text-zinc-600">
      <span>{tr(label)}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-zinc-300 bg-white p-1"
          aria-label={`${tr(label)} Picker`}
        />
        <input
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          placeholder="#f59e0b"
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          aria-label={tr(label)}
        />
      </div>
    </div>
  )
}

function AssetUploadField({
  name,
  label,
  onPreview,
}: {
  name: string
  label: string
  onPreview?: (url: string) => void
}) {
  const { tr } = useBuilderI18n()
  const [fileName, setFileName] = useState("")

  return (
    <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
      {tr(label)}
      <input
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => {
          const file = event.target.files?.[0]

          setFileName(file?.name ?? "")

          if (file && onPreview) {
            onPreview(URL.createObjectURL(file))
          }
        }}
        className="block w-full rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-teal-50 file:px-2 file:py-1 file:font-semibold file:text-teal-800"
      />
      {fileName ? (
        <span className="block rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
          {tr("Vorschau aktiv: {fileName}. Zum dauerhaften Speichern bitte Entwurf speichern.").replace("{fileName}", fileName)}
        </span>
      ) : null}
    </label>
  )
}

function StatusBadge({
  label,
  active = false,
  tone,
}: {
  label: string
  active?: boolean
  tone?: "review"
}) {
  const { tr } = useBuilderI18n()
  const classes =
    tone === "review"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : active
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-amber-200 bg-amber-50 text-amber-700"

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-3 py-1 text-xs font-semibold leading-none ${classes}`}
    >
      {tr(label)}
    </span>
  )
}

function updateBranding(
  setter: Dispatch<SetStateAction<MicrositeConfig>>,
  key: keyof MicrositeConfig["branding"],
  value: string,
) {
  setter((current) => ({
    ...current,
    branding: { ...current.branding, [key]: value },
  }))
}

function updateHero(
  setter: Dispatch<SetStateAction<MicrositeConfig>>,
  key: Exclude<keyof MicrositeConfig["hero"], "services">,
  value: string,
) {
  setter((current) => ({
    ...current,
    hero: { ...current.hero, [key]: value },
  }))
}

function updateDeals(
  setter: Dispatch<SetStateAction<MicrositeConfig>>,
  key: Exclude<keyof MicrositeConfig["deals"], "topDealBullets">,
  value: string,
) {
  setter((current) => ({
    ...current,
    deals: { ...current.deals, [key]: value },
  }))
}

function updateContent(
  setter: Dispatch<SetStateAction<MicrositeConfig>>,
  key: keyof MicrositeConfig["content"],
  value: string,
) {
  setter((current) => ({
    ...current,
    content: { ...current.content, [key]: value },
  }))
}

function updateSeo(
  setter: Dispatch<SetStateAction<MicrositeConfig>>,
  key: Exclude<keyof MicrositeConfig["seo"], "keywords" | "noIndex">,
  value: string,
) {
  setter((current) => ({
    ...current,
    seo: { ...current.seo, [key]: value },
  }))
}
