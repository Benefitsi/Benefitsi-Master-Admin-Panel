// This module is used by authenticated server actions only. Configuration is
// supplied by the caller; no credentials, uploads or extracted content are saved.
import { Buffer } from "node:buffer"
import { randomUUID } from "node:crypto"
import type { AiMenuDraft } from "./menu-ai-types"

// Leave room for multipart fields under the hosting request-body limit.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const MAX_PHOTOS = 8
const MAX_CATEGORIES = 40
const MAX_ITEMS = 200
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const SPLIT_MESSAGE = "Die Speisekarte ist zu umfangreich. Bitte in kleinere Teile mit höchstens 40 Kategorien und 200 Artikeln aufteilen und erneut einlesen."
const INCOMPLETE_MESSAGE = "Die Speisekarte konnte nicht vollständig eingelesen werden. Bitte vollständig lesbare Seiten hochladen oder die Datei in kleinere Teile aufteilen. Es wurde nichts importiert."

type ExtractOptions = {
  bridgeUrl: string
  bridgeSecret: string
  fetch?: typeof globalThis.fetch
}
type MenuMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp"
type MenuAttachment = { mimeType: MenuMime; data: string }

export async function extractMenuFromFiles(files: File[], options: ExtractOptions): Promise<AiMenuDraft> {
  if (!options.bridgeUrl?.trim() || !options.bridgeSecret?.trim()) {
    throw new Error("Der Hermes-Menü-Agent ist noch nicht eingerichtet. Bitte das Benefitsi-Team kontaktieren oder die Speisekarte manuell anlegen.")
  }
  let endpoint: URL
  try {
    const configured = new URL(options.bridgeUrl.trim())
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname)
    if (configured.username || configured.password || configured.search || configured.hash ||
        (configured.protocol !== "https:" && !(configured.protocol === "http:" && local))) throw new Error()
    endpoint = new URL("/hermes/menu-extract", configured)
  } catch {
    throw new Error("Die Hermes/M1-Bridge ist nicht korrekt konfiguriert. Bitte das Benefitsi-Team kontaktieren.")
  }
  const filesToSend = await prepareFiles(files)
  const requestId = randomUUID()
  let response: Response
  try {
    response = await (options.fetch ?? globalThis.fetch)(endpoint.toString(), {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.bridgeSecret.trim()}` },
      signal: AbortSignal.timeout(145_000),
      body: JSON.stringify({ action: "menu-extract", profile: "benefitsi-menu", task: "extract-menu", schemaVersion: 1, requestId, files: filesToSend }),
    })
  } catch {
    throw new Error("Die Verbindung zum Hermes-Menü-Agenten ist fehlgeschlagen oder hat zu lange gedauert. Bitte erneut versuchen.")
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error("Der Hermes-Menü-Agent ist ausgelastet. Bitte später erneut versuchen.")
    if (response.status === 401 || response.status === 403) throw new Error("Der Zugang zum Hermes-Menü-Agenten ist nicht verfügbar. Bitte das Benefitsi-Team kontaktieren.")
    throw new Error("Der Hermes-Menü-Agent konnte die Karte nicht vollständig verarbeiten. Bitte eine gut lesbare Datei mit höchstens acht Seiten verwenden und erneut versuchen.")
  }
  const payload = await readProviderResponse(response)
  if (payload.profile !== "benefitsi-menu" || payload.task !== "extract-menu" || payload.schemaVersion !== 1 || payload.requestId !== requestId) {
    throw new Error("Die Antwort des Hermes-Menü-Agenten passt nicht zu diesem Auftrag. Bitte erneut versuchen.")
  }
  return validateDraft(payload.draft, false)
}

/** Final mutation boundary: this refuses unresolved extraction values. */
export function validateReviewedMenuDraft(value: unknown): AiMenuDraft {
  return validateDraft(value, true)
}

async function prepareFiles(files: File[]): Promise<MenuAttachment[]> {
  if (!Array.isArray(files) || files.length === 0) throw new Error("Bitte eine PDF-Datei oder bis zu acht Fotos der Speisekarte auswählen.")
  if (files.length > MAX_PHOTOS) throw new Error("Bitte höchstens acht Fotos gleichzeitig hochladen.")
  let totalBytes = 0
  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) throw new Error("Eine ausgewählte Datei ist leer oder ungültig. Bitte erneut auswählen.")
    totalBytes += file.size
  }
  if (totalBytes > MAX_UPLOAD_BYTES) throw new Error("Die Dateien dürfen zusammen höchstens 4 MiB groß sein. Bitte verkleinern oder in mehrere Importe aufteilen.")
  const parts: MenuAttachment[] = []
  for (const file of files) {
    let bytes: Buffer
    try {
      bytes = Buffer.from(await file.arrayBuffer())
    } catch {
      throw new Error("Eine Datei konnte nicht gelesen werden. Bitte erneut auswählen.")
    }
    if (bytes.byteLength !== file.size) throw new Error("Eine Datei wurde unvollständig übertragen. Bitte erneut auswählen.")
    const mimeType = detectMime(bytes)
    // Some browsers leave File.type empty; the bytes still establish its type.
    if (!mimeType || (file.type && file.type.toLowerCase() !== mimeType)) {
      throw new Error("Eine Datei hat ein ungültiges Format. Erlaubt sind PDF, JPEG, PNG und WebP; Dateiinhalte und Dateityp müssen übereinstimmen.")
    }
    if (mimeType === "application/pdf" && files.length !== 1) {
      throw new Error("Bitte eine einzelne PDF-Datei oder mehrere Fotos hochladen. PDFs können nicht mit weiteren Dateien kombiniert werden.")
    }
    parts.push({ mimeType, data: bytes.toString("base64") })
  }
  return parts
}

function detectMime(bytes: Buffer): MenuMime | null {
  if (/^%PDF-[12]\.\d/.test(bytes.subarray(0, 8).toString("ascii"))) return "application/pdf"
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))) return "image/webp"
  return null
}

async function readProviderResponse(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Der KI-Dienst hat keine Antwort zurückgegeben. Bitte erneut versuchen.")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new Error(SPLIT_MESSAGE)
      }
      chunks.push(chunk.value)
    }
  } catch (error) {
    if (error instanceof Error && error.message === SPLIT_MESSAGE) throw error
    throw new Error("Die KI-Antwort wurde nicht vollständig übertragen. Bitte erneut versuchen.")
  } finally {
    reader.releaseLock()
  }
  try {
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!isRecord(payload)) throw new Error("invalid payload")
    return payload
  } catch {
    throw new Error("Der KI-Dienst hat eine ungültige Antwort zurückgegeben. Bitte erneut versuchen.")
  }
}

function validateDraft(value: unknown, reviewed: boolean): AiMenuDraft {
  const menu = record(value, ["name", "currency", "categories", "warnings", "complete"], "Speisekarte")
  if (menu.complete !== true) throw new Error(INCOMPLETE_MESSAGE)
  const name = text(menu.name, "Menüname", 120, reviewed)
  const currency = text(menu.currency, "Währung", 3, reviewed)
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new Error("Bitte die Währung als dreistelligen Code angeben, zum Beispiel EUR.")
  if (reviewed && currency !== "EUR") throw new Error("Der Menüimport unterstützt derzeit nur EUR. Es erfolgt keine automatische Umrechnung. Bitte die Originalpreise in EUR prüfen und eintragen.")
  const warnings = textList(menu.warnings, "Hinweise", 40, 1000)
  if (!Array.isArray(menu.categories) || menu.categories.length === 0) throw new Error("Die Speisekarte benötigt mindestens eine Kategorie mit Artikeln.")
  if (menu.categories.length > MAX_CATEGORIES) throw new Error(SPLIT_MESSAGE)
  let itemCount = 0
  const categories = menu.categories.map((rawCategory, categoryIndex) => {
    const label = `Kategorie ${categoryIndex + 1}`
    const category = record(rawCategory, ["name", "items"], label)
    const categoryName = text(category.name, `${label}: Name`, 120, true)
    if (!Array.isArray(category.items) || category.items.length === 0) throw new Error(`${label} benötigt mindestens einen Artikel.`)
    itemCount += category.items.length
    if (itemCount > MAX_ITEMS) throw new Error(SPLIT_MESSAGE)
    const items = category.items.map((rawItem, itemIndex) => {
      const itemLabel = `${label}, Artikel ${itemIndex + 1}`
      const item = record(rawItem, ["name", "description", "price", "allergens", "tags", "note"], itemLabel)
      if (item.price === null ? reviewed : typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0) {
        throw new Error(`${itemLabel}: Bitte einen eindeutigen, nicht negativen Preis eintragen.`)
      }
      return {
        name: text(item.name, `${itemLabel}: Name`, 120, true),
        description: text(item.description, `${itemLabel}: Beschreibung`, 2000),
        price: item.price as number | null,
        allergens: textList(item.allergens, `${itemLabel}: Allergene`, 20, 100),
        tags: textList(item.tags, `${itemLabel}: Tags`, 20, 100),
        note: text(item.note, `${itemLabel}: Hinweis`, 1000),
      }
    })
    return { name: categoryName, items }
  })
  return { name, currency, categories, warnings, complete: true }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function record(value: unknown, keys: string[], label: string) {
  if (!isRecord(value)) throw new Error(`${label}: Ungültige Datenstruktur.`)
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`${label}: Zusätzliche Felder können nicht verlustfrei übernommen werden. Bitte Varianten und Extras manuell prüfen.`)
  }
  return value
}

function text(value: unknown, label: string, maximum: number, required = false) {
  if (typeof value !== "string") throw new Error(`${label}: Bitte einen Text angeben.`)
  if (value.length > maximum) throw new Error(`${label}: Höchstens ${maximum} Zeichen sind erlaubt. Bitte kürzen oder die Speisekarte aufteilen.`)
  const result = value.trim()
  if (required && !result) throw new Error(`${label}: Ein Wert ist erforderlich.`)
  return result
}

function textList(value: unknown, label: string, maximum: number, textMaximum: number) {
  if (!Array.isArray(value)) throw new Error(`${label}: Bitte eine Liste angeben.`)
  if (value.length > maximum) throw new Error(`${label}: Zu viele Einträge. Bitte prüfen oder die Speisekarte aufteilen.`)
  return value.map((entry) => text(entry, label, textMaximum, true))
}
