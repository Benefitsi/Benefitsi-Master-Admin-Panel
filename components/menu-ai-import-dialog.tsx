"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react"
import { AlertCircle, ArrowUpRight, Camera, ChevronDown, ChevronLeft, ChevronRight, Info, List, Pencil, ScanText, Trash2, X, ZoomIn, ZoomOut } from "lucide-react"
import { useAdminLanguage } from "@/app/admin-language"
import { confirmAIMenuImport, previewAIMenuImport, recoverAIMenuImport } from "@/app/partner-actions"
import { LoadingSpinner } from "@/components/loading-ui"
import type { AiMenuDraft } from "@/lib/menu-ai-types"

type EditableItem = Omit<AiMenuDraft["categories"][number]["items"][number], "price" | "allergens" | "tags"> & {
  key: string
  price: string
  allergens: string
  tags: string
}
type EditableDraft = Omit<AiMenuDraft, "categories"> & {
  sourceCurrency: string
  categories: Array<{ key: string; name: string; items: EditableItem[] }>
}
type Source = { file: File; url: string }
type Translate = (de: string, en: string) => string

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-offset-2 focus:outline-teal-700 disabled:bg-zinc-100"
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
const secondaryClass = `${buttonClass} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100`
const primaryClass = `${buttonClass} bg-[#061829] text-white hover:bg-[#102c43]`
const compactButtonClass = "inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
const MAX_BYTES = 4 * 1024 * 1024
const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name)
}

function editableDraft(draft: AiMenuDraft, menuName?: string, currency?: string): EditableDraft {
  return {
    ...draft,
    name: menuName || draft.name,
    currency: draft.currency || currency || "",
    sourceCurrency: draft.currency,
    categories: draft.categories.map((category) => ({
      ...category,
      key: crypto.randomUUID(),
      items: category.items.map((item) => ({
        ...item,
        key: crypto.randomUUID(),
        price: item.price === null ? "" : String(item.price),
        allergens: item.allergens.join(", "),
        tags: item.tags.join(", "),
      })),
    })),
  }
}

function splitList(value: string) {
  return value.split(/[,;\n]/).map((entry) => entry.trim()).filter(Boolean)
}

function validPrice(value: string) {
  const amount = Number(value)
  return Boolean(value.trim()) && Number.isFinite(amount) && amount >= 0 && Math.abs(amount * 100 - Math.round(amount * 100)) <= 0.000001
}

function SourcePreview({ sources, text }: { sources: Source[]; text: Translate }) {
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(100)
  const source = sources[page]
  if (!source) return null
  const pdf = isPdf(source.file)
  return <aside aria-label={text("Original zum Vergleichen", "Original for comparison")} className="flex min-h-0 min-w-0 flex-col border-b border-zinc-200 bg-zinc-100 min-[560px]:border-r min-[560px]:border-b-0">
    <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
      <div className="min-w-0">
        <h4 className="text-sm font-semibold">{text("Original", "Original")}</h4>
        <p className="max-w-48 truncate text-xs text-zinc-500" title={source.file.name}>{source.file.name}</p>
      </div>
      <div className="flex items-center gap-1">
        {!pdf ? <>
          <button type="button" className={compactButtonClass} aria-label={text("Original verkleinern", "Zoom out of original")} disabled={zoom <= 50} onClick={() => setZoom(Math.max(50, zoom - 50))}><ZoomOut className="size-4" aria-hidden /></button>
          <button type="button" className="min-h-8 min-w-12 rounded px-1 text-xs tabular-nums text-zinc-600 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-teal-700" aria-label={text("Original einpassen", "Fit original")} title={text("Auf Breite einpassen", "Fit to width")} onClick={() => setZoom(100)}>{zoom}%</button>
          <button type="button" className={compactButtonClass} aria-label={text("Original vergrößern", "Zoom into original")} disabled={zoom >= 400} onClick={() => setZoom(Math.min(400, zoom + 50))}><ZoomIn className="size-4" aria-hidden /></button>
        </> : null}
        <a href={source.url} target="_blank" rel="noreferrer" className={compactButtonClass} aria-label={text("Original in voller Größe öffnen", "Open full-size original")} title={text("In neuem Tab öffnen", "Open in a new tab")}><ArrowUpRight className="size-4" aria-hidden /></a>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain" tabIndex={0} aria-label={text("Originalansicht", "Original viewer")}>
      {pdf ? <object data={`${source.url}#view=FitH&navpanes=0`} type="application/pdf" aria-label={source.file.name} className="h-full min-h-48 w-full">
        <p className="p-4 text-sm">{text("PDF-Vorschau nicht verfügbar.", "PDF preview unavailable.")} <a className="underline" href={source.url} target="_blank" rel="noreferrer">{text("Original öffnen", "Open original")}</a></p>
      </object> : <div className="mx-auto p-3" style={{ width: `${zoom}%` }}><Image src={source.url} unoptimized width={1600} height={1200} alt={source.file.name} className="h-auto w-full max-w-none rounded-sm bg-white shadow-sm" /></div>}
    </div>
    {sources.length > 1 ? <nav aria-label={text("Originalseiten", "Original pages")} className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2">
      <button type="button" className={compactButtonClass} aria-label={text("Vorheriges Foto", "Previous photo")} disabled={page === 0} onClick={() => { setPage(page - 1); setZoom(100) }}><ChevronLeft className="size-4" aria-hidden /></button>
      <span className="text-xs tabular-nums text-zinc-600">{text("Foto", "Photo")} {page + 1} / {sources.length}</span>
      <button type="button" className={compactButtonClass} aria-label={text("Nächstes Foto", "Next photo")} disabled={page === sources.length - 1} onClick={() => { setPage(page + 1); setZoom(100) }}><ChevronRight className="size-4" aria-hidden /></button>
    </nav> : null}
  </aside>
}

function ItemFields({ item, currency, fieldId, text, onChange, onRemove, onDone }: {
  item: EditableItem; currency: string; fieldId: string; text: Translate
  onChange: (patch: Partial<EditableItem>) => void; onRemove: () => void; onDone: () => void
}) {
  return <div id={`${fieldId}-details`} className="space-y-3 border-t border-zinc-200 bg-zinc-50 p-3 sm:p-4">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
      <label className="block text-sm font-medium">{text("Name", "Name")}<input id={`${fieldId}-name`} className={inputClass} required maxLength={120} value={item.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
      <label className="block text-sm font-medium">{text("Preis", "Price")} {currency}<input id={`${fieldId}-price`} type="number" inputMode="decimal" min="0" step="0.01" required value={item.price} className={`${inputClass} ${!item.price.trim() ? "border-amber-500 bg-amber-50" : ""}`} aria-invalid={!item.price.trim() ? true : undefined} onChange={(event) => onChange({ price: event.target.value })} /></label>
    </div>
    <label className="block text-sm font-medium">{text("Beschreibung", "Description")}<textarea className={inputClass} rows={2} maxLength={2000} value={item.description} onChange={(event) => onChange({ description: event.target.value })} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium">{text("Allergene", "Allergens")}<input className={inputClass} value={item.allergens} onChange={(event) => onChange({ allergens: event.target.value })} /></label>
      <label className="block text-sm font-medium">{text("Kennzeichnungen", "Tags")}<input className={inputClass} value={item.tags} onChange={(event) => onChange({ tags: event.target.value })} /></label>
    </div>
    <p className="text-xs text-zinc-500">{text("Mehrere Werte mit Komma trennen.", "Separate multiple values with commas.")}</p>
    {item.note ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950"><p className="font-medium">{text("Hinweis zur Erkennung", "Recognition note")}</p><p>{item.note}</p><p className="mt-1 text-amber-800">{text("Dieser Hinweis wird nicht veröffentlicht. Übernimm relevante Varianten und Aufpreise in die Beschreibung.", "This note is not published. Add relevant variants and surcharges to the description.")}</p></div> : null}
    <div className="flex items-center justify-between gap-3">
      <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded px-2 text-xs text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-teal-700" aria-label={text(`Artikel ${item.name} entfernen`, `Remove item ${item.name}`)} onClick={onRemove}><Trash2 className="size-3.5" aria-hidden />{text("Entfernen", "Remove")}</button>
      <button type="button" className={`${secondaryClass} min-h-9 text-xs`} onClick={onDone}>{text("Details schließen", "Close details")}</button>
    </div>
  </div>
}

export function MenuAiImportDialog({
  partnerId,
  menuId,
  menuName,
  currency,
  hasExistingContent = false,
}: {
  partnerId: string
  menuId?: string
  menuName?: string
  currency?: string
  hasExistingContent?: boolean
}) {
  const { language } = useAdminLanguage()
  const text = (de: string, en: string) => language === "de" ? de : en
  const router = useRouter()
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const sourcesRef = useRef<Source[]>([])
  const requestVersion = useRef(0)
  const busyRef = useRef<"preview" | "save" | null>(null)
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState<Source[]>([])
  const [draft, setDraft] = useState<EditableDraft | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState<"preview" | "save" | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [uncertainSave, setUncertainSave] = useState(false)
  const [allDetails, setAllDetails] = useState(false)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [focusField, setFocusField] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const reviewing = draft !== null
  const itemCount = draft?.categories.reduce((total, category) => total + category.items.length, 0) ?? 0
  const missingPrices = draft?.categories.reduce((total, category) => total + category.items.filter((item) => !item.price.trim()).length, 0) ?? 0

  useEffect(() => {
    if (!open) return
    const triggerElement = trigger.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialog.current?.showModal()
    heading.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      triggerElement?.focus()
    }
  }, [open])

  useEffect(() => {
    if (reviewing) reviewHeading.current?.focus()
  }, [reviewing])

  useEffect(() => {
    if (focusField) document.getElementById(focusField)?.focus()
  }, [focusField, expandedItem, expandedCategory, allDetails])

  useEffect(() => () => {
    requestVersion.current += 1
    sourcesRef.current.forEach((source) => URL.revokeObjectURL(source.url))
  }, [])

  function replaceSources(next: Source[]) {
    sourcesRef.current.filter((source) => !next.includes(source)).forEach((source) => URL.revokeObjectURL(source.url))
    sourcesRef.current = next
    setSources(next)
    requestVersion.current += 1
    busyRef.current = null
    setBusy(null)
    setDraft(null)
    setAllDetails(false)
    setExpandedItem(null)
    setExpandedCategory(null)
    setFocusField(null)
    setReviewed(false)
    setError("")
  }

  function close() {
    if (busyRef.current === "save") return
    requestVersion.current += 1
    busyRef.current = null
    setBusy(null)
    dialog.current?.close()
    setOpen(false)
    replaceSources([])
  }

  function chooseFiles(files: File[]) {
    if (!files.length || busyRef.current === "save") return
    const nextFiles = [...sourcesRef.current.map((source) => source.file), ...files]
    if (nextFiles.some((file) => !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type) && !/\.(jpe?g|png|webp|pdf)$/i.test(file.name))) {
      setError(text("Bitte JPG, PNG, WebP oder PDF auswählen. HEIC wird noch nicht unterstützt.", "Choose JPG, PNG, WebP or PDF. HEIC is not supported yet."))
      return
    }
    if (nextFiles.length > 8 || (nextFiles.some(isPdf) && nextFiles.length !== 1)) {
      setError(text("Wähle bis zu 8 Fotos oder genau eine PDF. Entferne zuerst die andere Auswahl.", "Choose up to 8 photos or one PDF. Remove the other selection first."))
      return
    }
    if (nextFiles.some((file) => file.size === 0) || nextFiles.reduce((total, file) => total + file.size, 0) > MAX_BYTES) {
      setError(text("Die Dateien müssen Inhalt haben und zusammen höchstens 4 MiB groß sein.", "Files must not be empty and must total no more than 4 MiB."))
      return
    }
    replaceSources([...sourcesRef.current, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  function preview(recover = false) {
    if ((!recover && !sources.length) || busyRef.current) return
    const version = ++requestVersion.current
    busyRef.current = "preview"
    setBusy("preview")
    setError("")
    const form = new FormData()
    form.set("partner_id", partnerId)
    if (menuId) form.set("menu_id", menuId)
    sources.forEach((source) => form.append("menu_source", source.file))
    startTransition(async () => {
      try {
        const result = await (recover ? recoverAIMenuImport(form) : previewAIMenuImport(form))
        if (version !== requestVersion.current) return
        if (!result.ok || !result.draft) {
          setError(result.message || text("Die Karte konnte nicht erkannt werden. Bitte ein schärferes Foto versuchen.", "The menu could not be recognized. Try a clearer photo."))
          return
        }
        setDraft(editableDraft(result.draft, menuId ? menuName || text("Speisekarte", "Menu") : undefined, currency))
        setAllDetails(false)
        setExpandedItem(null)
        setExpandedCategory(null)
        setFocusField(null)
        setReviewed(false)
      } catch {
        if (version === requestVersion.current) setError(text("Die Erkennung ist fehlgeschlagen. Bitte erneut versuchen.", "Recognition failed. Please try again."))
      } finally {
        if (version === requestVersion.current) {
          busyRef.current = null
          setBusy(null)
        }
      }
    })
  }

  function updateDraft(next: EditableDraft) {
    setDraft(next)
    setReviewed(false)
    setError("")
  }

  function updateItem(categoryKey: string, itemKey: string, patch: Partial<EditableItem>) {
    if (!draft) return
    updateDraft({ ...draft, categories: draft.categories.map((category) => category.key === categoryKey
      ? { ...category, items: category.items.map((item) => item.key === itemKey ? { ...item, ...patch } : item) }
      : category) })
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !reviewed || busyRef.current || uncertainSave || !itemCount) return
    // Closed editors are unmounted. Validate the entire draft before converting
    // prices so an unseen empty string can never become an imported zero price.
    if (!draft.name.trim() || draft.name.length > 120 || draft.currency !== "EUR") {
      setError(text("Bitte Menüname und Währung EUR prüfen.", "Check the menu name and EUR currency."))
      setFocusField(`${id}-${!draft.name.trim() ? "menu-name" : "currency"}`)
      return
    }
    for (const category of draft.categories) {
      if (!category.name.trim() || category.name.length > 120) {
        setExpandedCategory(category.key)
        setError(text("Bitte einen gültigen Kategorienamen eintragen.", "Enter a valid category name."))
        setFocusField(`${id}-${category.key}-name`)
        return
      }
      for (const item of category.items) {
        const invalidName = !item.name.trim() || item.name.length > 120
        if (invalidName || !validPrice(item.price)) {
          setExpandedItem(item.key)
          setError(text(`Bitte ${invalidName ? "den Namen" : "den Preis"} für „${item.name || "Artikel"}“ prüfen.`, `Check the ${invalidName ? "name" : "price"} for “${item.name || "item"}”.`))
          setFocusField(`${id}-${item.key}-${invalidName ? "name" : "price"}`)
          return
        }
      }
    }
    const value: AiMenuDraft = {
      name: draft.name.trim(),
      currency: draft.currency.trim().toUpperCase(),
      complete: draft.complete,
      warnings: draft.warnings,
      categories: draft.categories.map((category) => ({
        name: category.name.trim(),
        items: category.items.map((item) => ({
          name: item.name.trim(), description: item.description.trim(), price: Number(item.price),
          allergens: splitList(item.allergens), tags: splitList(item.tags), note: item.note,
        })),
      })),
    }
    const version = ++requestVersion.current
    busyRef.current = "save"
    setBusy("save")
    setError("")
    const form = new FormData()
    form.set("partner_id", partnerId)
    if (menuId) form.set("menu_id", menuId)
    form.set("menu_draft", JSON.stringify(value))
    form.set("confirm_review", "true")
    startTransition(async () => {
      try {
        const result = await confirmAIMenuImport(form)
        if (!result.ok) {
          if (version === requestVersion.current) setError(result.message)
          return
        }
        const message = text(result.message, `${result.importedCategories ?? value.categories.length} categories and ${result.importedItems ?? itemCount} items ${result.created ? "published as a new menu" : "added to the published menu"}.`)
        // Revalidation can replace the empty-menu entry point before this promise
        // settles. The shared toast still reports completion after that unmount.
        window.dispatchEvent(new CustomEvent("benefitsi:action-toast", { detail: { ok: true, message } }))
        if (version !== requestVersion.current) return
        setSuccess(message)
        busyRef.current = null
        close()
        router.refresh()
      } catch {
        if (version === requestVersion.current) {
          setUncertainSave(true)
          setError(text("Der Speicherstatus konnte nicht bestätigt werden. Bitte lade die Seite neu und prüfe die Speisekarte, bevor du erneut importierst.", "The save status could not be confirmed. Reload the page and check the menu before importing again."))
        }
      } finally {
        if (version === requestVersion.current) {
          busyRef.current = null
          setBusy(null)
        }
      }
    })
  }

  const publicationNotice = menuId
    ? hasExistingContent
      ? text("Beim Bestätigen werden neue Kategorien und Artikel an die veröffentlichte Karte angehängt. Vorhandene Inhalte bleiben erhalten.", "Confirmation appends new categories and items to the published menu. Existing content is kept.")
      : text("Beim Bestätigen werden die Inhalte zu dieser veröffentlichten Speisekarte hinzugefügt.", "Confirmation adds this content to the published menu.")
    : text("Beim Bestätigen wird eine neue, veröffentlichte Speisekarte erstellt.", "Confirmation creates a new, published menu.")

  return <>
    <button ref={trigger} type="button" data-admin-i18n-ignore="true" className={secondaryClass} onClick={() => {
      setSuccess("")
      setError("")
      setOpen(true)
    }}>
      <ScanText className="size-4" aria-hidden />
      {text("Karte aus Foto / PDF", "Menu from photo / PDF")}
    </button>
    {success ? <p role="status" className="w-full text-sm text-emerald-800">{success}</p> : null}
    <dialog
      ref={dialog}
      data-admin-i18n-ignore="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); close() }}
      className={`fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl open:flex open:flex-col backdrop:bg-[#061829]/65 backdrop:backdrop-blur-sm sm:w-[calc(100%-2rem)] ${draft ? "h-[94dvh] max-w-[1600px]" : "max-w-2xl"}`}
    >
      {open ? <>
        <button type="button" disabled={!!busy} onClick={()=>preview(true)} className="m-3 rounded-lg border p-2 text-sm">Letztes Importergebnis wiederherstellen (ohne neue KI-Anfrage)</button>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3 sm:px-5">
          <div>
            <h3 ref={heading} tabIndex={-1} id={`${id}-title`} className="text-lg font-bold text-zinc-950 outline-none">{text("Speisekarte digitalisieren", "Digitize your menu")}</h3>
            <p id={`${id}-description`} className={`mt-1 max-w-2xl text-xs leading-5 text-zinc-500 ${draft ? "max-lg:sr-only" : ""}`}>{draft ? text("Vergleiche die Übersicht mit dem Original. Klicke auf einen Artikel, um ihn zu korrigieren.", "Compare the overview with the original. Click an item to correct it.") : text("Foto oder PDF auswählen, erkannte Inhalte prüfen und anschließend veröffentlichen.", "Choose a photo or PDF, review the recognized content, then publish.")}</p>
          </div>
          <button type="button" aria-label={text("Import schließen", "Close import")} disabled={busy === "save"} onClick={close} className={`${secondaryClass} shrink-0 px-2`}><X className="size-5" aria-hidden /></button>
        </header>
        {draft ? <form noValidate onSubmit={confirm} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(100px,32%)_minmax(0,1fr)] min-[560px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] min-[560px]:grid-rows-1">
            <SourcePreview sources={sources} text={text} />
            <fieldset disabled={busy === "save" || uncertainSave} className="flex min-h-0 min-w-0 flex-col">
              <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                <div>
                  <h4 ref={reviewHeading} tabIndex={-1} className="text-sm font-semibold outline-none">{text("Erkannte Speisekarte", "Recognized menu")}</h4>
                  <p className="text-xs text-zinc-500">{itemCount} {text("Artikel", "items")} · {draft.categories.length} {text("Kategorien", "categories")}</p>
                </div>
                <button type="button" aria-label={allDetails ? text("Kompakte Übersicht", "Compact overview") : text("Alle Details anzeigen", "Show all details")} title={allDetails ? text("Kompakte Übersicht", "Compact overview") : text("Alle Details anzeigen", "Show all details")} className={compactButtonClass} onClick={() => { setAllDetails(!allDetails); setExpandedItem(null); setExpandedCategory(null) }}><List className="size-3.5" aria-hidden /><span className="hidden xl:inline">{allDetails ? text("Kompakte Übersicht", "Compact overview") : text("Alle Details anzeigen", "Show all details")}</span><span className="xl:hidden">{allDetails ? text("Übersicht", "Overview") : text("Details", "Details")}</span></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" aria-label={text("Erkannte Artikel", "Recognized items")} tabIndex={0}>
                <div className="flex flex-wrap items-start gap-2 border-b border-zinc-200 py-2">
                  {missingPrices > 0 ? <div role="status" className="text-xs text-amber-900">
                    <button type="button" aria-label={text("Preise prüfen", "Check prices")} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-amber-50 px-2 font-medium hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-teal-700" onClick={() => {
                      const item = draft.categories.flatMap((category) => category.items).find((entry) => !entry.price.trim())
                      if (item) { setExpandedItem(item.key); setFocusField(`${id}-${item.key}-price`) }
                    }}><AlertCircle className="size-3.5 shrink-0" aria-hidden />{text(`${missingPrices} Preise fehlen`, `${missingPrices} missing prices`)}</button>
                  </div> : null}
                  {!draft.complete || draft.warnings.length ? <details className="rounded-lg bg-zinc-50 px-2 py-1.5 text-xs leading-5 text-zinc-600 open:w-full open:border open:border-amber-200 open:bg-amber-50/60 open:text-amber-950">
                    <summary className="cursor-pointer font-medium" aria-label={text("Hinweise zur Erkennung", "Recognition notes")}>{draft.warnings.length} {text("Hinweise", "notes")}</summary>
                    <p className="mt-2 text-amber-800">{text("Diese Prüfhilfen werden nicht veröffentlicht.", "These review notes are not published.")}</p>
                    {!draft.complete ? <p>{text("Die Erkennung ist möglicherweise unvollständig. Vergleiche alle Seiten mit dem Original.", "Recognition may be incomplete. Compare every page with the original.")}</p> : null}
                    {draft.warnings.length ? <ul className="mt-1 list-disc space-y-1 pl-4">{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
                  </details> : null}
                  {allDetails || !menuId || !draft.name.trim() || draft.currency !== "EUR" ? <details open className="w-full text-xs text-zinc-600">
                    <summary className="cursor-pointer py-1">{menuId ? text("Ziel", "Target") : text("Speisekarte", "Menu")}: <span className="font-medium text-zinc-800">{draft.name || text("Name ergänzen", "Add a name")}</span> · {draft.currency || text("Währung fehlt", "Currency missing")}</summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                      <label className="block text-sm font-medium">{menuId ? text("Ziel-Speisekarte", "Target menu") : text("Name der Speisekarte", "Menu name")}
                        <input id={`${id}-menu-name`} className={inputClass} value={draft.name} readOnly={Boolean(menuId)} required maxLength={120} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} />
                      </label>
                      <label className="block text-sm font-medium">{text("Währung", "Currency")}
                        <input id={`${id}-currency`} className={inputClass} value={draft.currency} placeholder="EUR" required pattern="EUR" maxLength={3} aria-describedby={`${id}-currency-help`} aria-invalid={draft.currency && draft.currency !== "EUR" ? true : undefined} onChange={(event) => updateDraft({ ...draft, currency: event.target.value.toUpperCase() })} />
                      </label>
                    </div>
                    <p id={`${id}-currency-help`} className="mt-2 leading-5 text-zinc-500">{text("Derzeit ist nur EUR möglich. Preise werden nicht automatisch umgerechnet.", "Only EUR is currently supported. Prices are not converted automatically.")}</p>
                    {draft.sourceCurrency && draft.sourceCurrency !== "EUR" ? <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 leading-5 text-amber-950">{text(`Im Original wurde ${draft.sourceCurrency} erkannt. Prüfe jeden Preis anhand deiner EUR-Karte. Nur den Währungscode zu ändern rechnet keine Beträge um.`, `${draft.sourceCurrency} was recognized in the original. Check every price against your EUR menu. Changing the currency code does not convert amounts.`)}</p> : null}
                  </details> : null}
                </div>
                {draft.categories.map((category) => <section key={category.key} className="border-b border-zinc-200 last:border-b-0">
                  <div className="flex items-center justify-between gap-2 pt-4 pb-2">
                    <h5 className="min-w-0 break-words text-sm font-semibold">{category.name || text("Kategorie ohne Namen", "Unnamed category")} <span className="ml-1 text-xs font-normal text-zinc-400">{category.items.length}</span></h5>
                    <button type="button" className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md px-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-teal-700" aria-label={text(`Kategorie ${category.name} bearbeiten`, `Edit category ${category.name}`)} aria-expanded={allDetails || expandedCategory === category.key} onClick={() => { setAllDetails(false); setExpandedCategory(expandedCategory === category.key ? null : category.key) }}><Pencil className="size-3.5" aria-hidden /></button>
                  </div>
                  {allDetails || expandedCategory === category.key ? <div className="mb-2 flex items-end gap-2 rounded-lg bg-zinc-50 p-3">
                    <label className="block min-w-0 flex-1 text-sm font-medium">{text("Kategorie", "Category")}<input id={`${id}-${category.key}-name`} className={inputClass} required maxLength={120} value={category.name} onChange={(event) => updateDraft({ ...draft, categories: draft.categories.map((entry) => entry.key === category.key ? { ...entry, name: event.target.value } : entry) })} /></label>
                    <button type="button" aria-label={text(`Kategorie ${category.name} entfernen`, `Remove category ${category.name}`)} className={`${secondaryClass} shrink-0 px-2 text-rose-700`} onClick={() => updateDraft({ ...draft, categories: draft.categories.filter((entry) => entry.key !== category.key) })}><Trash2 className="size-4" aria-hidden /></button>
                  </div> : null}
                  <ul className="divide-y divide-zinc-100 pb-2">
                    {category.items.map((item) => {
                      const expanded = allDetails || expandedItem === item.key
                      const missing = !item.price.trim()
                      const amount = Number(item.price)
                      const invalid = !validPrice(item.price)
                      return <li key={item.key}>
                        <button type="button" aria-label={text(`Artikel ${item.name} bearbeiten`, `Edit item ${item.name}`)} aria-expanded={expanded} aria-controls={expanded ? `${id}-${item.key}-details` : undefined} onClick={() => { setAllDetails(false); setExpandedItem(expandedItem === item.key ? null : item.key) }} className={`group flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-teal-700 ${expanded ? "bg-teal-50" : invalid ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-zinc-50"}`}>
                          <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-5">{item.name || text("Name fehlt", "Name missing")}{item.allergens ? <span className="ml-1.5 text-[10px] font-normal text-zinc-500">{item.allergens}</span> : null}</span>
                          {item.note ? <span title={text("Hinweis zur Erkennung – Artikel öffnen", "Recognition note – open item")}><Info className="size-3.5 shrink-0 text-zinc-400" aria-label={text("Hinweis vorhanden", "Has a note")} /></span> : null}
                          <span className={`shrink-0 text-right text-xs font-medium tabular-nums ${invalid ? "text-amber-800" : "text-zinc-700"}`}>{invalid ? text(missing ? "Preis fehlt" : "Preis prüfen", missing ? "Price missing" : "Check price") : `${amount.toLocaleString(language === "de" ? "de-DE" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${draft.currency === "EUR" ? "€" : draft.currency}`}</span>
                          <ChevronDown className={`size-3.5 shrink-0 text-zinc-400 ${expanded ? "rotate-180" : ""}`} aria-hidden />
                        </button>
                        {expanded ? <ItemFields item={item} currency={draft.currency} fieldId={`${id}-${item.key}`} text={text} onChange={(patch) => updateItem(category.key, item.key, patch)} onDone={() => { setAllDetails(false); setExpandedItem(null) }} onRemove={() => updateDraft({ ...draft, categories: draft.categories.map((entry) => entry.key === category.key ? { ...entry, items: entry.items.filter((entryItem) => entryItem.key !== item.key) } : entry).filter((entry) => entry.items.length > 0) })} /> : null}
                      </li>
                    })}
                  </ul>
                </section>)}
                {!itemCount ? <p role="status" className="py-4 text-sm text-amber-900">{text("Keine Artikel vorhanden. Gehe zurück und wähle eine lesbare Speisekarte.", "No items remain. Go back and choose a readable menu.")}</p> : null}
              </div>
            </fieldset>
          </div>
          <footer className="max-h-[34dvh] shrink-0 space-y-2 overflow-y-auto border-t border-zinc-200 bg-white px-4 py-2 sm:px-5">
            <label className="flex items-start gap-2 text-xs leading-5 text-zinc-700"><input type="checkbox" required checked={reviewed} disabled={busy === "save" || uncertainSave} onChange={(event) => setReviewed(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-teal-700" /><span>{text("Ich habe alle Artikel, Preise und Allergene mit dem Original geprüft und korrigiert.", "I have checked and corrected all items, prices and allergens against the original.")}</span></label>
            {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className={`${secondaryClass} min-h-9 text-xs`} aria-label={text("Zurück zur Dateiauswahl", "Back to files")} disabled={busy === "save" || uncertainSave} onClick={() => { setDraft(null); setReviewed(false); setError(""); heading.current?.focus() }}><ChevronLeft className="size-3.5" aria-hidden />{text("Dateien", "Files")}</button>
              {uncertainSave ? <button type="button" className={`${primaryClass} min-h-9 text-xs`} onClick={() => window.location.reload()}>{text("Seite neu laden und prüfen", "Reload and check menu")}</button> : <button type="submit" disabled={!reviewed || !itemCount || Boolean(busy)} className={`${primaryClass} min-h-9 text-xs`}>{busy === "save" ? <><LoadingSpinner className="size-4" />{text("Wird veröffentlicht …", "Publishing…")}</> : menuId ? text("Zur Karte hinzufügen", "Add to menu") : text("Erstellen und veröffentlichen", "Create and publish")}</button>}
            </div>
            <p className="text-xs leading-4 text-zinc-500">{publicationNotice}</p>
            {busy === "save" ? <p role="status" className="text-sm text-zinc-600">{text("Die geprüften Inhalte werden gespeichert. Bitte warte auf die Bestätigung.", "Saving the reviewed content. Please wait for confirmation.")}</p> : null}
          </footer>
        </form> : <div className="min-h-0 overflow-y-auto space-y-4 p-4 sm:p-5">
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 sm:p-5">
            <label htmlFor={`${id}-files`} className="block text-sm font-semibold">{text("Fotos oder PDF deiner Speisekarte", "Photos or PDF of your menu")}</label>
            <p id={`${id}-limits`} className="mt-1 text-sm leading-6 text-zinc-600">{text("Bis zu 8 Fotos (JPG, PNG, WebP) oder eine PDF mit bis zu 8 Seiten, insgesamt max. 4 MiB. Fotografiere jede Seite vollständig und gut lesbar.", "Up to 8 photos (JPG, PNG, WebP) or one PDF with up to 8 pages, max. 4 MiB total. Capture each page fully and clearly.")}</p>
            <input id={`${id}-files`} aria-describedby={`${id}-limits`} type="file" accept={ACCEPT} multiple disabled={busy === "preview" || uncertainSave} className="mt-4 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#061829] file:px-3 file:py-2 file:font-semibold file:text-white disabled:opacity-50" onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} />
            <label className={`${secondaryClass} relative mt-3 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-700`}><Camera className="size-4" aria-hidden />{text("Foto aufnehmen", "Take a photo")}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label={text("Foto der Speisekarte aufnehmen", "Take a photo of the menu")} disabled={busy === "preview" || uncertainSave} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} /></label>
          </div>
          {sources.length ? <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 px-3">{sources.map((source) => <li key={source.url} className="flex items-center justify-between gap-3 py-2"><a href={source.url} target="_blank" rel="noreferrer" className="min-w-0 break-all text-sm text-teal-800 underline underline-offset-4">{source.file.name}</a><button type="button" className={`${secondaryClass} shrink-0 px-2`} disabled={Boolean(busy)} aria-label={text(`${source.file.name} entfernen`, `Remove ${source.file.name}`)} onClick={() => replaceSources(sources.filter((entry) => entry !== source))}><X className="size-4" aria-hidden /></button></li>)}</ul> : null}
          <p className="text-xs leading-5 text-zinc-500">{text("Mit „Vorschau erstellen“ werden die Dateien auf dem Benefitsi-M1 ausgelesen. Nur der erkannte Text wird vom Hermes-Menü-Agenten zur Strukturierung an MiniMax gesendet. Es wird noch nichts in deiner Speisekarte gespeichert.", "Selecting “Create preview” reads the files on the Benefitsi M1. The Hermes menu agent sends only the recognized text to MiniMax for structuring. Nothing is saved to your menu yet.")}</p>
          {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
          {uncertainSave ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{text("Bitte lade die Seite neu und prüfe den letzten Import, bevor du eine weitere Karte importierst.", "Reload the page and check the last import before importing another menu.")}</p> : null}
          <div className="flex flex-wrap justify-end gap-3"><button type="button" className={secondaryClass} onClick={close}>{text("Abbrechen", "Cancel")}</button><button type="button" className={primaryClass} disabled={!sources.length || Boolean(busy) || uncertainSave} onClick={()=>preview()}>{busy === "preview" ? <><LoadingSpinner className="size-4" />{text("Wird erkannt …", "Recognizing…")}</> : text("Vorschau erstellen", "Create preview")}</button></div>
          {busy === "preview" ? <p role="status" className="text-sm text-zinc-600">{text("Die Karte wird gelesen. Das kann einen Moment dauern. Du kannst die Vorschau jederzeit abbrechen.", "Reading the menu may take a moment. You can cancel the preview at any time.")}</p> : null}
        </div>}
      </> : null}
    </dialog>
  </>
}
