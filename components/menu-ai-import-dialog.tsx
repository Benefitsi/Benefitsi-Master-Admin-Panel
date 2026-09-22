"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react"
import { Camera, FileText, ScanText, Trash2, X } from "lucide-react"
import { useAdminLanguage } from "@/app/admin-language"
import { confirmAIMenuImport, previewAIMenuImport } from "@/app/partner-actions"
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

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-offset-2 focus:outline-teal-700 disabled:bg-zinc-100"
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
const secondaryClass = `${buttonClass} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100`
const primaryClass = `${buttonClass} bg-[#061829] text-white hover:bg-[#102c43]`
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

  function preview() {
    if (!sources.length || busyRef.current) return
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
        const result = await previewAIMenuImport(form)
        if (version !== requestVersion.current) return
        if (!result.ok || !result.draft) {
          setError(result.message || text("Die Karte konnte nicht erkannt werden. Bitte ein schärferes Foto versuchen.", "The menu could not be recognized. Try a clearer photo."))
          return
        }
        setDraft(editableDraft(result.draft, menuId ? menuName || text("Speisekarte", "Menu") : undefined, currency))
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
  }

  function updateItem(categoryKey: string, itemKey: string, patch: Partial<EditableItem>) {
    if (!draft) return
    updateDraft({ ...draft, categories: draft.categories.map((category) => category.key === categoryKey
      ? { ...category, items: category.items.map((item) => item.key === itemKey ? { ...item, ...patch } : item) }
      : category) })
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !reviewed || busyRef.current || uncertainSave || !itemCount || !event.currentTarget.reportValidity()) return
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
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-[#061829]/65 backdrop:backdrop-blur-sm sm:w-[calc(100%-2.5rem)]"
    >
      {open ? <>
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 bg-zinc-50 p-4 sm:p-5">
          <div>
            <h3 ref={heading} tabIndex={-1} id={`${id}-title`} className="text-lg font-bold text-zinc-950 outline-none">{text("Speisekarte digitalisieren", "Digitize your menu")}</h3>
            <p id={`${id}-description`} className="mt-1 max-w-2xl text-sm leading-5 text-zinc-600">{text("Foto oder PDF auswählen, erkannte Inhalte prüfen und anschließend veröffentlichen.", "Choose a photo or PDF, review the recognized content, then publish.")}</p>
          </div>
          <button type="button" aria-label={text("Import schließen", "Close import")} disabled={busy === "save"} onClick={close} className={`${secondaryClass} shrink-0 px-2`}><X className="size-5" aria-hidden /></button>
        </header>
        {draft ? <form onSubmit={confirm}>
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]">
            <aside className="min-w-0">
              <h4 className="text-sm font-semibold">{text("Original zum Vergleichen", "Original for comparison")}</h4>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{text("Öffne eine Datei in voller Größe, um Details zu prüfen.", "Open a file at full size to check the details.")}</p>
              <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 lg:max-h-[60dvh]">
                {sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg text-sm font-medium text-teal-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700">
                  {isPdf(source.file) ? <FileText className="mb-2 size-8" aria-hidden /> : <Image src={source.url} unoptimized width={480} height={640} alt={source.file.name} className="mb-2 h-auto max-h-80 w-full rounded-md object-contain" />}
                  <span className="block break-all">{source.file.name} ↗</span>
                </a>)}
              </div>
            </aside>
            <div className="min-w-0 space-y-4">
              <div>
                <h4 ref={reviewHeading} tabIndex={-1} className="text-base font-semibold outline-none">{text("Erkennung prüfen", "Review recognition")}</h4>
                <p className="mt-1 text-sm text-zinc-600">{draft.categories.length} {text("Kategorien", "categories")} · {itemCount} {text("Artikel", "items")}</p>
              </div>
              {!draft.complete || draft.warnings.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                <p className="font-semibold">{text("Hinweise zur Erkennung", "Recognition notes")}</p>
                <p className="text-xs">{text("Diese Prüfhilfen werden nicht veröffentlicht.", "These review notes are not published.")}</p>
                {!draft.complete ? <p>{text("Die Erkennung ist möglicherweise unvollständig. Vergleiche alle Seiten mit dem Original.", "Recognition may be incomplete. Compare every page with the original.")}</p> : null}
                {draft.warnings.length ? <ul className="mt-1 list-disc space-y-1 pl-5">{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
              </div> : null}
              {missingPrices > 0 ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{text(`${missingPrices} Preise fehlen. Trage die Originalpreise ein oder entferne die betreffenden Artikel.`, `${missingPrices} prices are missing. Enter the original prices or remove those items.`)}</p> : null}
              <fieldset disabled={busy === "save" || uncertainSave} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <label className="block text-sm font-medium">{menuId ? text("Ziel-Speisekarte", "Target menu") : text("Name der Speisekarte", "Menu name")}
                    <input className={inputClass} value={draft.name} readOnly={Boolean(menuId)} required maxLength={120} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} />
                  </label>
                  <label className="block text-sm font-medium">{text("Währung", "Currency")}
                    <input className={inputClass} value={draft.currency} placeholder="EUR" required pattern="EUR" maxLength={3} aria-describedby={`${id}-currency-help`} aria-invalid={draft.currency && draft.currency !== "EUR" ? true : undefined} title={text("Derzeit wird nur EUR unterstützt. Preise werden nicht automatisch umgerechnet.", "Only EUR is currently supported. Prices are not converted automatically.")} onChange={(event) => updateDraft({ ...draft, currency: event.target.value.toUpperCase() })} />
                  </label>
                </div>
                <p id={`${id}-currency-help`} className="text-xs leading-5 text-zinc-500">{text("Derzeit ist nur EUR möglich. Es findet keine automatische Währungsumrechnung statt. Alle importierten Preise müssen korrekt in EUR angegeben sein.", "Only EUR is currently supported. There is no automatic currency conversion. Every imported price must be correct in EUR.")}</p>
                {draft.sourceCurrency && draft.sourceCurrency !== "EUR" ? <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">{text(`Im Original wurde ${draft.sourceCurrency} erkannt. Verwende eine korrekt in EUR bepreiste Karte oder korrigiere jeden Preis anhand deiner EUR-Karte. Nur den Währungscode zu ändern rechnet keine Beträge um.`, `${draft.sourceCurrency} was recognized in the original. Use a correctly priced EUR menu or correct every price against your EUR menu. Changing the currency code alone does not convert any amounts.`)}</p> : null}
                <p className="text-xs leading-5 text-zinc-500">{text("Prüfe Preise, Allergene und Kennzeichnungen anhand des Originals; die KI kann Fehler machen.", "Check prices, allergens and tags against the original; AI can make mistakes.")}</p>
                {draft.categories.map((category) => <section key={category.key} className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4">
                  <div className="flex items-end gap-2">
                    <label className="block min-w-0 flex-1 text-sm font-semibold">{text("Kategorie", "Category")}
                      <input className={inputClass} value={category.name} required maxLength={120} onChange={(event) => updateDraft({ ...draft, categories: draft.categories.map((entry) => entry.key === category.key ? { ...entry, name: event.target.value } : entry) })} />
                    </label>
                    <button type="button" aria-label={text(`Kategorie ${category.name} entfernen`, `Remove category ${category.name}`)} title={text("Kategorie entfernen", "Remove category")} className={`${secondaryClass} shrink-0 px-2 text-rose-700`} onClick={() => updateDraft({ ...draft, categories: draft.categories.filter((entry) => entry.key !== category.key) })}><Trash2 className="size-4" aria-hidden /></button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {category.items.map((item, index) => <div key={item.key} className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-zinc-500">
                        <span>{text("Artikel", "Item")} {index + 1}</span>
                        <button type="button" className="min-h-8 rounded px-2 text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-teal-700" aria-label={text(`Artikel ${item.name} entfernen`, `Remove item ${item.name}`)} onClick={() => updateDraft({ ...draft, categories: draft.categories.map((entry) => entry.key === category.key ? { ...entry, items: entry.items.filter((entryItem) => entryItem.key !== item.key) } : entry).filter((entry) => entry.items.length > 0) })}>{text("Entfernen", "Remove")}</button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                        <label className="block text-sm font-medium">{text("Name", "Name")}<input className={inputClass} required maxLength={120} value={item.name} onChange={(event) => updateItem(category.key, item.key, { name: event.target.value })} /></label>
                        <label className="block text-sm font-medium">{text("Preis", "Price")} {draft.currency}<input type="number" inputMode="decimal" min="0" step="0.01" required value={item.price} className={`${inputClass} ${!item.price.trim() ? "border-amber-500 bg-amber-50" : ""}`} aria-invalid={!item.price.trim() ? true : undefined} onChange={(event) => updateItem(category.key, item.key, { price: event.target.value })} /></label>
                      </div>
                      <label className="mt-3 block text-sm font-medium">{text("Beschreibung", "Description")}<textarea className={inputClass} rows={2} maxLength={2000} value={item.description} onChange={(event) => updateItem(category.key, item.key, { description: event.target.value })} /></label>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-medium">{text("Allergene", "Allergens")}<input className={inputClass} value={item.allergens} onChange={(event) => updateItem(category.key, item.key, { allergens: event.target.value })} /></label>
                        <label className="block text-sm font-medium">{text("Kennzeichnungen", "Tags")}<input className={inputClass} value={item.tags} onChange={(event) => updateItem(category.key, item.key, { tags: event.target.value })} /></label>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{text("Mehrere Werte mit Komma trennen.", "Separate multiple values with commas.")}</p>
                      {item.note ? <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-950"><p><span className="font-semibold">{text("Hinweis: ", "Note: ")}</span>{item.note}</p><p className="mt-1">{text("Dieser Hinweis wird nicht veröffentlicht. Übernimm relevante Varianten und Aufpreise vor dem Speichern in die Beschreibung.", "This note is not published. Add relevant variants and surcharges to the description before saving.")}</p></div> : null}
                    </div>)}
                  </div>
                </section>)}
                {!itemCount ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{text("Keine Artikel vorhanden. Gehe zurück und wähle eine lesbare Speisekarte.", "No items remain. Go back and choose a readable menu.")}</p> : null}
              </fieldset>
            </div>
          </div>
          <footer className="space-y-3 border-t border-zinc-200 bg-zinc-50 p-4 sm:p-5">
            <p className="text-sm leading-6 text-zinc-700">{publicationNotice}</p>
            <label className="flex items-start gap-3 text-sm leading-6 text-zinc-800"><input type="checkbox" required checked={reviewed} disabled={busy === "save" || uncertainSave} onChange={(event) => setReviewed(event.target.checked)} className="mt-1 size-4 shrink-0 accent-teal-700" /><span>{text("Ich habe Vollständigkeit, Preise, Währung, Allergene und Kennzeichnungen mit dem Original geprüft und korrigiert.", "I have checked and corrected completeness, prices, currency, allergens and tags against the original.")}</span></label>
            {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className={secondaryClass} disabled={busy === "save" || uncertainSave} onClick={() => { setDraft(null); setReviewed(false); setError(""); heading.current?.focus() }}>{text("Zurück zur Dateiauswahl", "Back to files")}</button>
              {uncertainSave ? <button type="button" className={primaryClass} onClick={() => window.location.reload()}>{text("Seite neu laden und prüfen", "Reload and check menu")}</button> : <button type="submit" disabled={!reviewed || !itemCount || Boolean(busy)} className={primaryClass}>{busy === "save" ? <><LoadingSpinner className="size-4" />{text("Wird veröffentlicht …", "Publishing…")}</> : menuId ? text("Zur veröffentlichten Karte hinzufügen", "Add to published menu") : text("Speisekarte erstellen und veröffentlichen", "Create and publish menu")}</button>}
            </div>
            {busy === "save" ? <p role="status" className="text-sm text-zinc-600">{text("Die geprüften Inhalte werden gespeichert. Bitte warte auf die Bestätigung.", "Saving the reviewed content. Please wait for confirmation.")}</p> : null}
          </footer>
        </form> : <div className="space-y-4 p-4 sm:p-5">
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 sm:p-5">
            <label htmlFor={`${id}-files`} className="block text-sm font-semibold">{text("Fotos oder PDF deiner Speisekarte", "Photos or PDF of your menu")}</label>
            <p id={`${id}-limits`} className="mt-1 text-sm leading-6 text-zinc-600">{text("Bis zu 8 Fotos (JPG, PNG, WebP) oder eine PDF, insgesamt max. 4 MiB. Fotografiere jede Seite vollständig und gut lesbar.", "Up to 8 photos (JPG, PNG, WebP) or one PDF, max. 4 MiB total. Capture each page fully and clearly.")}</p>
            <input id={`${id}-files`} aria-describedby={`${id}-limits`} type="file" accept={ACCEPT} multiple disabled={busy === "preview" || uncertainSave} className="mt-4 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#061829] file:px-3 file:py-2 file:font-semibold file:text-white disabled:opacity-50" onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} />
            <label className={`${secondaryClass} relative mt-3 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-700`}><Camera className="size-4" aria-hidden />{text("Foto aufnehmen", "Take a photo")}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label={text("Foto der Speisekarte aufnehmen", "Take a photo of the menu")} disabled={busy === "preview" || uncertainSave} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} /></label>
          </div>
          {sources.length ? <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 px-3">{sources.map((source) => <li key={source.url} className="flex items-center justify-between gap-3 py-2"><a href={source.url} target="_blank" rel="noreferrer" className="min-w-0 break-all text-sm text-teal-800 underline underline-offset-4">{source.file.name}</a><button type="button" className={`${secondaryClass} shrink-0 px-2`} disabled={Boolean(busy)} aria-label={text(`${source.file.name} entfernen`, `Remove ${source.file.name}`)} onClick={() => replaceSources(sources.filter((entry) => entry !== source))}><X className="size-4" aria-hidden /></button></li>)}</ul> : null}
          <p className="text-xs leading-5 text-zinc-500">{text("Mit „Vorschau erstellen“ werden die ausgewählten Dateien zur Erkennung an Google Gemini gesendet. Die Vorschau speichert noch nichts in deiner Speisekarte.", "Selecting “Create preview” sends the chosen files to Google Gemini for recognition. Previewing does not save anything to your menu.")}</p>
          {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
          {uncertainSave ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{text("Bitte lade die Seite neu und prüfe den letzten Import, bevor du eine weitere Karte importierst.", "Reload the page and check the last import before importing another menu.")}</p> : null}
          <div className="flex flex-wrap justify-end gap-3"><button type="button" className={secondaryClass} onClick={close}>{text("Abbrechen", "Cancel")}</button><button type="button" className={primaryClass} disabled={!sources.length || Boolean(busy) || uncertainSave} onClick={preview}>{busy === "preview" ? <><LoadingSpinner className="size-4" />{text("Wird erkannt …", "Recognizing…")}</> : text("Vorschau erstellen", "Create preview")}</button></div>
          {busy === "preview" ? <p role="status" className="text-sm text-zinc-600">{text("Die Karte wird gelesen. Das kann einen Moment dauern. Du kannst die Vorschau jederzeit abbrechen.", "Reading the menu may take a moment. You can cancel the preview at any time.")}</p> : null}
        </div>}
      </> : null}
    </dialog>
  </>
}
