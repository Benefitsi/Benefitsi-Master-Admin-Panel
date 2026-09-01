"use client"

import {
  useActionState,
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
  type Dispatch,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react"
import { useRouter } from "next/navigation"
import type { PartnerWithDeals } from "@/lib/admin-data"
import {
  createDefaultMicrositeConfig,
  resolveMicrositeConfig,
  type MicrositeConfig,
} from "@/lib/microsites"
import {
  createMicrositeReadinessReport,
  micrositeReadinessEnglishTranslations,
  type MicrositeReadinessReport,
} from "@/lib/microsite-readiness"
import { micrositeTemplatePresets } from "@/lib/microsite-templates"
import { MicrositeRenderer } from "@/components/microsite/microsite-renderer"
import { PrintableStudioPanel } from "@/components/microsite/printable-studio-panel"
import { LoadingSpinner } from "@/components/loading-ui"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ImageOff,
  RotateCcw,
} from "lucide-react"
import { useAdminLanguage } from "./admin-language"
import {
  defaultMicrositeCopyForPartner,
  inferMicrositePartnerProfile,
  partnerSocialLabel,
  partnerSocialUrl,
} from "@/lib/microsite-personalization"
import { extractThemePalette } from "@/lib/logo-palette"
import { isMicrositeTwoForOneDeal } from "@/lib/microsite-deals"
import {
  micrositeMenuItemDisplayName,
  micrositeMenuItemImageId,
  micrositeMenuItemKey,
  micrositeMenuPreviewItems,
  micrositeMenuItemVisibilityId,
} from "@/lib/microsite-menu"
import { saveMicrositeVersion, type MicrositeActionState } from "./microsite-actions"

const initialState: MicrositeActionState = { ok: false, message: "" }
type BuilderLocale = "de" | "en"
const MICROSITE_UPLOADS_CLEARED_EVENT = "benefitsi:microsite-uploads-cleared"
const MAX_MICROSITE_ASSET_BYTES = 10 * 1024 * 1024
const MAX_MICROSITE_UPLOAD_BYTES = 20 * 1024 * 1024
const ALLOWED_MICROSITE_ASSET_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
])

async function saveMicrositeVersionWithFallback(
  previousState: MicrositeActionState,
  formData: FormData,
): Promise<MicrositeActionState> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      ok: false,
      message:
        "Speichern fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.",
    }
  }

  try {
    return await saveMicrositeVersion(previousState, formData)
  } catch (error) {
    console.error("[microsite:save] request failed before completion", error)
    return {
      ok: false,
      message:
        "Speichern fehlgeschlagen. Bitte Internetverbindung prüfen, die Seite neu laden und erneut versuchen.",
    }
  }
}

type BuilderI18nValue = {
  locale: BuilderLocale
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

const builderTranslations: Record<string, string> = {
  ...micrositeReadinessEnglishTranslations,
  "Microsite": "Microsite",
  "Restaurant-Premium-Vorlage": "Restaurant premium template",
  "Für Mobilgeräte optimierte Vorlage · Daten vom Partnerprofil · versionierte Veröffentlichung":
    "Mobile-first template · partner-profile data · versioned publishing",
  "Aktuelle Vorschau öffnen": "Open current preview",
  "Gespeicherten Entwurf öffnen": "Open saved draft",
  "Noch nicht live": "Not live yet",
  "In Prüfung": "In review",
  "Entwurf vorhanden": "Draft available",
  "Bearbeitung: gespeicherter Entwurf": "Editing: saved draft",
  "Bearbeitung: aktuelle Live-Version": "Editing: current live version",
  "Bearbeitung: aktuelle Partnerdaten": "Editing: current partner data",
  "Der Builder lädt gespeicherte Entwürfe standardmäßig zuerst.": "The builder loads saved drafts first by default.",
  "Entwurf verwerfen und aktuelle Version laden": "Discard draft and load current version",
  "Entwurf wirklich verwerfen? Die aktuelle Live-Version wird anschließend geladen.": "Discard this draft? The current live version will be loaded afterward.",
  "Entwurf wird verworfen…": "Discarding draft...",
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
  "Vorteile & Aktionen": "Benefits & campaigns",
  "Beschreibung": "Description",
  "Intro-Grafik URL": "Intro image URL",
  "Neue Intro-Grafik hochladen": "Upload new intro image",
  "Vorteil Überschrift": "Benefit headline",
  "Vorteil Bild URL": "Benefit image URL",
  "Neues Vorteil Bild hochladen": "Upload new benefit image",
  "Slogan": "Slogan",
  "Weitere Bereiche": "More sections",
  "Speisekarte Überschrift": "Menu headline",
  "Speisekarte Beschreibung": "Menu description",
  "Menübilder": "Menu images",
  "Großes Hauptbild": "Large featured image",
  "Großes Menübild": "Large menu image",
  "Angezeigtes Hauptgericht": "Featured menu item",
  "Wähle das Gericht für die große Karte aus.": "Choose the dish used for the large card.",
  "Kleines Menübild": "Small menu image",
  "Bild anzeigen": "Show image",
  "Ohne Bild": "No image",
  "Partnerbild verwenden": "Use partner image",
  "Aus Asset-Bibliothek wählen": "Choose from asset library",
  "Bild auswählen": "Choose image",
  "Die ersten fünf Gerichte bilden die Microsite-Vorschau. Das erste Bild wird groß dargestellt.":
    "The first five dishes form the microsite preview. The first image is displayed prominently.",
  "Die ersten sechs Gerichte bilden die Microsite-Vorschau. Das erste Bild wird groß dargestellt.":
    "The first six dishes form the microsite preview. The first image is displayed prominently.",
  "Bis zu sechs direkte Instagram-Post-/Reel- oder TikTok-Video-URLs eintragen. Der Instagram-Bereich erscheint erst, wenn mindestens zwei gültige Instagram-Beiträge hinterlegt sind.":
    "Add up to six direct Instagram post/reel or TikTok video URLs. The Instagram section appears only when at least two valid Instagram posts are configured.",
  "Instagram benötigt mindestens zwei Beiträge, bevor der Bereich auf der Microsite angezeigt wird.":
    "Instagram needs at least two posts before the section is shown on the microsite.",
  "gültige Beiträge": "valid posts",
  "Bitte einen direkten Post-, Reel- oder Video-Link verwenden, keinen Profil-Link.":
    "Use a direct post, reel, or video link rather than a profile link.",
  "Bild hochladen oder aus der Bibliothek zuweisen":
    "Upload an image or assign one from the library",
  "Ziel auswählen, anschließend ein neues Bild hochladen oder unten ein vorhandenes Bild anklicken. Die Änderung erscheint sofort in der Vorschau und wird mit dem Entwurf gespeichert.":
    "Choose a target, then upload a new image or click an existing image below. The change appears immediately in the preview and is saved with the draft.",
  "Bildposition": "Image position",
  "Neues Bild direkt zur Asset-Bibliothek hinzufügen":
    "Add a new image directly to the asset library",
  "Für ausgewählte Bildposition verwenden": "Use for the selected image position",
  "Hier verwenden": "Use here",
  "Über-uns Überschrift": "About headline",
  "Über-uns Text": "About text",
  "Partner-Zitat": "Partner quote",
  "Zitat-Absender": "Quote attribution",
  "Kontakt Überschrift": "Contact headline",
  "App-Banner Überschrift": "App banner headline",
  "App-Banner Text": "App banner text",
  "App & Vorteile": "App & benefits",
  "App Vorteile Überschrift": "App benefits headline",
  "App Vorteile Text": "App benefits text",
  "Über uns & Kontakt": "About & contact",
  "iPhone App-Screenshot URL": "iPhone app screenshot URL",
  "Neuen iPhone App-Screenshot hochladen": "Upload new iPhone app screenshot",
  "App-Vorschau": "App preview",
  "Bild im Telefon-Mockup URL": "Phone mockup image URL",
  "Neues Bild für das Telefon-Mockup hochladen": "Upload a new phone mockup image",
  "Dieses Bild wird direkt im schwarzen Telefonrahmen angezeigt. Du kannst es auch in der Vorschau anklicken.":
    "This image appears directly inside the black phone frame. You can also click it in the preview.",
  "Bild im Telefon-Mockup": "Phone mockup image",
  "Footer-Text": "Footer text",
  "Version & Notiz": "Version & note",
  "Interne Versionsnotiz": "Internal version note",
  "z. B. Knobi Design finalisiert, mobile geprüft":
    "e.g. Knobi design finalized, mobile QA done",
  "Speichert…": "Saving...",
  "Entwurf speichern": "Save draft",
  "Speichern fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.":
    "Save failed. Check the internet connection and try again.",
  "Speichern fehlgeschlagen. Bitte Internetverbindung prüfen, die Seite neu laden und erneut versuchen.":
    "Save failed. Check the internet connection, reload the page, and try again.",
  "Die Microsite wurde gleichzeitig an anderer Stelle gespeichert. Bitte erneut versuchen.":
    "The microsite was saved somewhere else at the same time. Please try again.",
  "Die ausgewählten Bilder sind zusammen zu groß. Bitte weniger Bilder gleichzeitig speichern (maximal 20 MB).":
    "The selected images are too large in total. Save fewer images at once (maximum 20 MB).",
  "Auf Standard zurücksetzen": "Reset to defaults",
  "Alle Microsite-Einstellungen auf die aktuellen Partner-Standardwerte zurücksetzen? Nicht gespeicherte Änderungen gehen verloren.":
    "Reset all microsite settings to the current partner defaults? Unsaved changes will be lost.",
  "erledigt": "done",
  "Checkliste": "Checklist",
  "Nur ein fehlender Partnername blockiert die Veröffentlichung. Alle anderen Punkte sind Empfehlungen.":
    "Only a missing partner name blocks publishing. Every other item is a recommendation.",
  "Live-Publish ist gesperrt, bis alle Pflichtchecks erledigt sind.":
    "Live publish is locked until all required checks are complete.",
  "Warum ist Veröffentlichen gesperrt?": "Why is publishing locked?",
  "Alle Pflichtchecks sind erledigt. Veröffentlichen ist freigeschaltet.":
    "All required checks are complete. Publishing is unlocked.",
  "Pflichtchecks": "required checks",
  "Der aktuelle Entwurf kann jetzt veröffentlicht werden.":
    "The current draft can now be published.",
  "Checkliste öffnen": "Open checklist",
  "Noch offene Pflichtpunkte": "Required items still open",
  "Assets geprüft": "Assets reviewed",
  "Indexierung aktiv": "Indexing enabled",
  "Strukturierte Daten": "Structured data",
  "Vorschau noindex": "Preview noindex",
  "Responsives Layout": "Responsive layout",
  "Finale Veröffentlichung geprüft": "Final publishing review complete",
  "Versionierter Entwurf": "Versioned draft",
  "Sitemap & Robots": "Sitemap & robots",
  "Öffentliche URL": "Public URL",
  "Name, Logo, Adresse, Telefon und Öffnungszeiten wurden bewusst geprüft.":
    "Name, logo, address, phone number, and opening hours have been reviewed.",
  "Logo ist im Partnerprofil gepflegt und wird zentral ausgespielt.":
    "The logo is maintained in the partner profile and used consistently.",
  "Name kommt aus dem Partnerprofil.": "The name comes from the partner profile.",
  "Adresse/Standort ist für Kontakt, Maps und LocalBusiness-Schema vorhanden.":
    "The address is available for contact details, maps, and LocalBusiness schema.",
  "Telefonnummer ist für mobile Aktionen und Local SEO vorhanden.":
    "A phone number is available for mobile actions and local SEO.",
  "Öffnungszeiten sind gepflegt und werden in Hero/Kontakt/Schema verwendet.":
    "Opening hours are maintained and used in the hero, contact area, and schema.",
  "Microsite-Bilder/Fallbacks wurden für diesen Partner bewusst geprüft.":
    "Microsite images and fallbacks have been reviewed for this partner.",
  "Title, Description, Schema und Indexierung wurden bewusst geprüft.":
    "Title, description, schema, and indexing have been reviewed.",
  "Partner-spezifischer Titel ist aussagekräftig gepflegt.":
    "A meaningful partner-specific title is set.",
  "Meta-Beschreibung nennt Partner, Ort, Vorteile und Speisekarte ausreichend.":
    "The meta description adequately covers the partner, location, benefits, and menu.",
  "Öffentliche Live-Seiten dürfen nicht versehentlich auf noindex stehen.":
    "Public live pages must not accidentally be set to noindex.",
  "Restaurant, Menu, FAQ und Breadcrumb JSON-LD sind systemisch aktiv.":
    "Restaurant, menu, FAQ, and breadcrumb JSON-LD are enabled.",
  "Builder-/Preview-Seiten sind von Indexierung ausgeschlossen.":
    "Builder and preview pages are excluded from indexing.",
  "Desktop-Navigation, Hero, Vorteile, Speisekarte, Kontakt und Footer wurden geprüft.":
    "Desktop navigation, hero, benefits, menu, contact area, and footer have been reviewed.",
  "Mobile Ansicht wurde im Builder geprüft und freigegeben.":
    "The mobile view has been reviewed and approved in the builder.",
  "Desktop- und Mobilvorschau sind im Builder verfügbar und müssen separat freigegeben werden.":
    "Desktop and mobile previews are available in the builder and require separate approval.",
  "Vor Publish wurde bewusst geprüft: Daten, Assets, Mobile, SEO/LLM und Live-Link.":
    "Before publishing, data, assets, mobile, SEO/LLM, and the live link were reviewed.",
  "Entwurf und Veröffentlichung laufen über Microsite-Versionen.":
    "Drafting and publishing use versioned microsite records.",
  "robots.txt und sitemap.xml werden aus den Microsites erzeugt.":
    "robots.txt and sitemap.xml are generated from the microsites.",
  "Slug/Subdomain oder Canonical URL ist für die Microsite vorhanden.":
    "A slug, subdomain, or canonical URL exists for the microsite.",
  "Speisekarte mit Preisen": "Menu with prices",
  "Leistungsübersicht vorhanden": "Service overview available",
  "Gerichte und Preise kommen aus den Partnerdaten.":
    "Dishes and prices come from the partner data.",
  "Services, Treatments oder Highlights sind für diesen Partnertyp sichtbar gepflegt.":
    "Services, treatments, or highlights are configured for this partner type.",
  "Zur Prüfung markieren": "Mark for review",
  "Freigabe erst nach erfüllten Pflichtchecks möglich":
    "Approval is only available after all required checks are complete",
  "Microsite intern freigeben": "Approve microsite internally",
  "Freigeben": "Approve",
  "Diese Version live veröffentlichen": "Publish this version live",
  "Veröffentlichen": "Publish",
  "Live-Publish ist gesperrt, bis alle Pflichtchecks erledigt sind. Entwurf und Prüfung bleiben möglich.":
    "Live publish is locked until all required checks are complete. Draft and review actions are still available.",
  "Die Live-Veröffentlichung ist gesperrt, bis alle Pflichtprüfungen erledigt sind. Entwurf und Prüfung bleiben möglich.":
    "Live publishing is locked until all required checks are complete. Draft and review actions are still available.",
  "Editor": "Editor",
  "Live-Vorschau": "Live preview",
  "Preview herauszoomen": "Zoom out preview",
  "Vorschau verkleinern": "Zoom out preview",
  "Zoom zurücksetzen": "Reset zoom",
  "Preview reinzoomen": "Zoom in preview",
  "Vorschau vergrößern": "Zoom in preview",
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
  "Emotionaler Hero, Vorteile, Stempelkarte, App-Banner und starke lokale Story.":
    "Emotional hero, benefits, stamp card, app banner, and a strong local story.",
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
  "Vorteil": "Benefit",
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
  "Start/Vorteile/Über uns separat": "Hero/benefits/about are managed separately",
  "SEO": "SEO",
  "Title/Description separat": "Title/description managed separately",
  "SEO-Titel und -Beschreibung separat": "SEO title/description managed separately",
  "Partnerprofil": "Partner profile",
  "Partnerprofil / Medien": "Partner profile / Media",
  "Menüs & Artikel": "Menus & items",
  "Fehlt": "Missing",
  "Asset-Bibliothek": "Asset library",
  "Asset-Status & Austauschbarkeit": "Asset status & reusability",
  "Medienstatus & Austauschbarkeit": "Asset status & reusability",
  "Partnerlogo": "Partner logo",
  "Feature-Karte": "Feature card",
  "Startbild": "Hero image",
  "Vorteile": "Benefits",
  "Über uns 1": "About image 1",
  "Über uns 2": "About image 2",
  "bereit": "ready",
  "fehlt": "missing",
  "Gespeicherte Asset-Library": "Saved asset library",
  "Versionierung & Rückgängig": "Versioning & rollback",
  "Versionierung & Wiederherstellung": "Versioning & rollback",
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
  "Abschlussprüfung": "Final checks",
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
  "Social Feed auf der Microsite": "Social feed on the microsite",
  "Originalbeiträge einbetten": "Embed original posts",
  "Direkte Beitrags-URLs zeigen bis zu drei Instagram- oder TikTok-Beiträge. Ohne Beiträge wird stattdessen das verknüpfte Profil angezeigt.":
    "Direct post URLs show up to three Instagram or TikTok posts. Without posts, the linked profile is shown instead.",
  "Feed anzeigen": "Show feed",
  "Feed-Plattform": "Feed platform",
  "Beitrag 1 URL": "Post 1 URL",
  "Beitrag 2 URL": "Post 2 URL",
  "Beitrag 3 URL": "Post 3 URL",
  "Direkte Instagram-Post-/Reel- oder TikTok-Video-URL":
    "Direct Instagram post/reel or TikTok video URL",
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
  "Automatisch zurücksetzen": "Reset to auto",
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
  "Auto aus Logo": "Auto from logo",
  "Manuell": "Manual",
  "Aktive 3-Farben-Palette": "Active three-color palette",
  "Primär": "Primary",
  "Kontrast": "Contrast",
  "Highlight": "Highlight",
  "Logo wird analysiert …": "Analyzing logo…",
  "Drei kontrastreiche Farben wurden aus dem Partnerlogo gewählt.":
    "Three contrasting colors were selected from the partner logo.",
  "Logo-Farben wurden zu einer vollständigen professionellen Palette ergänzt.":
    "The logo colors were completed into a professional palette.",
  "Benefitsi Blau-Palette aktiv – das Logo ist einfarbig, fehlt oder kann nicht analysiert werden.":
    "Benefitsi blue palette active—the logo is monochrome, missing, or could not be analyzed.",
  "Manuelle Farben sind aktiv.": "Manual colors are active.",
  "Palette neu aus Logo auswählen": "Regenerate palette from logo",
  "Primärfarbe": "Primary color",
  "Kontrastfarbe": "Contrast color",
  "Highlightfarbe": "Highlight color",
  "Bearbeiten": "Edit",
  "Design": "Design",
  "Inhalte": "Content",
  "Medien": "Media",
  "Direkt bearbeiten": "Edit directly",
  "Wähle ein Element in der Vorschau und ändere nur seine relevanten Eigenschaften.":
    "Select an element in the preview and change only its relevant properties.",
  "Design & Inhalte": "Design & content",
  "Grundlagen": "Foundations",
  "Marke und Startbereich des aktuellen Templates.": "Brand and hero settings for the current template.",
  "Seiteninhalte": "Page content",
  "Texte und Inhalte in derselben Reihenfolge wie auf der Microsite.":
    "Text and content in the same order as the microsite.",
  "Marke, Startbereich und Seiteninhalte in der Reihenfolge der Microsite.":
    "Brand, hero, and page content in the microsite order.",
  "Medien & Daten": "Media & data",
  "Bilder & Medien": "Images & media",
  "Nur Bilder, die im aktuellen Template tatsächlich verwendet werden.":
    "Only images that are actually used in the current template.",
  "Marke & Startbereich Bilder": "Brand & hero images",
  "Vorteils- und Belohnungsbilder": "Benefit and reward images",
  "Über-uns Bilder": "About images",
  "App & Footer Bilder": "App & footer images",
  "Partner-Badge": "Partner badge",
  "2 für 1 Hintergrundbild": "2-for-1 background image",
  "Über-uns Hauptbild": "About main image",
  "Über-uns Zutatenbild": "About ingredients image",
  "Über-uns Ortsbild": "About location image",
  "Über-uns Detailbild": "About detail image",
  "Keine aktiven Vorteils- oder Belohnungsbilder in diesem Template.":
    "There are no active benefit or reward images in this template.",
  "Bilder prüfen, wiederverwenden und die synchronisierten Partnerdaten kontrollieren.":
    "Review and reuse images, then verify synchronized partner data.",
  "Sichtbarkeit & Ausgabe": "Visibility & output",
  "Suchdarstellung und optionale Druckmedien konfigurieren.":
    "Configure search presentation and optional print media.",
  "Prüfen & veröffentlichen": "Review & publish",
  "Qualität prüfen und die Microsite anschließend freigeben.":
    "Review quality, then approve and publish the microsite.",
  "Qualität prüfen und die Microsite anschließend veröffentlichen.":
    "Complete the checklist, then publish the microsite.",
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
  "Helle Ansicht": "Light mode",
  "Dunkle Ansicht": "Dark mode",
  "Darstellungsmodus": "Appearance mode",
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
  "Vorteil Bild": "Benefit image",
  "Vorteil Label": "Benefit label",
  "Vorteil Beschreibung": "Benefit description",
  "Vorteil Button": "Benefit button",
  "Speisekarte Label": "Menu label",
  "Benefit 1 Titel": "Benefit 1 title",
  "Benefit 1 Text": "Benefit 1 text",
  "Benefit 2 Titel": "Benefit 2 title",
  "Benefit 2 Text": "Benefit 2 text",
  "Willkommen Titel": "Welcome title",
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
  "Willkommen Icon": "Welcome icon",
  "Adresse Icon": "Address icon",
  "Telefon Icon": "Phone icon",
  "Benefitsi Footer Logo": "Benefitsi footer logo",
  "Belohnung nach 5 Stempeln": "5-stamp reward",
  "Belohnung nach 10 Stempeln": "10-stamp reward",
  "Vorlagenschrift": "Template font",
  "Automatische Bildprüfung": "Automated image audit",
  "Bildauflösung zu niedrig": "Low resolution",
  "Seitenverhältnis prüfen": "Check aspect ratio",
  "Bild wird geprüft": "Checking image",
  "Bild nicht verfügbar": "Image unavailable",
  "Bildqualität gut": "Good image quality",
  "Bildgröße wird ausgelesen…": "Reading image size...",
  "Das Bild konnte nicht geladen werden. Bitte erneut hochladen oder ersetzen.":
    "The image could not be loaded. Re-upload or replace it.",
  "Ersetze unscharfe oder zu kleine Bilder vor der Veröffentlichung oder dem Druck.":
    "Replace blurry or undersized photos before publishing or printing.",
  "Empfohlene Ausrichtung": "Recommended direction",
  "Beste Wahl": "Best fit",
  "Gastronomie": "Food & drink",
  "Salon & Beauty": "Salon & beauty",
  "Wellness & Pflege": "Wellness & care",
  "Unterhaltung": "Entertainment",
  "Einzelhandel & Dienstleistungen": "Retail & services",
  "Regional essen": "Local dining",
  "Minimalistische Gastronomie": "Minimal food",
  "Beauty-Studio": "Beauty studio",
  "Beauty Noir": "Beauty noir",
  "Emotional, vorteilsorientiert und auf Conversions ausgerichtet.":
    "Emotional, benefit-led, and conversion-focused.",
  "Warm, regional und erzählerisch.": "Warm, regional, and story-led.",
  "Reduziert, schnell und mit wenig Bildmaterial.": "Reduced, fast, and image-light.",
  "Editorial, hochwertig und serviceorientiert.": "Editorial, premium, and service-led.",
  "Dunkel, luxuriös und modebewusst.": "Dark, luxe, and fashion-forward.",
  "Ruhig, regenerierend und luftig.": "Calm, restorative, and breathable.",
  "Elektrisierend, markant und energiegeladen.": "Electric, bold, and high-energy.",
  "Kontrastreich, eventorientiert und dramatisch.":
    "High-contrast, event-forward, and dramatic.",
  "Quadratischer Beitrag": "Square post",
  "Story-Banner": "Story banner",
  "Querformat-Banner": "Landscape banner",
  "Markanter Vorteil": "Bold benefit",
  "Klare Story": "Clean story",
  "Foto im Fokus": "Photo spotlight",
  "Editorial Elegant": "Editorial luxe",
  "Mitternachtsglanz": "Midnight glow",
  "Großzügiges, vorteilsorientiertes Flyer-Layout mit klarem CTA und starkem Startbild.":
    "Large benefit-led flyer layout with a clear CTA and strong hero image.",
  "Luftiges Editorial-Layout mit hochwertigen Abständen für ruhige, vertrauenswürdige Marken.":
    "Airy editorial layout with premium spacing for calm and trusted brands.",
  "Bildbetonte Komposition mit der Botschaft im unteren Drittel.":
    "Image-first composition with the message anchored in the lower third.",
  "Boutique-Komposition mit gerahmter Hauptbotschaft und luxuriöser Anmutung.":
    "Boutique studio composition with a framed center story and luxury tone.",
  "Kontrastreiches Eventplakat mit Neon-Energie und dramatischer Überschriften-Hierarchie.":
    "High-contrast event poster with neon energy and a dramatic headline stack.",
  "Wecke Appetit und nenne einen klaren Grund, jetzt vorbeizukommen.":
    "Lead with appetite and one clear reason to walk in now.",
  "Nutze hochwertige Abstände, ausgearbeitete Typografie und stelle die Leistungen in den Mittelpunkt.":
    "Use premium spacing, polished typography, and service-led framing.",
  "Halte die Botschaft ruhig, luftig und auch aus der Entfernung leicht erfassbar.":
    "Keep the message calm, breathable, and easy to scan from a distance.",
  "Nutze dramatische Kontraste und eine plakatartige, eventorientierte Hierarchie.":
    "Use dramatic contrast and a poster-like, event-driven hierarchy.",
  "Verbinde einen klaren Vorteil mit einem hochwertigen lokalen Markenauftritt.":
    "Balance benefit clarity with a polished local-brand presentation.",
  "Geteiltes Editorial": "Editorial split",
  "Bildbetont": "Image-led",
  "Fokus im unteren Bereich": "Bottom spotlight",
  "Gerahmtes Editorial": "Framed editorial",
  "Neon-Plakat": "Neon poster",
  "Vorteils-Hierarchie": "Benefit stack",
  "Ideal für Theken-Flyer, Plakate und gedruckte Handzettel.":
    "Ideal for counter flyers, posters, and printable handouts.",
  "Ideal für mobile Storys und vertikale Displays.":
    "Ideal for mobile stories and vertical displays.",
  "Ideal für Social-Media-Beiträge, Partnerbanner und Aktionskacheln.":
    "Ideal for social posts, partner banners, and promo tiles.",
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
  "Vorteils-Label": "Benefits label",
  "Startbereich Slogan": "Hero slogan",
  "Primärer Button": "Primary button",
  "Sekundärer Button": "Secondary button",
  "Vorteilsbereich-Introbild": "Benefits intro image",
  "Vorteils-Überschrift": "Benefits headline",
  "Vorteils-Slogan": "Benefits slogan",
  "Vorteilsbeschreibung": "Benefit description",
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

  const saveErrorCodeMatch = repairedText.match(
    /^Speichern fehlgeschlagen\. Bitte erneut versuchen\. Fehlercode: ([a-zA-Z0-9-]+)$/,
  )
  if (saveErrorCodeMatch) {
    return `Save failed. Please try again. Error code: ${saveErrorCodeMatch[1]}`
  }

  const navigationMatch = repairedText.match(/^Navigation (.+)$/)
  if (navigationMatch) {
    return `Navigation ${translateBuilderText(locale, navigationMatch[1])}`
  }

  const selectedElementMatch = repairedText.match(/^Element: (.+)$/)
  if (selectedElementMatch) {
    return `${translateBuilderText(locale, "Element")}: ${translateBuilderText(locale, selectedElementMatch[1])}`
  }

  const featuredMenuImageMatch = repairedText.match(/^Großes Menübild – (.+)$/)
  if (featuredMenuImageMatch) {
    return `Large menu image – ${featuredMenuImageMatch[1]}`
  }

  const menuImageMatch = repairedText.match(/^(.+) Menübild$/)
  if (menuImageMatch) {
    return `${menuImageMatch[1]} menu image`
  }

  const rewardImageMatch = repairedText.match(/^(\d+) Stempel Belohnungsbild$/)
  if (rewardImageMatch) {
    return `${rewardImageMatch[1]}-stamp reward image`
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

  const topDealBulletMatch = repairedText.match(/^Vorteil Punkt (\d+)$/)
  if (topDealBulletMatch) {
    return `Benefit bullet ${topDealBulletMatch[1]}`
  }

  const topDealBulletIconMatch = repairedText.match(/^Vorteil Punkt (\d+) Icon$/)
  if (topDealBulletIconMatch) {
    return `Benefit bullet ${topDealBulletIconMatch[1]} icon`
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

  const minimumUploadMatch = repairedText.match(
    /^Mindestens (\d+) x (\d+) px hochladen\.$/,
  )
  if (minimumUploadMatch) {
    return `Upload at least ${minimumUploadMatch[1]} x ${minimumUploadMatch[2]}px.`
  }

  const minimumResolutionMatch = repairedText.match(
    /^Mindestens (\d+) x (\d+) px verwenden\. Aktuell: (\d+) x (\d+) px\.$/,
  )
  if (minimumResolutionMatch) {
    return `Use at least ${minimumResolutionMatch[1]} x ${minimumResolutionMatch[2]}px. Current: ${minimumResolutionMatch[3]} x ${minimumResolutionMatch[4]}px.`
  }

  const awkwardCropMatch = repairedText.match(
    /^Der Bildausschnitt könnte unpassend wirken\. Aktuell: (\d+) x (\d+) px\.$/,
  )
  if (awkwardCropMatch) {
    return `The crop may feel awkward. Current: ${awkwardCropMatch[1]} x ${awkwardCropMatch[2]}px.`
  }

  const assetAttentionMatch = repairedText.match(
    /^(\d+) Assets? benötigen Aufmerksamkeit\.$/,
  )
  if (assetAttentionMatch) {
    return `${assetAttentionMatch[1]} asset${assetAttentionMatch[1] === "1" ? "" : "s"} need attention.`
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
    .replace(/(\d+)\s+Prämien\b/g, "$1 rewards")
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
  const router = useRouter()
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
  const { language: builderLocale } = useAdminLanguage()
  const previewRef = useRef<HTMLDivElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
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
    saveMicrositeVersionWithFallback,
    initialState,
  )
  const [pendingIntent, setPendingIntent] = useState("")
  const [clientSaveError, setClientSaveError] = useState("")
  const renderedAssetLibrary = config.assets.library.filter((asset) =>
    isAvailableMicrositeLibraryAsset(asset, partner),
  )
  const assetOptions = Array.from(new Set([
    partner.logo_url,
    config.branding.logoUrl,
    config.hero.backgroundImageUrl,
    partner.deals.some(isMicrositeTwoForOneDeal) ? config.deals.topDealImageUrl : "",
    ...renderedAssetLibrary.map((asset) => asset.url),
    ...menuItemsForMicrositeBuilder(partner).map((item) => item.image_url),
    ...Object.entries(config.elementText)
      .filter(([key]) => isRenderedMicrositeImageSlot(key, partner))
      .map(([, value]) => value),
  ].filter((asset): asset is string => Boolean(asset))))
  const readinessReport = useMemo(
    () => createMicrositeReadinessReport(partner, config),
    [partner, config],
  )
  const selectedElement = getEditableElement(selectedElementId, config, partner)
  const activeTemplatePreset =
    micrositeTemplatePresets.find((template) => template.id === config.template) ??
    micrositeTemplatePresets[0]
  const previewIdentifier =
    partner.microsite?.slug || partner.slug || partner.subdomain || partner.id || "partner"
  const previewStorageKey = `benefitsi:microsite-preview:${partner.id || partner.slug || "partner"}`
  const previewHref = `${previewBasePath}/${encodeURIComponent(previewIdentifier)}?source=builder&mode=${config.appearance?.mode ?? "light"}`
  const publishBlocked = readinessReport.status === "blocked"
  const publishBlockers = readinessReport.items.filter(
    (item) => item.severity === "required" && !item.ok,
  )
  const builderChecklist = [
    config.builder.partnerDataReviewDone,
    config.builder.assetReviewDone,
    config.builder.desktopQaDone,
    config.builder.mobileQaDone,
    config.builder.seoReviewDone,
    config.builder.publishReviewDone,
  ]
  const builderChecklistDone = builderChecklist.filter(Boolean).length
  const builderChecklistTotal = builderChecklist.length
  const zoomPercent = Math.round(previewZoom * 100)
  const tr = useMemo(
    () => (text: string) => translateBuilderText(builderLocale, text),
    [builderLocale],
  )
  const useViewportShell = fullscreen
  const inlineSidebarClasses = editorPanelOpen
    ? "h-[min(72dvh,720px)] min-h-0 touch-pan-y overflow-y-auto overscroll-y-contain border-b [scrollbar-gutter:stable] [scrollbar-width:thin] lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-2rem)] lg:border-b-0 lg:border-r"
    : "touch-pan-y overflow-x-hidden border-b lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:overscroll-y-contain lg:border-b-0 lg:border-r lg:[scrollbar-gutter:stable] lg:[scrollbar-width:thin]"

  useEffect(() => {
    const sidebar = sidebarRef.current

    if (!sidebar) {
      return
    }

    const handleToggle = (event: Event) => {
      const opened = event.target
      if (!(opened instanceof HTMLDetailsElement) || !opened.open || !opened.dataset.configSection) return

      sidebar.querySelectorAll<HTMLDetailsElement>("details[data-config-section]").forEach((item) => {
        if (item !== opened) item.open = false
      })
    }

    sidebar.addEventListener("toggle", handleToggle, true)

    return () => {
      sidebar.removeEventListener("toggle", handleToggle, true)
    }
  }, [editorPanelOpen])

  useEffect(() => {
    const selectedDetails = selectedElementPanelRef.current?.querySelector<HTMLDetailsElement>(
      "details[data-config-section]",
    )

    if (selectedDetails) selectedDetails.open = true
  }, [selectedElementId])

  const previewToolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-zinc-700">{tr("Live-Vorschau")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-zinc-200 bg-white p-1">
          <button
            type="button"
            onClick={() => adjustPreviewZoom(-0.1)}
            className="grid size-8 place-items-center rounded text-sm font-black text-zinc-700 transition hover:bg-zinc-100"
            aria-label={tr("Vorschau verkleinern")}
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
            aria-label={tr("Vorschau vergrößern")}
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
        <div
          className="inline-flex rounded-md border border-zinc-200 bg-white p-1"
          role="group"
          aria-label={tr("Darstellungsmodus")}
        >
          {(["light", "dark"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                setConfig((current) => ({
                  ...current,
                  appearance: {
                    ...(current.appearance ?? { mode: "light" }),
                    mode,
                  },
                }))
              }
              aria-pressed={(config.appearance?.mode ?? "light") === mode}
              className={`rounded px-3 py-1.5 text-xs font-semibold ${
                (config.appearance?.mode ?? "light") === mode
                  ? "bg-zinc-950 text-white"
                  : "text-zinc-600"
              }`}
            >
              {mode === "light" ? tr("Helle Ansicht") : tr("Dunkle Ansicht")}
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

  function openPublishChecklist() {
    const section = sidebarRef.current?.querySelector<HTMLElement>(
      "#microsite-publish-checklist",
    )
    const firstPanel = section?.querySelector<HTMLDetailsElement>(
      "details[data-config-section]",
    )

    if (firstPanel) firstPanel.open = true
    section?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function openReadinessEditor(itemId: string) {
    const target = readinessEditTarget(itemId)

    if (target.partnerTab) {
      const dashboardPath = previewBasePath.startsWith("/partner/")
        ? "/partner"
        : "/"
      const query = new URLSearchParams({
        partner: partner.id || previewIdentifier,
        mode: "view",
        view: "settings",
        tab: target.partnerTab,
      })

      window.location.assign(`${dashboardPath}?${query.toString()}#partners`)
      return
    }

    setEditorPanelOpen(true)
    if (target.viewport) setViewport(target.viewport)
    if (target.elementId) setSelectedElementId(target.elementId)

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const section = sidebarRef.current?.querySelector<HTMLElement>(
          `[data-builder-section="${target.section}"]`,
        )
        const panel = section?.querySelector<HTMLDetailsElement>(
          "details[data-config-section]",
        )

        if (panel) panel.open = true
        section?.scrollIntoView({ behavior: "smooth", block: "start" })

        const firstControl = section?.querySelector<HTMLElement>(
          'input:not([type="hidden"]):not([type="file"]), textarea, select, button:not([type="submit"])',
        )
        firstControl?.focus({ preventScroll: true })
      })
    })
  }

  function resetToPartnerDefaults() {
    if (
      !window.confirm(
        tr(
          "Alle Microsite-Einstellungen auf die aktuellen Partner-Standardwerte zurücksetzen? Nicht gespeicherte Änderungen gehen verloren.",
        ),
      )
    ) {
      return
    }

    setConfig(createDefaultMicrositeConfig(partner))
    setSelectedElementId("hero.headline")
    inlineTextOverridesRef.current = {}

    if (inlineTextOverridesInputRef.current) {
      inlineTextOverridesInputRef.current.value = "{}"
    }

    formRef.current
      ?.querySelectorAll<HTMLInputElement>('input[type="file"]')
      .forEach((input) => {
        input.value = ""
      })
    window.dispatchEvent(new Event(MICROSITE_UPLOADS_CLEARED_EVENT))
    setClientSaveError("")
  }

  function handleSaveSubmit(event: FormEvent<HTMLFormElement>) {
    setClientSaveError("")

    const submitter = (event.nativeEvent as SubmitEvent).submitter
    if (submitter instanceof HTMLButtonElement) {
      setPendingIntent(submitter.value || "draft")
    }

    const activeElement = document.activeElement
    const activeEditable =
      activeElement instanceof HTMLElement
        ? activeElement.closest<HTMLElement>(
            '[data-microsite-editable-kind="text"]',
          )
        : null

    if (activeEditable && previewRef.current?.contains(activeEditable)) {
      syncInlineTextOverride(
        activeEditable.dataset.micrositeEditable || "",
        textFromEditableElement(activeEditable),
      )
    }

    const files = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement>(
        'input[type="file"]',
      ),
    ).flatMap((input) => Array.from(input.files ?? []))
    const unsupportedFile = files.find(
      (file) => !ALLOWED_MICROSITE_ASSET_TYPES.has(file.type),
    )
    const oversizedFile = files.find(
      (file) => file.size > MAX_MICROSITE_ASSET_BYTES,
    )
    const totalBytes = files.reduce((total, file) => total + file.size, 0)

    if (unsupportedFile) {
      event.preventDefault()
      setClientSaveError(
        builderLocale === "en"
          ? `${unsupportedFile.name}: This image type is not supported. Please use PNG, JPG, WebP or SVG.`
          : `${unsupportedFile.name}: Dieser Bildtyp wird nicht unterstützt. Bitte PNG, JPG, WebP oder SVG verwenden.`,
      )
      return
    }

    if (oversizedFile) {
      event.preventDefault()
      setClientSaveError(
        builderLocale === "en"
          ? `${oversizedFile.name}: An image may be no larger than 10 MB.`
          : `${oversizedFile.name}: Ein Bild darf maximal 10 MB groß sein.`,
      )
      return
    }

    if (totalBytes > MAX_MICROSITE_UPLOAD_BYTES) {
      event.preventDefault()
      setClientSaveError(
        builderLocale === "en"
          ? "The selected images are larger than 20 MB in total. Save fewer images at once."
          : "Die ausgewählten Bilder sind zusammen größer als 20 MB. Bitte weniger Bilder gleichzeitig speichern.",
      )
    }
  }

  useEffect(() => {
    if (state.ok && state.config) {
      let cancelled = false

      queueMicrotask(() => {
        if (!cancelled && state.config) {
          const savedConfig = resolveMicrositeConfig(state.config, partner)

          setConfig(savedConfig)
          window.localStorage.setItem(
            previewStorageKey,
            JSON.stringify(savedConfig),
          )
          router.refresh()
          inlineTextOverridesRef.current = {}

          if (inlineTextOverridesInputRef.current) {
            inlineTextOverridesInputRef.current.value = "{}"
          }

          formRef.current
            ?.querySelectorAll<HTMLInputElement>('input[type="file"]')
            .forEach((input) => {
              input.value = ""
            })
          window.dispatchEvent(new Event(MICROSITE_UPLOADS_CLEARED_EVENT))
          setClientSaveError("")
        }
      })

      return () => {
        cancelled = true
      }
    }
  }, [partner, previewStorageKey, router, state.config, state.ok])

  useEffect(() => {
    const applySharedConfig = (serializedConfig: string | null) => {
      if (!serializedConfig) return

      try {
        setConfig(resolveMicrositeConfig(JSON.parse(serializedConfig), partner))
      } catch {
        // Ignore incomplete or unrelated storage writes.
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === previewStorageKey) applySharedConfig(event.newValue)
    }

    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [partner, previewStorageKey])

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
    const element = getEditableElement(id, config, partner)

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
        tr,
      }}
    >
    <section
      className={`${fullscreen ? "overflow-visible" : "overflow-hidden"} rounded-md border border-zinc-200 bg-white shadow-sm`}
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
          <button
            type="button"
            onClick={resetToPartnerDefaults}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-[11px] font-semibold leading-none text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {tr("Auf Standard zurücksetzen")}
          </button>
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              window.localStorage.setItem(previewStorageKey, JSON.stringify(config))
            }}
            className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            {tr("Aktuelle Vorschau öffnen")}
          </a>
          <StatusBadge
            label={partner.microsite?.publishedVersion ? "Live" : "Noch nicht live"}
            active={Boolean(partner.microsite?.publishedVersion)}
          />
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums ring-1 ring-inset ${
              builderChecklistDone === builderChecklistTotal
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : "bg-amber-50 text-amber-800 ring-amber-200"
            }`}
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {builderChecklistDone}/{builderChecklistTotal} {tr("erledigt")}
          </span>
        </div>
        </div>
        <div
          className={`border-t px-5 py-3 ${
            publishBlocked
              ? "border-amber-200 bg-amber-50/75"
              : "border-emerald-200 bg-emerald-50/75"
          }`}
          role="status"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-xs font-black ${publishBlocked ? "text-amber-950" : "text-emerald-950"}`}>
                  {publishBlocked
                    ? tr("Warum ist Veröffentlichen gesperrt?")
                    : tr("Alle Pflichtchecks sind erledigt. Veröffentlichen ist freigeschaltet.")}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${publishBlocked ? "bg-amber-200/70 text-amber-950" : "bg-emerald-200/70 text-emerald-950"}`}>
                  {readinessReport.requiredDone}/{readinessReport.requiredTotal} {tr("Pflichtchecks")}
                </span>
              </div>
              {publishBlocked ? (
                <p className="mt-1 truncate text-xs text-amber-900">
                  {publishBlockers
                    .slice(0, 4)
                    .map((item) => tr(item.label))
                    .join(" · ")}
                  {publishBlockers.length > 4 ? ` · +${publishBlockers.length - 4}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-emerald-800">
                  {tr("Der aktuelle Entwurf kann jetzt veröffentlicht werden.")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={openPublishChecklist}
              className={`shrink-0 text-xs font-black underline decoration-2 underline-offset-4 ${publishBlocked ? "text-amber-950" : "text-emerald-950"}`}
            >
              {tr("Checkliste öffnen")}
            </button>
          </div>
        </div>
        {pending || clientSaveError || state.message ? (
          <div
            role={clientSaveError || (!state.ok && state.message) ? "alert" : "status"}
            aria-live="polite"
            className={`border-t px-5 py-2.5 text-sm font-semibold ${
              clientSaveError || (!state.ok && state.message)
                ? "border-red-200 bg-red-50 text-red-800"
                : pending
                  ? "border-blue-200 bg-blue-50 text-blue-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {clientSaveError ||
              (pending
                ? builderLocale === "en"
                  ? "Saving changes…"
                  : "Änderungen werden gespeichert…"
                : tr(state.message))}
          </div>
        ) : null}
      </header>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={handleSaveSubmit}
        aria-busy={pending}
        className={`grid min-w-0 max-w-full grid-cols-1 gap-0 transition-[grid-template-columns] duration-200 ${
          useViewportShell
            ? "min-h-[calc(100vh-8rem)] overflow-visible lg:grid-cols-[var(--editor-panel-width)_minmax(0,1fr)]"
            : editorPanelOpen
              ? "overflow-hidden lg:grid-cols-[330px_minmax(0,1fr)]"
              : "overflow-hidden lg:grid-cols-[56px_minmax(0,1fr)]"
        } ${!fullscreen ? (editorPanelOpen ? "lg:grid-cols-[330px_minmax(0,1fr)]" : "lg:grid-cols-[56px_minmax(0,1fr)]") : ""}`}
        style={
          fullscreen
            ? {
                "--editor-panel-width": editorPanelOpen
                  ? `${editorPanelWidth}px`
                  : "64px",
              } as CSSProperties
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
            className={`relative w-full min-w-0 max-w-full self-start touch-pan-y overflow-x-hidden border-zinc-200 bg-white [scrollbar-width:thin] ${
            fullscreen
              ? "h-[min(72dvh,720px)] min-h-0 overflow-y-auto overscroll-y-contain border-b [scrollbar-gutter:stable] lg:sticky lg:top-20 lg:h-[calc(100dvh-5rem)] lg:max-h-[calc(100dvh-5rem)] lg:border-b-0 lg:border-r"
              : inlineSidebarClasses
          } ${editorPanelOpen ? "space-y-4 p-4" : "p-2"}`}
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
          <BuilderCategory
            title="Direkt bearbeiten"
            description="Wähle ein Element in der Vorschau und ändere nur seine relevanten Eigenschaften."
          >
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
          </BuilderCategory>

          <BuilderCategory
            title="Grundlagen"
            description="Marke und Startbereich des aktuellen Templates."
          >

          <div data-builder-section="brand">
          <ConfigSection title="Marke">
            <PaletteControl
              logoUrl={config.branding.logoUrl || partner.logo_url || ""}
              config={config}
              setConfig={setConfig}
            />
            <SourceLockedField
              label="Logo"
              value={partner.logo_url || "Im Partnerprofil hinterlegen"}
              source="Partnerprofil → Media"
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
          </ConfigSection>
          </div>

          </BuilderCategory>

          <BuilderCategory
            title="Seiteninhalte"
            description="Texte und Inhalte in derselben Reihenfolge wie auf der Microsite."
          >

          <div data-builder-section="content" className="space-y-2">
            <ConfigSection title="Partner-Zitat">
              <EditorField
                name="quote_text"
                label="Partner-Zitat"
                value={config.content.quoteText}
                onChange={(value) => updateContent(setConfig, "quoteText", value)}
                multiline
              />
              <EditorField
                name="quote_attribution"
                label="Zitat-Absender"
                value={config.content.quoteAttribution}
                onChange={(value) =>
                  updateContent(setConfig, "quoteAttribution", value)
                }
              />
            </ConfigSection>

            <ConfigSection title="Vorteile & Aktionen">
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
            </ConfigSection>

            <ConfigSection title="App & Vorteile">
              <EditorField
                name="ecosystem_headline"
                label="App Vorteile Überschrift"
                value={config.elementText["content.ecosystemHeadline"] || "Mehr als nur Stempel."}
                onChange={(value) =>
                  setConfig((current) =>
                    setElementTextValue(current, "content.ecosystemHeadline", value),
                  )
                }
              />
              <EditorField
                name="ecosystem_text"
                label="App Vorteile Text"
                value={config.elementText["content.ecosystemText"] || "Eine App für Vorteile, Treue, Entdeckungen und kleine Erfolge bei jedem Besuch."}
                onChange={(value) =>
                  setConfig((current) =>
                    setElementTextValue(current, "content.ecosystemText", value),
                  )
                }
                multiline
              />
            </ConfigSection>

            <SocialMediaPanel partner={partner} config={config} setConfig={setConfig} />

            <ConfigSection title="Speisekarte">
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
              <MenuImagesEditor
                partner={partner}
                config={config}
                setConfig={setConfig}
              />
            </ConfigSection>

            <ConfigSection title="Über uns & Kontakt">
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
            </ConfigSection>

            <ConfigSection title="Footer">
              <EditorField
                name="footer_text"
                label="Footer-Text"
                value={config.content.footerText}
                onChange={(value) => updateContent(setConfig, "footerText", value)}
              />
            </ConfigSection>
          </div>
          </BuilderCategory>

          <BuilderCategory
            title="Bilder & Medien"
            description="Nur Bilder, die im aktuellen Template tatsächlich verwendet werden."
          >
            <div data-builder-section="assets" className="space-y-2">
              <CurrentTemplateImagesPanel
                partner={partner}
                config={config}
                setConfig={setConfig}
              />
              <AssetReadinessPanel partner={partner} config={config} setConfig={setConfig} />
            </div>
          </BuilderCategory>

          <BuilderCategory
            title="Sichtbarkeit & Ausgabe"
            description="Suchdarstellung und optionale Druckmedien konfigurieren."
          >
            <div data-builder-section="seo">
              <SeoSystemPanel config={config} setConfig={setConfig} />
            </div>
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
          </BuilderCategory>

          <BuilderCategory
            title="Prüfen & veröffentlichen"
            description="Qualität prüfen und die Microsite anschließend veröffentlichen."
            id="microsite-publish-checklist"
          >
            <div data-builder-section="quality">
              <ReadinessPanel
                report={readinessReport}
                onEditItem={openReadinessEditor}
              />
            </div>
            <div data-builder-section="checklist">
              <BuilderChecklistPanel
                config={config}
                setConfig={setConfig}
                onEditItem={openReadinessEditor}
              />
            </div>
            <WorkflowPanel
              partner={partner}
              report={readinessReport}
              previewIdentifier={previewIdentifier}
            />
          </BuilderCategory>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              name="intent"
              value="draft"
              onClick={() => setPendingIntent("draft")}
              disabled={pending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 disabled:opacity-60"
            >
              {pending && pendingIntent === "draft" ? <LoadingSpinner /> : null}
              {pending && pendingIntent === "draft" ? tr("Speichert…") : tr("Entwurf speichern")}
            </button>
            <button
              type="submit"
              name="intent"
              value="publish"
              onClick={() => setPendingIntent("publish")}
              disabled={pending || publishBlocked}
              title={
                publishBlocked
                  ? `Pflichtpunkte fehlen: ${publishBlockers
                      .slice(0, 4)
                      .map((item) => tr(item.label))
                      .join(", ")}`
                  : tr("Diese Version live veröffentlichen")
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {pending && pendingIntent === "publish" ? <LoadingSpinner /> : null}
              {pending && pendingIntent === "publish" ? tr("Wird veröffentlicht…") : tr("Veröffentlichen")}
            </button>
            {publishBlocked ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
                <p className="text-xs font-black">
                  {tr("Noch offene Pflichtpunkte")}
                </p>
                <ul className="mt-2 space-y-2">
                  {publishBlockers.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openReadinessEditor(item.id)}
                        className="group flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs leading-5 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <span>
                          <span className="font-black">{tr(item.label)}:</span>{" "}
                          <span>{tr(item.detail)}</span>
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
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
          className={`min-w-0 max-w-full overflow-x-hidden bg-zinc-50 ${
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
                  aria-label={tr("Vorschau verkleinern")}
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
                  aria-label={tr("Vorschau vergrößern")}
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
            data-admin-i18n-ignore="true"
            className={`microsite-builder-surface mx-auto overflow-x-hidden overflow-y-visible transition-all ${
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
              <MicrositeRenderer
                partner={partner}
                config={config}
                showAppDownloadPopup={false}
              />
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
  { value: "", label: "Vorlagenschrift" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Brush Script MT, cursive", label: "Script" },
]

type ReadinessEditTarget = {
  section: "selected" | "brand" | "hero" | "content" | "assets" | "seo" | "checklist"
  elementId?: string
  viewport?: "desktop" | "mobile"
  partnerTab?: "details" | "rewards" | "deals" | "menu"
}

function readinessEditTarget(itemId: string): ReadinessEditTarget {
  switch (itemId) {
    case "partner-logo":
    case "partner-name":
    case "partner-address":
    case "partner-phone":
    case "coordinates":
    case "mobile-actions":
    case "self-service-safe":
    case "public-url":
      return { section: "checklist", partnerTab: "details" }
    case "opening-hours":
      return { section: "checklist", partnerTab: "rewards" }
    case "menu-prices":
    case "menu-images":
      return { section: "checklist", partnerTab: "menu" }
    case "microsite-hero":
      return { section: "selected", elementId: "hero.backgroundImageUrl" }
    case "microsite-deals-image":
      return { section: "assets" }
    case "top-deal-image":
      return { section: "selected", elementId: "deals.topDealImageUrl" }
    case "about-images":
      return { section: "selected", elementId: "content.aboutHeroImageUrl" }
    case "asset-review":
      return { section: "assets" }
    case "seo-title":
    case "seo-description":
    case "seo-keywords":
    case "public-indexing":
    case "structured-data":
    case "preview-noindex":
    case "sitemap-robots":
    case "canonical-url":
    case "site-url-env":
      return { section: "seo" }
    case "faq":
      return { section: "selected", elementId: "faq.0.question" }
    case "desktop-qa-done":
    case "responsive":
      return { section: "checklist", viewport: "desktop" }
    case "mobile-qa-done":
      return { section: "checklist", viewport: "mobile" }
    case "seo-review":
      return { section: "seo" }
    case "publish-review":
    case "draft-versioning":
    case "published":
    default:
      return { section: "checklist" }
  }
}

function ReadinessPanel({
  report,
  onEditItem,
}: {
  report: MicrositeReadinessReport
  onEditItem: (itemId: string) => void
}) {
  const { tr } = useBuilderI18n()
  const completedItems = report.items.filter((item) => item.ok).length
  const openItems = report.items.filter((item) => !item.ok)
  const blockedItems = report.items.filter(
    (item) => item.severity === "required" && !item.ok,
  )

  return (
    <ConfigSection title="Bereitschaft">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              {tr("Live-Bereitschaft")}
            </p>
            <p className="mt-1 text-2xl font-black tracking-[-0.05em] text-zinc-950">
              {completedItems}/{report.items.length} {tr("erledigt")}
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
        <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs font-medium leading-5 text-teal-900">
          {tr(
            "Nur ein fehlender Partnername blockiert die Veröffentlichung. Alle anderen Punkte sind Empfehlungen.",
          )}
        </p>
        {openItems.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">
              {tr("Checkliste")}
            </p>
            {openItems.map((item) => (
              <ReadinessItemRow
                key={item.id}
                item={item}
                onEdit={() => onEditItem(item.id)}
              />
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
  onEdit,
}: {
  item: MicrositeReadinessReport["items"][number]
  onEdit: () => void
}) {
  const { tr } = useBuilderI18n()
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group flex w-full items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left transition hover:border-teal-300 hover:bg-teal-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
      aria-label={`${tr(item.label)} – ${tr("Bearbeiten")}`}
    >
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
          {item.ok ? (
            <span className="grid size-4 place-items-center rounded-full bg-emerald-500 text-white">
              <Check aria-hidden="true" className="size-3" strokeWidth={3} />
            </span>
          ) : (
            <CircleAlert
              aria-hidden="true"
              className="size-4 text-amber-600"
              strokeWidth={2.4}
            />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-bold text-zinc-900">
            {tr(item.label)}
          </span>
          <span className="mt-0.5 block text-xs leading-4 text-zinc-500">
            {tr(item.detail)}
          </span>
        </span>
      </span>
      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-bold text-teal-700">
        {tr("Bearbeiten")}
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </button>
  )
}

/* Removed from the microsite options: data sources are managed in partner settings.
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
    ["Microsite-Bilder", "Start/Vorteile/Über uns separat", "Microsite"],
    ["SEO", "SEO-Titel und -Beschreibung separat", "Microsite"],
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

*/
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
      label: "Fehlt",
      detail: `Mindestens ${target.minWidth} x ${target.minHeight} px hochladen.`,
    }
  }

  if (!snapshot || snapshot.status === "loading") {
    return {
      tone: "loading" as const,
      label: "Bild wird geprüft",
      detail: "Bildgröße wird ausgelesen…",
    }
  }

  if (snapshot.status === "error" || !snapshot.width || !snapshot.height) {
    return {
      tone: "error" as const,
      label: "Bild nicht verfügbar",
      detail: "Das Bild konnte nicht geladen werden. Bitte erneut hochladen oder ersetzen.",
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
      label: "Bildauflösung zu niedrig",
      detail: `Mindestens ${target.minWidth} x ${target.minHeight} px verwenden. Aktuell: ${snapshot.width} x ${snapshot.height} px.`,
    }
  }

  if (aspectMismatch) {
    return {
      tone: "warn" as const,
      label: "Seitenverhältnis prüfen",
      detail: `Der Bildausschnitt könnte unpassend wirken. Aktuell: ${snapshot.width} x ${snapshot.height} px.`,
    }
  }

  return {
    tone: "good" as const,
    label: "Bildqualität gut",
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
  const hasTwoForOneDeal = partner.deals.some(isMicrositeTwoForOneDeal)
  const rewardStamps = Array.from(
    new Set(
      partner.reward_milestones
        .filter((milestone) => milestone.active !== false)
        .map((milestone) => milestone.required_stamps || 0)
        .filter((stamp) => stamp > 0),
    ),
  ).sort((first, second) => first - second)
  const rows: AssetQualityTarget[] = [
    { label: "Partnerlogo", value: partner.logo_url || "", source: "Profil", slot: "branding.logo", minWidth: 512, minHeight: 512, preferredAspect: 1, aspectTolerance: 0.2 },
    { label: "Startbild", value: config.hero.backgroundImageUrl, source: "Microsite", slot: "hero.backgroundImageUrl", minWidth: 1600, minHeight: 1200, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    ...(hasTwoForOneDeal
      ? [{ label: "2 für 1 Hintergrundbild", value: config.deals.topDealImageUrl, source: "Microsite", slot: "deals.topDealImageUrl", minWidth: 1200, minHeight: 900, preferredAspect: 4 / 3, aspectTolerance: 0.35 }]
      : []),
    { label: "Über-uns Hintergrundbild (Desktop)", value: config.elementText["content.aboutHeroImageUrl"] || "", source: "Microsite", slot: "content.aboutHeroImageUrl", minWidth: 1200, minHeight: 900, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    { label: "Über-uns linkes Kartenbild", value: config.elementText["content.aboutIngredientImageUrl"] || "", source: "Microsite", slot: "content.aboutIngredientImageUrl", minWidth: 900, minHeight: 1100, preferredAspect: 4 / 5, aspectTolerance: 0.25 },
    { label: "Über-uns rechtes Kartenbild", value: config.elementText["content.aboutLocationImageUrl"] || "", source: "Microsite", slot: "content.aboutLocationImageUrl", minWidth: 900, minHeight: 1100, preferredAspect: 4 / 5, aspectTolerance: 0.25 },
    { label: "Über-uns unteres Overlaybild (Desktop)", value: config.elementText["content.aboutPrepImageUrl"] || "", source: "Microsite", slot: "content.aboutPrepImageUrl", minWidth: 1200, minHeight: 900, preferredAspect: 4 / 3, aspectTolerance: 0.35 },
    ...rewardStamps.map((stamp) => ({
      label: `${stamp} Stempel Belohnungsbild`,
      value: config.elementText[`stamps.reward.${stamp}.image`] || "",
      source: "Microsite",
      slot: `stamps.reward.${stamp}.image`,
      minWidth: 900,
      minHeight: 900,
      preferredAspect: 1,
      aspectTolerance: 0.2,
    })),
    { label: "Bild im Telefon-Mockup", value: config.elementText["content.appPhoneScreenshotUrl"] || "/partner-details-page.jpg", source: "Microsite", slot: "content.appPhoneScreenshotUrl", minWidth: 720, minHeight: 1400, preferredAspect: 9 / 20, aspectTolerance: 0.12 },
    { label: "Benefitsi Footer Logo", value: config.elementText["footer.benefitsiLogo"] || "/benefitsi-logo-on-light.svg", source: "Microsite", slot: "footer.benefitsiLogo", minWidth: 256, minHeight: 64, preferredAspect: 4, aspectTolerance: 1.5 },
  ]
  const assetTargets = [
    ...rows
      .filter((row) => row.slot !== "branding.logo")
      .map((row) => ({ label: row.label, slot: row.slot })),
    ...micrositeMenuPreviewItems(
      menuItemsForMicrositeBuilder(partner),
      config.elementText["content.menuFeaturedItemKey"],
    ).map((item) => ({
      label: `Speisekarte – ${micrositeMenuItemDisplayName(item.name) || "Gericht"}`,
      slot: micrositeMenuItemImageId(item),
    })),
  ]
  const [selectedAssetTarget, setSelectedAssetTarget] = useState(
    assetTargets[0]?.slot || "hero.backgroundImageUrl",
  )
  const [pendingLibraryUploadTarget, setPendingLibraryUploadTarget] = useState("")
  const activeAssetTarget = assetTargets.some((target) => target.slot === selectedAssetTarget)
    ? selectedAssetTarget
    : assetTargets[0]?.slot || "hero.backgroundImageUrl"
  const renderedAssetLibrary = config.assets.library.filter((asset) =>
    isAvailableMicrositeLibraryAsset(asset, partner),
  )
  const assetSnapshots = useAssetQualitySnapshots(rows.map((row) => row.value))
  const qualityIssues = rows.filter((row) => {
    const quality = evaluateAssetQuality(row, assetSnapshots[row.value])
    return quality.tone === "warn" || quality.tone === "error" || quality.tone === "missing"
  })

  return (
    <ConfigSection title="Asset-Bibliothek">
      <div className="space-y-3">
        <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
          <p className="text-xs font-black text-zinc-900">
            {tr("Bild hochladen oder aus der Bibliothek zuweisen")}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-zinc-600">
            {tr("Ziel auswählen, anschließend ein neues Bild hochladen oder unten ein vorhandenes Bild anklicken. Die Änderung erscheint sofort in der Vorschau und wird mit dem Entwurf gespeichert.")}
          </p>
          <label className="mt-3 block space-y-1.5 text-xs font-bold text-zinc-700">
            {tr("Bildposition")}
            <select
              value={activeAssetTarget}
              onChange={(event) => setSelectedAssetTarget(event.target.value)}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              {assetTargets.map((target) => (
                <option key={target.slot} value={target.slot}>
                  {tr(target.label)}
                </option>
              ))}
            </select>
          </label>
          <input
            type="hidden"
            name="asset_library_target"
            value={pendingLibraryUploadTarget || activeAssetTarget}
          />
          <div className="mt-3">
            <AssetUploadField
              name="asset_library_file"
              label="Neues Bild direkt zur Asset-Bibliothek hinzufügen"
              onPreview={(url) => {
                setPendingLibraryUploadTarget(activeAssetTarget)
                setConfig((current) => applyAssetToSlot(current, activeAssetTarget, url))
              }}
            />
          </div>
        </div>
        {qualityIssues.length ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            <p className="font-black">{tr("Automatische Bildprüfung")}</p>
            <p className="mt-1">
              {tr(`${qualityIssues.length} Asset${qualityIssues.length === 1 ? "" : "s"} benötigen Aufmerksamkeit.`)}{" "}
              {tr("Ersetze unscharfe oder zu kleine Bilder vor der Veröffentlichung oder dem Druck.")}
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
                      {tr(quality.label)}
                    </span>
                    <p className="min-w-0 flex-1 text-[11px] leading-4 text-zinc-500">
                      {tr(quality.detail)}
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
        {renderedAssetLibrary.length ? (
        <div className="mt-4 border-t border-zinc-200 pt-3">
          <p className="text-xs font-black text-zinc-900">
            {tr("Gespeicherte Asset-Library")}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {renderedAssetLibrary.slice(-12).reverse().map((asset) => (
              <button
                key={`${asset.slot}-${asset.url}`}
                type="button"
                title={`${tr("Für ausgewählte Bildposition verwenden")}: ${asset.label}`}
                onClick={() => setConfig((current) => applyAssetToSlot(current, activeAssetTarget, asset.url))}
                className="group overflow-hidden rounded-lg border border-zinc-200 bg-white text-left transition hover:border-teal-400"
              >
                <span className="block aspect-square bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="block truncate px-1.5 py-1 text-[10px] font-bold text-zinc-600 group-hover:text-teal-700">
                  {asset.label}
                </span>
                <span className="block truncate px-1.5 pb-1.5 text-[9px] font-semibold text-teal-700">
                  {tr("Hier verwenden")}
                </span>
              </button>
            ))}
          </div>
        </div>
        ) : null}
      </div>
    </ConfigSection>
  )
}

function CurrentTemplateImagesPanel({
  partner,
  config,
  setConfig,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  const assetListId = `microsite-assets-${partner.id || "new"}`
  const assetChoices = config.assets.library
    .filter((asset) => isAvailableMicrositeLibraryAsset(asset, partner))
    .slice(-12)
    .reverse()
  const hasTwoForOneDeal = partner.deals.some(isMicrositeTwoForOneDeal)
  const rewardStamps = Array.from(
    new Set(
      partner.reward_milestones
        .filter((milestone) => milestone.active !== false)
        .map((milestone) => milestone.required_stamps || 0)
        .filter((stamp) => stamp > 0),
    ),
  ).sort((first, second) => first - second)

  return (
    <>
      <ConfigSection title="Marke & Startbereich Bilder">
        <TemplateImageEditor
          groupName="brand-hero-images"
          name="hero_image_url"
          label="Startbild"
          value={config.hero.backgroundImageUrl}
          uploadName="hero_file"
          assetListId={assetListId}
          assetChoices={assetChoices}
          onChange={(value) => updateHero(setConfig, "backgroundImageUrl", value)}
        />
      </ConfigSection>

      <ConfigSection title="Vorteils- und Belohnungsbilder">
        {hasTwoForOneDeal ? (
          <TemplateImageEditor
            groupName="deal-reward-images"
            name="top_deal_image_url"
            label="2 für 1 Hintergrundbild"
            value={config.deals.topDealImageUrl}
            uploadName="top_deal_file"
            assetListId={assetListId}
            assetChoices={assetChoices}
            onChange={(value) => updateDeals(setConfig, "topDealImageUrl", value)}
          />
        ) : null}
        {rewardStamps.map((stamp) => {
          const imageId = `stamps.reward.${stamp}.image`
          return (
            <TemplateImageEditor
              key={imageId}
              groupName="deal-reward-images"
              name={`reward_image_${stamp}`}
              label={`${stamp} Stempel Belohnungsbild`}
              value={config.elementText[imageId] || ""}
              uploadName={genericElementUploadName(imageId)}
              assetListId={assetListId}
              assetChoices={assetChoices}
              onChange={(value) =>
                setConfig((current) => setElementTextValue(current, imageId, value))
              }
            />
          )
        })}
        {!hasTwoForOneDeal && !rewardStamps.length ? (
          <p className="rounded-lg bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
            Keine aktiven Vorteils- oder Belohnungsbilder in diesem Template.
          </p>
        ) : null}
      </ConfigSection>

      <ConfigSection title="Über-uns Bilder">
        <TemplateImageEditor
          groupName="about-images"
          name="about_hero_image_url"
          label="Über-uns Hintergrundbild (Desktop)"
          value={config.elementText["content.aboutHeroImageUrl"] || ""}
          uploadName="about_hero_file"
          assetListId={assetListId}
          assetChoices={assetChoices}
          onChange={(value) =>
            setConfig((current) =>
              setElementTextValue(current, "content.aboutHeroImageUrl", value),
            )
          }
        />
        <TemplateImageEditor
          groupName="about-images"
          name="about_ingredient_image_url"
          label="Über-uns linkes Kartenbild"
          value={config.elementText["content.aboutIngredientImageUrl"] || ""}
          uploadName="about_ingredient_file"
          assetListId={assetListId}
          assetChoices={assetChoices}
          onChange={(value) =>
            setConfig((current) =>
              setElementTextValue(current, "content.aboutIngredientImageUrl", value),
            )
          }
        />
        <TemplateImageEditor
          groupName="about-images"
          name="about_location_image_url"
          label="Über-uns rechtes Kartenbild"
          value={config.elementText["content.aboutLocationImageUrl"] || ""}
          uploadName="about_location_file"
          assetListId={assetListId}
          assetChoices={assetChoices}
          onChange={(value) =>
            setConfig((current) =>
              setElementTextValue(current, "content.aboutLocationImageUrl", value),
            )
          }
        />
        <TemplateImageEditor
          groupName="about-images"
          name="about_prep_image_url"
          label="Über-uns unteres Overlaybild (Desktop)"
          value={config.elementText["content.aboutPrepImageUrl"] || ""}
          uploadName="about_prep_file"
          assetListId={assetListId}
          assetChoices={assetChoices}
          onChange={(value) =>
            setConfig((current) =>
              setElementTextValue(current, "content.aboutPrepImageUrl", value),
            )
          }
        />
      </ConfigSection>

      <ConfigSection title="App & Footer Bilder">
        <TemplateImageEditor
          groupName="app-footer-images"
          name="app_phone_screenshot_url"
          label="Bild im Telefon-Mockup"
          value={config.elementText["content.appPhoneScreenshotUrl"] || "/partner-details-page.jpg"}
          uploadName="app_phone_screenshot_file"
          assetListId={assetListId}
          assetChoices={assetChoices}
          onChange={(value) =>
            setConfig((current) =>
              setElementTextValue(current, "content.appPhoneScreenshotUrl", value),
            )
          }
        />
        <TemplateImageEditor
          groupName="app-footer-images"
          name="footer_benefitsi_logo_url"
          label="Benefitsi Footer Logo"
          value={config.elementText["footer.benefitsiLogo"] || "/benefitsi-logo-on-light.svg"}
          uploadName="footer_benefitsi_logo_file"
          assetListId={assetListId}
          assetChoices={assetChoices}
          onChange={(value) =>
            setConfig((current) =>
              setElementTextValue(current, "footer.benefitsiLogo", value),
            )
          }
        />
      </ConfigSection>
    </>
  )
}

function TemplateImageEditor({
  groupName,
  name,
  label,
  value,
  uploadName,
  assetListId,
  assetChoices,
  onChange,
}: {
  groupName: string
  name: string
  label: string
  value: string
  uploadName: string
  assetListId: string
  assetChoices: MicrositeConfig["assets"]["library"]
  onChange: (value: string) => void
}) {
  const { tr } = useBuilderI18n()
  const [failedValue, setFailedValue] = useState<string | null>(null)
  const imageAvailable = Boolean(value && failedValue !== value)

  return (
    <details
      name={groupName}
      className="group overflow-hidden rounded-lg bg-zinc-50"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 [&::-webkit-details-marker]:hidden">
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-white text-zinc-400 ring-1 ring-zinc-200">
          {imageAvailable ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              onError={() => setFailedValue(value)}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageOff aria-hidden="true" className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-black text-zinc-800">
          {tr(label)}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-3 border-t border-zinc-200 bg-white p-3">
        <EditorField
          name={name}
          label="Bild URL"
          value={value}
          onChange={onChange}
          placeholder="https://..."
          list={assetListId}
        />
        {assetChoices.length ? (
          <div>
            <p className="text-[11px] font-black text-zinc-700">
              {tr("Aus Asset-Bibliothek wählen")}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {assetChoices.map((asset) => (
                <button
                  key={`${asset.slot}-${asset.url}`}
                  type="button"
                  title={asset.label}
                  aria-label={`${tr("Bild auswählen")}: ${asset.label}`}
                  onClick={() => onChange(asset.url)}
                  className={`aspect-square overflow-hidden rounded-md border bg-zinc-100 transition hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    asset.url === value ? "border-teal-600 ring-2 ring-teal-100" : "border-zinc-200"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <AssetUploadField
          name={uploadName}
          label="Bild hochladen und beim Speichern ersetzen"
          onPreview={onChange}
        />
      </div>
    </details>
  )
}

function MenuImagesEditor({
  partner,
  config,
  setConfig,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  const { tr } = useBuilderI18n()
  const assetListId = `microsite-assets-${partner.id || "new"}`
  const allItems = menuItemsForMicrositeBuilder(partner)
  const items = micrositeMenuPreviewItems(
    allItems,
    config.elementText["content.menuFeaturedItemKey"],
  )
  const featuredItem = items[0]
  const supportingItems = items.slice(1)

  if (!items.length) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
        {tr("Sobald im Admin eine Speisekarte gepflegt ist, erscheinen hier automatisch die beliebtesten Gerichte.")}
      </p>
    )
  }

  const featuredImageId = micrositeMenuItemImageId(featuredItem)
  const featuredVisibilityId = micrositeMenuItemVisibilityId(featuredItem)
  const featuredImageUrl =
    config.elementText[featuredImageId] || featuredItem.image_url || ""
  const featuredImageVisible =
    config.elementText[featuredVisibilityId] !== "false"

  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-zinc-600">
        {tr(
          "Die ersten sechs Gerichte bilden die Microsite-Vorschau. Das erste Bild wird groß dargestellt.",
        )}
      </p>

      <label className="block space-y-1.5 text-xs font-bold text-zinc-700">
        {tr("Angezeigtes Hauptgericht")}
        <select
          value={micrositeMenuItemKey(featuredItem)}
          onChange={(event) =>
            setConfig((current) =>
              setElementTextValue(
                current,
                "content.menuFeaturedItemKey",
                event.target.value,
              ),
            )
          }
          className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        >
          {allItems.map((item) => (
            <option key={micrositeMenuItemKey(item)} value={micrositeMenuItemKey(item)}>
              {micrositeMenuItemDisplayName(item.name) || tr("Gericht")}
            </option>
          ))}
        </select>
        <span className="block font-normal leading-5 text-zinc-500">
          {tr("Wähle das Gericht für die große Karte aus.")}
        </span>
      </label>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="relative aspect-[16/9] overflow-hidden bg-zinc-100">
          {featuredImageVisible && featuredImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={featuredImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full place-items-center text-zinc-400">
              <ImageOff aria-hidden="true" className="size-7" />
            </span>
          )}
          <span className="absolute inset-x-3 bottom-3 w-fit rounded-full bg-zinc-950/78 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md">
            {tr("Großes Hauptbild")}
          </span>
        </div>
        <div className="space-y-3 p-3">
          <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3">
            <span className="min-w-0 truncate text-xs font-black text-zinc-900">
              {micrositeMenuItemDisplayName(featuredItem.name) || tr("Gericht")}
            </span>
            <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-zinc-700">
              {tr("Bild anzeigen")}
              <input
                type="checkbox"
                checked={featuredImageVisible}
                onChange={(event) =>
                  setConfig((current) =>
                    setElementTextValue(
                      current,
                      featuredVisibilityId,
                      event.target.checked ? "true" : "false",
                    ),
                  )
                }
                className="size-4 accent-teal-700"
              />
            </label>
          </div>
          <EditorField
            name={`visual_${featuredImageId}`}
            label="Bild URL"
            value={featuredImageUrl}
            onChange={(value) =>
              setConfig((current) =>
                setElementTextValue(current, featuredImageId, value),
              )
            }
            placeholder="https://..."
            list={assetListId}
          />
          <AssetUploadField
            name={genericElementUploadName(featuredImageId)}
            label="Bild hochladen und beim Speichern ersetzen"
            onPreview={(url) =>
              setConfig((current) =>
                setElementTextValue(
                  setElementTextValue(current, featuredImageId, url),
                  featuredVisibilityId,
                  "true",
                ),
              )
            }
          />
          <button
            type="button"
            onClick={() =>
              setConfig((current) =>
                setElementTextValue(
                  setElementTextValue(current, featuredImageId, ""),
                  featuredVisibilityId,
                  "true",
                ),
              )
            }
            className="text-xs font-bold text-teal-700 underline decoration-2 underline-offset-4 transition hover:text-teal-900"
          >
            {tr("Partnerbild verwenden")}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {supportingItems.map((item) => {
          const imageId = micrositeMenuItemImageId(item)
          const visibilityId = micrositeMenuItemVisibilityId(item)
          const imageUrl = config.elementText[imageId] || item.image_url || ""
          const showImage = config.elementText[visibilityId] !== "false"

          return (
            <details
              key={imageId}
              className="group overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 p-2.5 outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 [&::-webkit-details-marker]:hidden">
                {showImage && imageUrl ? (
                  <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-white text-zinc-400">
                    <ImageOff aria-hidden="true" className="size-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black text-zinc-900">
                    {micrositeMenuItemDisplayName(item.name) || tr("Gericht")}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-zinc-500">
                    {tr("Kleines Menübild")}
                    {!showImage ? ` · ${tr("Ohne Bild")}` : ""}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="space-y-3 border-t border-zinc-200 bg-white p-3">
                <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 text-xs font-bold text-zinc-800">
                  {tr("Bild anzeigen")}
                  <input
                    type="checkbox"
                    checked={showImage}
                    onChange={(event) =>
                      setConfig((current) =>
                        setElementTextValue(
                          current,
                          visibilityId,
                          event.target.checked ? "true" : "false",
                        ),
                      )
                    }
                    className="size-4 accent-teal-700"
                  />
                </label>
                <EditorField
                  name={`visual_${imageId}`}
                  label="Bild URL"
                  value={imageUrl}
                  onChange={(value) =>
                    setConfig((current) =>
                      setElementTextValue(current, imageId, value),
                    )
                  }
                  placeholder="https://..."
                  list={assetListId}
                />
                <AssetUploadField
                  name={genericElementUploadName(imageId)}
                  label="Bild hochladen und beim Speichern ersetzen"
                  onPreview={(url) =>
                    setConfig((current) =>
                      setElementTextValue(
                        setElementTextValue(current, imageId, url),
                        visibilityId,
                        "true",
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setConfig((current) =>
                      setElementTextValue(
                        setElementTextValue(current, imageId, ""),
                        visibilityId,
                        "true",
                      ),
                    )
                  }
                  className="text-xs font-bold text-teal-700 underline decoration-2 underline-offset-4 transition hover:text-teal-900"
                >
                  {tr("Partnerbild verwenden")}
                </button>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

function menuItemsForMicrositeBuilder(partner: PartnerWithDeals) {
  return partner.menus.flatMap((menu) => {
    const categoryItems = menu.categories.flatMap((category) => category.items)
    return categoryItems.length ? categoryItems : menu.items
  })
}

function isAvailableMicrositeLibraryAsset(
  asset: MicrositeConfig["assets"]["library"][number],
  partner: PartnerWithDeals,
) {
  return asset.source === "upload" || isRenderedMicrositeImageSlot(asset.slot, partner)
}

function isRenderedMicrositeImageSlot(
  slot: string,
  partner: PartnerWithDeals,
) {
  if (
    [
      "branding.logo",
      "hero.backgroundImageUrl",
      "content.aboutHeroImageUrl",
      "content.aboutIngredientImageUrl",
      "content.aboutLocationImageUrl",
      "content.aboutPrepImageUrl",
      "content.appPhoneScreenshotUrl",
      "footer.benefitsiLogo",
    ].includes(slot)
  ) {
    return true
  }

  if (slot === "deals.topDealImageUrl") {
    return partner.deals.some(isMicrositeTwoForOneDeal)
  }

  const rewardImageMatch = slot.match(/^stamps\.reward\.(\d+)\.image$/)
  if (rewardImageMatch) {
    const stamp = Number(rewardImageMatch[1])
    return partner.reward_milestones.some(
      (milestone) =>
        milestone.active !== false && milestone.required_stamps === stamp,
    )
  }

  return (
    /^content\.menuItem\.[a-z0-9_-]+\.imageUrl$/i.test(slot) ||
    /^social\.(instagram|facebook|tiktok|youtube|whatsapp|website|google|linkedin)\.iconUrl$/i.test(slot)
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
  onEditItem,
}: {
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
  onEditItem: (itemId: string) => void
}) {
  const { tr } = useBuilderI18n()
  const rows = [
    ["assetReviewDone", "Assets/Fallbacks geprüft", "asset-review"],
    ["desktopQaDone", "Desktopprüfung abgeschlossen", "desktop-qa-done"],
    ["mobileQaDone", "Mobilprüfung abgeschlossen", "mobile-qa-done"],
    ["seoReviewDone", "SEO/LLM geprüft", "seo-review"],
    ["publishReviewDone", "Veröffentlichung final geprüft", "publish-review"],
  ] as const
  const completed = rows.filter(([key]) => config.builder[key]).length

  return (
    <ConfigSection title="Abschlussprüfung">
      <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-black text-zinc-900">{tr("Checkliste")}</p>
          <span className="text-xs font-bold tabular-nums text-emerald-700">
            {completed}/{rows.length} {tr("erledigt")}
          </span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${(completed / rows.length) * 100}%` }}
          />
        </div>
        {rows.map(([key, label, editItemId]) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 transition focus-within:border-teal-300 focus-within:bg-teal-50/60"
          >
            <input
              type="checkbox"
              checked={config.builder[key]}
              aria-label={`${tr(label)} – ${tr("erledigt")}`}
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
              className="size-4 shrink-0 accent-teal-700"
            />
            <button
              type="button"
              onClick={() => onEditItem(editItemId)}
              className="group flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold text-zinc-800 outline-none transition hover:bg-white hover:text-teal-800 focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <span className="min-w-0 break-words">{tr(label)}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-teal-700">
                {tr("Bearbeiten")}
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </button>
          </div>
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
    ["5", "Live", Boolean(partner.microsite?.publishedVersion)],
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
          className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-black text-zinc-800 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
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
  const { tr } = useBuilderI18n()
  const feedEnabled = config.elementText["content.socialFeed.enabled"] !== "false"
  const feedPlatform = config.elementText["content.socialFeed.platform"] === "tiktok"
    ? "tiktok"
    : "instagram"
  const feedPostValues = Array.from({ length: 6 }, (_, index) =>
    config.elementText[`content.socialFeed.${feedPlatform}.${index}.url`]?.trim() || "",
  )
  const feedPostCount = new Set(
    feedPostValues.filter((value) => isValidSocialFeedPostUrl(feedPlatform, value)),
  ).size

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

        <div className="border-t border-zinc-200 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-zinc-900">{tr("Originalbeiträge einbetten")}</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                {tr("Bis zu sechs direkte Instagram-Post-/Reel- oder TikTok-Video-URLs eintragen. Der Instagram-Bereich erscheint erst, wenn mindestens zwei gültige Instagram-Beiträge hinterlegt sind.")}
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-zinc-700">
              {tr("Feed anzeigen")}
              <input
                type="checkbox"
                checked={feedEnabled}
                onChange={(event) =>
                  setConfig((current) =>
                    setElementTextValue(
                      current,
                      "content.socialFeed.enabled",
                      event.target.checked ? "true" : "false",
                    ),
                  )
                }
              />
            </label>
          </div>

          {feedEnabled ? (
            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
                {tr("Feed-Plattform")}
                <select
                  value={feedPlatform}
                  onChange={(event) =>
                    setConfig((current) =>
                      setElementTextValue(
                        current,
                        "content.socialFeed.platform",
                        event.target.value === "tiktok" ? "tiktok" : "instagram",
                      ),
                    )
                  }
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </label>

              {feedPlatform === "instagram" && feedPostCount < 2 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-800">
                  {feedPostCount}/2 {tr("gültige Beiträge")}. {tr("Instagram benötigt mindestens zwei Beiträge, bevor der Bereich auf der Microsite angezeigt wird.")}
                </p>
              ) : null}

              {Array.from({ length: 6 }, (_, index) => index).map((index) => {
                const value = feedPostValues[index] || ""
                const invalid = Boolean(value) && !isValidSocialFeedPostUrl(feedPlatform, value)

                return (
                  <div key={`${feedPlatform}-${index}`}>
                    <EditorField
                      name={`social_feed_${feedPlatform}_${index}_url`}
                      label={`Beitrag ${index + 1} URL`}
                      value={value}
                      onChange={(nextValue) =>
                        setConfig((current) =>
                          setElementTextValue(
                            current,
                            `content.socialFeed.${feedPlatform}.${index}.url`,
                            nextValue,
                          ),
                        )
                      }
                      placeholder="Direkte Instagram-Post-/Reel- oder TikTok-Video-URL"
                    />
                    {invalid ? (
                      <p className="mt-1 text-[10px] font-semibold text-rose-700">
                        {tr("Bitte einen direkten Post-, Reel- oder Video-Link verwenden, keinen Profil-Link.")}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </ConfigSection>
  )
}

function isValidSocialFeedPostUrl(
  platform: "instagram" | "tiktok",
  value: string,
) {
  if (!value) return false

  try {
    const url = new URL(value)
    if (platform === "instagram") {
      return /(^|\.)instagram\.com$/i.test(url.hostname) &&
        /^\/(p|reel|tv)\/[^/]+/i.test(url.pathname)
    }

    return /(^|\.)tiktok\.com$/i.test(url.hostname) && /\/video\/\d+/i.test(url.pathname)
  } catch {
    return false
  }
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
      <ConfigSection title="Ausgewähltes Element">
        <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
          {tr("Klicke ein Element in der Vorschau an, um es hier direkt zu bearbeiten.")}
        </p>
      </ConfigSection>
    )
  }

  const elementStyle = config.elementStyles[element.id] ?? {}
  const isText = element.kind === "text"
  const isIcon = element.kind === "icon"
  const isImage = element.kind === "image"
  const isGroup = element.kind === "group"
  const isNavigationGroup = element.id === "navigation.group"
  const socialGroupMatch = element.id.match(/^social\.([a-z]+)$/)
  const isMenuItemImage = /^content\.menuItem\.[a-z0-9_-]+\.imageUrl$/.test(
    element.id,
  )
  const menuItemVisibilityId = isMenuItemImage
    ? element.id.replace(/\.imageUrl$/, ".showImage")
    : ""
  const menuItemImageVisible = menuItemVisibilityId
    ? config.elementText[menuItemVisibilityId] !== "false"
    : true
  const iconImageId = `${element.id}.image`

  return (
    <ConfigSection title={`Element: ${element.label}`}>
      <div className="space-y-3">
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-[11px] font-medium leading-5 text-zinc-600">
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
            {isMenuItemImage ? (
              <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 text-xs font-bold text-zinc-800">
                {tr("Bild anzeigen")}
                <input
                  type="checkbox"
                  checked={menuItemImageVisible}
                  onChange={(event) =>
                    setConfig((current) =>
                      setElementTextValue(
                        current,
                        menuItemVisibilityId,
                        event.target.checked ? "true" : "false",
                      ),
                    )
                  }
                  className="size-4 accent-teal-700"
                />
              </label>
            ) : null}
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
                  setConfig((current) => {
                    const next = element.update(current, url)
                    return isMenuItemImage
                      ? setElementTextValue(
                          next,
                          menuItemVisibilityId,
                          "true",
                        )
                      : next
                  })
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
                    {tr(option.label)}
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
    </ConfigSection>
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
        {tr("Automatisch zurücksetzen")}
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
  partner?: PartnerWithDeals,
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
    "deals.label": textElement("Vorteils-Label", config.deals.label, (current, value) => ({
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
    "deals.topDealImageUrl": {
      label: "Vorteil Bild",
      kind: "image",
      value: config.deals.topDealImageUrl,
      uploadName: "top_deal_file",
      update: (current, value) => ({
        ...current,
        deals: { ...current.deals, topDealImageUrl: value },
      }),
    },
    "deals.headline": textElement("Vorteils-Überschrift", config.deals.headline, (current, value) => ({
      ...current,
      deals: { ...current.deals, headline: value },
    })),
    "deals.slogan": textElement("Vorteils-Slogan", config.deals.slogan, (current, value) => ({
      ...current,
      deals: { ...current.deals, slogan: value },
    })),
    "deals.description": textElement("Vorteilsbeschreibung", config.deals.description, (current, value) => ({
      ...current,
      deals: { ...current.deals, description: value },
    })),
    "deals.topDealHeadline": textElement("Vorteil Überschrift", config.deals.topDealHeadline, (current, value) => ({
      ...current,
      deals: { ...current.deals, topDealHeadline: value },
    })),
    "deals.topDealLabel": textElement("Vorteil Label", config.deals.topDealLabel, (current, value) => ({
      ...current,
      deals: { ...current.deals, topDealLabel: value },
    })),
    "deals.topDealDescription": textElement("Vorteil Beschreibung", config.deals.topDealDescription, (current, value) => ({
      ...current,
      deals: { ...current.deals, topDealDescription: value },
    })),
    "deals.topDealButtonLabel": textElement("Vorteil Button", config.deals.topDealButtonLabel, (current, value) => ({
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
      label: "Über uns Hintergrundbild (Desktop)",
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
      label: "Über uns linkes Kartenbild",
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
      label: "Über uns rechtes Kartenbild",
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
      label: "Über uns unteres Overlaybild (Desktop)",
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

  if (/^content\.menuItem\.[a-z0-9_-]+\.imageUrl$/.test(id)) {
    const previewItems = partner
      ? micrositeMenuPreviewItems(
          menuItemsForMicrositeBuilder(partner),
          config.elementText["content.menuFeaturedItemKey"],
        )
      : []
    const itemIndex = previewItems.findIndex(
      (candidate) => micrositeMenuItemImageId(candidate) === id,
    )
    const item = itemIndex >= 0 ? previewItems[itemIndex] : undefined

    return {
      id,
      label:
        itemIndex === 0
          ? `Großes Menübild – ${micrositeMenuItemDisplayName(item?.name) || "Gericht"}`
          : `${micrositeMenuItemDisplayName(item?.name) || "Gericht"} Menübild`,
      kind: "image",
      value: config.elementText[id] || item?.image_url || "",
      uploadName: genericElementUploadName(id),
      update: (current, value) => setElementTextValue(current, id, value),
    }
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
      label: `Vorteil Punkt ${index + 1}`,
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
      fallback: "Exklusive Partnervorteile",
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
      label: "Willkommen Titel",
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
    "content.appVisual.0": {
      label: "App Visual 1",
      fallback: "Benefitsi App",
    },
    "content.appVisual.1": {
      label: "App Visual 2",
      fallback: "Speisekarte",
    },
    "content.appVisual.2": {
      label: "App Visual 3",
      fallback: "Scan & Vorteil",
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

  if (id === "content.appPhoneScreenshotUrl") {
    return {
      id,
      label: "Bild im Telefon-Mockup",
      kind: "image",
      value: config.elementText[id] || "/partner-details-page.jpg",
      uploadName: "app_phone_screenshot_file",
      update: (current, value) => setElementTextValue(current, id, value),
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
          "Premium-Mitglieder erhalten zusätzliche Vorteile, exklusive Belohnungen und besondere Aktionen bei teilnehmenden lokalen Partnern.",
      },
      {
        question: "Wie nutze ich den 2 für 1 Vorteil?",
        answer:
          "Aktiviere den Vorteil vor deiner Bestellung in der App. Vor Ort zeigst du den aktiven Vorteil einfach beim Bezahlen vor.",
      },
      {
        question: "Brauche ich die Benefitsi App?",
        answer:
          "Ja, Vorteile, Stempel und Belohnungen werden digital in der App gesammelt und eingelöst.",
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
      label: "Willkommen Icon",
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
        `Vorteil Punkt ${Number(topDealBulletIconMatch[1]) + 1} Icon`,
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

function BuilderCategory({
  title,
  description,
  children,
  id,
}: {
  title: string
  description: string
  children: ReactNode
  id?: string
}) {
  const { tr } = useBuilderI18n()

  return (
    <section
      id={id}
      className="min-w-0 scroll-mt-24 rounded-2xl bg-zinc-50/80 p-2.5 ring-1 ring-zinc-100"
    >
      <div className="px-1 pb-1">
        <h3 className="text-[13px] font-black tracking-[-0.01em] text-zinc-950">
          {tr(title)}
        </h3>
        <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">
          {tr(description)}
        </p>
      </div>
      <div className="mt-2 min-w-0 space-y-2">
        {children}
      </div>
    </section>
  )
}

function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  const { tr } = useBuilderI18n()
  return (
    <details
      name="microsite-builder-settings"
      data-config-section="true"
      className="group min-w-0 rounded-xl border border-zinc-200 bg-white px-3 shadow-[0_8px_24px_-22px_rgba(15,23,42,.35)]"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-bold text-zinc-800 outline-none transition hover:text-teal-700 focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-teal-200 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 break-words">{tr(title)}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180 group-open:text-teal-600"
          strokeWidth={2.2}
        />
      </summary>
      <div className="min-w-0 space-y-3 pb-4 pt-1">{children}</div>
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

function PaletteControl({
  logoUrl,
  config,
  setConfig,
}: {
  logoUrl: string
  config: MicrositeConfig
  setConfig: Dispatch<SetStateAction<MicrositeConfig>>
}) {
  const { tr } = useBuilderI18n()
  const isAuto = config.branding.paletteMode === "auto"
  const [status, setStatus] = useState<"idle" | "loading" | "logo" | "derived" | "fallback">(
    isAuto ? "loading" : "idle",
  )
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!isAuto) {
      return
    }

    let active = true
    extractThemePalette(logoUrl).then((palette) => {
      if (!active) return

      setStatus(palette.source)
      setConfig((current) => {
        if (
          current.branding.accent === palette.primary &&
          current.branding.accentSecondary === palette.secondary &&
          current.branding.accentTertiary === palette.tertiary
        ) {
          return current
        }

        return {
          ...current,
          branding: {
            ...current.branding,
            accent: palette.primary,
            accentSecondary: palette.secondary,
            accentTertiary: palette.tertiary,
          },
        }
      })
    })

    return () => {
      active = false
    }
  }, [isAuto, logoUrl, refreshToken, setConfig])

  const setMode = (mode: "auto" | "manual") => {
    setStatus(mode === "auto" ? "loading" : "idle")
    if (mode === "auto") {
      setRefreshToken((current) => current + 1)
    }
    setConfig((current) => ({
      ...current,
      branding: { ...current.branding, paletteMode: mode },
    }))
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <input type="hidden" name="palette_mode" value={config.branding.paletteMode} />
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1 ring-1 ring-zinc-200">
        <button
          type="button"
          onClick={() => setMode("auto")}
          className={`rounded-md px-3 py-2 text-xs font-black transition ${
            isAuto ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"
          }`}
          aria-pressed={isAuto}
        >
          {tr("Auto aus Logo")}
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-md px-3 py-2 text-xs font-black transition ${
            !isAuto ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"
          }`}
          aria-pressed={!isAuto}
        >
          {tr("Manuell")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2" aria-label={tr("Aktive 3-Farben-Palette")}>
        {[
          [config.branding.accent, "Primär"],
          [config.branding.accentSecondary, "Kontrast"],
          [config.branding.accentTertiary, "Highlight"],
        ].map(([color, label]) => (
          <div key={label} className="min-w-0">
            <span
              className="block h-12 rounded-lg shadow-[0_8px_18px_rgba(15,23,42,.12)] ring-1 ring-black/5"
              style={{ backgroundColor: color }}
            />
            <span className="mt-1 block truncate text-[10px] font-bold text-zinc-500">
              {tr(label)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-4 text-zinc-500" aria-live="polite">
        {status === "loading"
          ? tr("Logo wird analysiert …")
          : status === "logo"
            ? tr("Drei kontrastreiche Farben wurden aus dem Partnerlogo gewählt.")
            : status === "derived"
              ? tr("Logo-Farben wurden zu einer vollständigen professionellen Palette ergänzt.")
              : status === "fallback"
                ? tr("Benefitsi Blau-Palette aktiv – das Logo ist einfarbig, fehlt oder kann nicht analysiert werden.")
                : tr("Manuelle Farben sind aktiv.")}
      </p>

      {isAuto ? (
        <button
          type="button"
          onClick={() => {
            setStatus("loading")
            setRefreshToken((current) => current + 1)
          }}
          disabled={status === "loading"}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-black text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60"
        >
          {tr("Palette neu aus Logo auswählen")}
        </button>
      ) : null}

      <div className="grid gap-3">
        <ColorField
          name="accent"
          label="Primärfarbe"
          value={config.branding.accent}
          disabled={isAuto}
          onChange={(value) => updateBranding(setConfig, "accent", value)}
        />
        <ColorField
          name="accent_secondary"
          label="Kontrastfarbe"
          value={config.branding.accentSecondary}
          disabled={isAuto}
          onChange={(value) => updateBranding(setConfig, "accentSecondary", value)}
        />
        <ColorField
          name="accent_tertiary"
          label="Highlightfarbe"
          value={config.branding.accentTertiary}
          disabled={isAuto}
          onChange={(value) => updateBranding(setConfig, "accentTertiary", value)}
        />
      </div>
    </div>
  )
}

function ColorField({
  name,
  label,
  value,
  disabled = false,
  onChange,
}: {
  name: string
  label: string
  value: string
  disabled?: boolean
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
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-zinc-300 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`${tr(label)} Picker`}
        />
        <input
          name={name}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          placeholder="#118cff"
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
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
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const clearUpload = () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      setFileName("")
    }

    window.addEventListener(MICROSITE_UPLOADS_CLEARED_EVENT, clearUpload)

    return () => {
      window.removeEventListener(MICROSITE_UPLOADS_CLEARED_EVENT, clearUpload)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  return (
    <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
      {tr(label)}
      <input
        type="file"
        name={name}
        data-microsite-upload
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => {
          const file = event.target.files?.[0]

          setFileName(file?.name ?? "")

          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current)
            previewUrlRef.current = null
          }

          if (file && onPreview) {
            const previewUrl = URL.createObjectURL(file)
            previewUrlRef.current = previewUrl
            onPreview(previewUrl)
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

function MicrositeLanguagePicker({
  language,
  onChange,
}: {
  language: MicrositeConfig["language"]
  onChange: (language: MicrositeConfig["language"]) => void
}) {
  const { tr } = useBuilderI18n()

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold text-zinc-700">{tr("Microsite-Sprache")}</p>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            {tr("Aktualisiert Navigation, Standardtexte und SEO-Grundcopy.")}
          </p>
        </div>
        <div
          className="inline-flex shrink-0 rounded-md border border-zinc-300 bg-white p-1"
          role="group"
          aria-label={tr("Microsite-Sprache")}
        >
          {(["de", "en"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={language === option}
              className={`rounded px-3 py-1.5 text-xs font-bold uppercase transition ${
                language === option
                  ? "bg-teal-700 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
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

function applyMicrositeLanguage(
  config: MicrositeConfig,
  partner: PartnerWithDeals,
  language: MicrositeConfig["language"],
): MicrositeConfig {
  const name = partner.short_name?.trim() || partner.name?.trim() || config.hero.headline
  const location = config.hero.locationText
  const copy =
    language === "en"
      ? englishMicrositeCopyForPartner(partner, name, location)
      : defaultMicrositeCopyForPartner(partner)
  const navigation =
    language === "en"
      ? [
          { label: "Benefits", anchor: "deals" },
          { label: "Stamp Card", anchor: "stempelkarte" },
          { label: copy.menuLabel, anchor: "speisekarte" },
          { label: "About", anchor: "ueber-uns" },
          { label: "Benefitsi App", anchor: "app" },
          { label: "Contact", anchor: "kontakt" },
        ]
      : [
          { label: "Vorteile", anchor: "deals" },
          { label: "Stempelkarte", anchor: "stempelkarte" },
          { label: copy.menuLabel, anchor: "speisekarte" },
          { label: "Über Uns", anchor: "ueber-uns" },
          { label: "Benefitsi-App", anchor: "app" },
          { label: "Kontakt", anchor: "kontakt" },
        ]
  const languageText =
    language === "en"
      ? {
          "content.appKicker": "In the Benefitsi app",
          "content.appBenefit.0": "Check stamp progress anytime",
          "content.appBenefit.1": "Unlock rewards automatically",
          "content.appBenefit.2": "Use benefits quickly and digitally",
          "content.appQrLabel": "Open app & check in",
          "content.appQrText": "Scan QR code",
          "content.appButtonLabel": "Open app",
          "content.appVisual.0": "Benefitsi App",
          "content.appVisual.1": copy.menuLabel,
          "content.appVisual.2": "Scan & reward",
          "content.contactSocialText": "Follow us for benefits and news.",
        }
      : {
          "content.appKicker": "In der Benefitsi App",
          "content.appBenefit.0": "Stempelstand jederzeit einsehbar",
          "content.appBenefit.1": "Belohnungen automatisch freischalten",
          "content.appBenefit.2": "Einfach, schnell & digital",
          "content.appQrLabel": "App öffnen & einchecken",
          "content.appQrText": "QR-Code scannen",
          "content.appButtonLabel": "App öffnen",
          "content.appVisual.0": "Benefitsi App",
          "content.appVisual.1": copy.menuLabel,
          "content.appVisual.2": "Scan & Vorteil",
          "content.contactSocialText": "Folge uns für Aktionen & Neuigkeiten.",
        }

  return {
    ...config,
    language,
    navigation: { links: navigation },
    hero: {
      ...config.hero,
      badgeText:
        language === "en"
          ? "Official Benefitsi Partner"
          : "Offizieller Benefitsi Partner",
          primaryButtonLabel: language === "en" ? "View benefits" : "Vorteile ansehen",
      secondaryButtonLabel:
        language === "en" ? `View ${copy.menuLabel}` : `${copy.menuLabel} ansehen`,
      slogan: copy.heroSlogan,
    },
    deals: {
      ...config.deals,
      label: language === "en" ? "Benefits & campaigns" : "Vorteile & Aktionen",
      headline:
        language === "en"
          ? `Exclusive Benefitsi benefits at ${name}`
          : `Exklusive Benefitsi Vorteile bei ${name}`,
      slogan: language === "en" ? "Enjoy more, save more." : "Mehr genießen, mehr sparen!",
      description:
        language === "en"
          ? "Discover the best benefits and reward every visit."
          : "Entdecke die besten Vorteile und belohne dich bei jedem Besuch.",
      topDealButtonLabel:
        language === "en"
          ? "Activate benefit in the app"
          : "Vorteil in der App aktivieren",
    },
    stamps: {
      ...config.stamps,
      label: language === "en" ? "Stamp Card" : "Stempelkarte",
      headline:
        language === "en"
          ? "Collect stamps. Enjoy rewards."
          : "Stempel sammeln. Belohnung genießen.",
      slogan: language === "en" ? "Your loyalty pays off." : "Ihre Treue wird belohnt!",
    },
    content: {
      ...config.content,
      menuLabel: copy.menuLabel,
      menuHeadline: copy.menuHeadline,
      menuDescription: copy.menuDescription,
      aboutLabel: language === "en" ? "About us" : "Über uns",
      aboutHeadline:
        language === "en"
          ? `${name} at a glance`
          : `${name} auf einen Blick`,
      aboutText: copy.aboutText,
      contactLabel: language === "en" ? "Contact" : "Kontakt",
      contactHeadline: copy.contactHeadline,
      appHeadline: copy.appHeadline,
      appText: copy.appText,
      footerText: copy.footerText,
    },
    seo: {
      ...config.seo,
      title:
        language === "en"
          ? `${name} in ${location} | Benefits, stamp card & menu`
          : `${name} in ${location} | Vorteile, Stempelkarte & Speisekarte`,
      description:
        language === "en"
          ? `${name}: ${location}. Benefitsi benefits, stamp card, menu, opening hours and contact at a glance.`
          : `${name}: ${location}. Benefitsi Vorteile, Stempelkarte, Speisekarte, Öffnungszeiten und Kontakt auf einen Blick.`,
      keywords:
        language === "en"
          ? [name, location, "Benefitsi", "benefits", "stamp card", "menu"]
          : [name, location, "Benefitsi", "Vorteile", "Stempelkarte", "Speisekarte"],
    },
    elementText: {
      ...config.elementText,
      ...languageText,
    },
  }
}

function englishMicrositeCopyForPartner(
  partner: PartnerWithDeals,
  name: string,
  location: string,
) {
  const categoryText = partner.category?.filter(Boolean).slice(0, 3).join(", ")
  const description = partner.description?.trim()
  const profile = inferMicrositePartnerProfile(partner)

  if (profile === "salon") {
    return {
      heroSlogan: "Style, care and trust in one place.",
      aboutText:
        description ||
        `${name} combines personal service, reliable appointments and a polished studio experience in ${location}.`,
      menuLabel: "Services",
      menuHeadline: "Popular services at a glance.",
      menuDescription:
        "Treatments, add-ons and signature services are presented clearly for quick booking decisions.",
      contactHeadline: "Book your next appointment.",
      appHeadline: "Your benefits and repeat visits in one app",
      appText:
        "Activate benefits, collect loyalty rewards and stay connected with your favorite studio.",
      footerText: "Modern service, loyal guests and a strong local presence.",
    }
  }

  if (profile === "wellness") {
    return {
      heroSlogan: "Calm, care and a reason to come back.",
      aboutText:
        description ||
        `${name} creates a restorative experience in ${location} with premium treatments and Benefitsi rewards for returning guests.`,
      menuLabel: "Treatments",
      menuHeadline: "Signature treatments and member favorites.",
      menuDescription:
        "Massages, packages, wellness rituals and premium add-ons can be explored in a calm, high-quality layout.",
      contactHeadline: "Ready to unwind?",
      appHeadline: "Wellness benefits and loyalty rewards in your pocket",
      appText:
        "Unlock tailored benefits, collect visits and make it easier to come back.",
      footerText: "Calm premium storytelling, reliable care and stronger retention for local wellness partners.",
    }
  }

  if (profile === "cinema") {
    return {
      heroSlogan: "Nights out, member perks and local experiences worth repeating.",
      aboutText:
        description ||
        `${name} turns visits into repeatable experiences with exclusive benefits and stronger local discovery in ${location}.`,
      menuLabel: "Highlights",
      menuHeadline: "Experiences guests should not miss.",
      menuDescription:
        "Screenings, events, bundles or special activities are presented in a fast, scannable way.",
      contactHeadline: "Plan your next visit.",
      appHeadline: "Your next event and every benefit, always at hand",
      appText:
        "Promote highlights, collect repeat visits and guide guests toward the next booking.",
      footerText: "More visibility for events, better discovery and repeat visits with Benefitsi.",
    }
  }

  return {
    heroSlogan: "Fresh, local and always worth another visit.",
    aboutText:
      description ||
      `${name} brings local flavor, reliable service and Benefitsi rewards together in ${location}.`,
    menuLabel: "Menu",
    menuHeadline: "Popular dishes and guest favorites.",
    menuDescription:
      "Show the current menu, highlight favorites and let guests explore before visiting.",
    contactHeadline: "Ready for your next visit?",
    appHeadline: "All local benefits in your Benefitsi app",
    appText:
      "Activate benefits, collect loyalty stamps and keep your favorite partner one tap away.",
    footerText: categoryText
      ? `${categoryText}, loyal guests and one microsite for more repeat visits.`
      : "Local flavor, loyal guests and one microsite for more repeat visits.",
  }
}

// Reserved for the future all-or-nothing public microsite localization flow.
// Keeping the helpers referenced prevents them from being mistaken for active UI.
void MicrositeLanguagePicker
void applyMicrositeLanguage

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
