"use client"
import { useEffect, useRef, useState, useTransition } from "react"
import { saveCorporateCompanyBranding, readCorporateCompanyLogo, reloadCorporateCompanyBranding } from "@/app/companies/actions"
import { brandingFailure, MAX_LOGO_BYTES, normalizeWelcomeText, parseCorporateBranding, validLogoBytes, type BrandingMutation } from "@/lib/corporate/branding"
import type { CorporateCompany } from "@/lib/corporate/companies"
import { corporateInputClass, corporateButtonClass, corporatePanelClass } from "@/components/corporate/company-ui"

export function CorporateCompanyBranding({ company, adminIdentity }: { company: CorporateCompany; adminIdentity: string }) {
  return <BrandingForm key={`${adminIdentity}:${company.company_id}`} company={company} />
}
function BrandingLogo({ companyId, companyName, path, file }: { companyId: string; companyName: string; path: string | null; file: File | null }) {
  const [image, setImage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true, objectUrl: string | null = null
    async function load() {
      try {
        let bytes: Uint8Array, mime: string
        if (file) {
          if (file.size > MAX_LOGO_BYTES) return
          mime = file.type; bytes = new Uint8Array(await file.arrayBuffer())
        } else if (path) {
          const payload = await readCorporateCompanyLogo(companyId, path)
          if (!active || !payload || payload.base64.length > 699052 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.base64)) return
          mime = payload.mime; bytes = Uint8Array.from(atob(payload.base64), character => character.charCodeAt(0))
        } else return
        if (!active || !validLogoBytes(bytes, mime)) return
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }))
        setImage(objectUrl)
      } catch { /* Missing, corrupt or unauthorized images use the company fallback. */ }
    }
    void load()
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [companyId, path, file])
  return image && !failed
    // Private images must use an ephemeral Blob rather than the image optimizer/cache.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={image} alt={`Logo von ${companyName}`} className="size-20 rounded-xl object-contain" onError={() => setFailed(true)} />
    : <span role="img" aria-label={`Firmenlogo: ${companyName}`} className="flex size-20 items-center justify-center rounded-xl bg-[#118cff]/10 text-xl font-black text-[#0b75d9]">{companyName.trim().slice(0, 2).toUpperCase() || "F"}</span>
}
function BrandingForm({ company: initialCompany }: { company: CorporateCompany }) {
  const [company, setCompany] = useState(initialCompany)
  const initial = parseCorporateBranding(initialCompany.branding, initialCompany.company_id)
  const [welcome, setWelcome] = useState(initial.welcome_text)
  const [path, setPath] = useState(initial.logo_path)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState("")
  const [checkingFile, setCheckingFile] = useState(false)
  const [previewGeneration, setPreviewGeneration] = useState(0)
  const [expected, setExpected] = useState(initialCompany.updated_at)
  const [state, setState] = useState<BrandingMutation>({ status: "idle", message: "" })
  const [pending, startTransition] = useTransition()
  const busy = useRef(false), mounted = useRef(false), selection = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const needsReload = ["conflict", "not_found", "error"].includes(state.status)
  const invalidText = normalizeWelcomeText(welcome) === null
  const blocked = pending || checkingFile || needsReload
  const previewKey = `${path || "default"}:${file?.name || ""}:${previewGeneration}`
  function clearFile() {
    selection.current++; setPreviewGeneration(value => value + 1); setFile(null); setFileError(""); setCheckingFile(false)
    if (fileInput.current) fileInput.current.value = ""
  }
  async function selectFile(candidate: File | undefined) {
    const request = ++selection.current
    setPreviewGeneration(value => value + 1)
    setFile(null); setFileError(""); setCheckingFile(true)
    let valid = false
    try { valid = !!candidate && candidate.size <= MAX_LOGO_BYTES && validLogoBytes(new Uint8Array(await candidate.arrayBuffer()), candidate.type) } catch { /* invalid file */ }
    if (!mounted.current || request !== selection.current) return
    setCheckingFile(false)
    if (valid && candidate) { setFile(candidate); setPath(null) }
    else setFileError("Bitte ein gültiges PNG-, JPEG- oder WebP-Bild bis 512 KB auswählen.")
  }
  function reload() {
    if (busy.current || pending || checkingFile) return
    busy.current = true
    startTransition(async () => {
      try {
        const detail = await reloadCorporateCompanyBranding(company.company_id)
        if (!mounted.current) return
        if (detail.status !== "ok") { setState({ status: "error", message: detail.message }); return }
        const branding = parseCorporateBranding(detail.company.branding, company.company_id)
        setCompany(detail.company); setExpected(detail.company.updated_at); setWelcome(branding.welcome_text); setPath(branding.logo_path); clearFile()
        setState({ status: "idle", message: "Serverstand geladen." })
      } catch { if (mounted.current) setState({ status: "error", message: "Der Serverstand konnte nicht geladen werden. Ihre Eingaben bleiben erhalten." }) }
      finally { busy.current = false }
    })
  }
  return <form className={`${corporatePanelClass} space-y-4`} aria-label="Firmenauftritt" aria-busy={pending} onSubmit={event => {
    event.preventDefault()
    if (busy.current || blocked || invalidText || fileError) return
    busy.current = true
    const data = new FormData()
    data.set("companyId", company.company_id); data.set("expectedUpdatedAt", expected); data.set("welcomeText", welcome); data.set("logoPath", path || "")
    if (file) data.set("logo", file)
    startTransition(async () => {
      try {
        const result = await saveCorporateCompanyBranding(data)
        if (!mounted.current) return
        if (result.status === "updated" && result.updatedAt && result.branding) {
          setExpected(result.updatedAt); setWelcome(result.branding.welcome_text); setPath(result.branding.logo_path); clearFile()
        }
        setState(result)
      } catch { if (mounted.current) setState(brandingFailure) } finally { busy.current = false }
    })
  }}>
    <h2 className="text-lg font-black">Firmenauftritt</h2>
    <fieldset disabled={blocked} className="space-y-4 disabled:opacity-70">
      <legend className="sr-only">Logo und Teambegrüßung bearbeiten</legend>
      <label className="grid gap-1.5 text-xs font-bold">Firmenlogo<input ref={fileInput} type="file" name="logo" accept="image/png,image/jpeg,image/webp" aria-describedby="branding-logo-help" className={corporateInputClass} onChange={event => void selectFile(event.target.files?.[0])} /></label>
      <p id="branding-logo-help" className="text-xs text-[#617080]">PNG, JPEG oder WebP bis 512 KB. Das Logo ist nur für die zugeordnete Firma sichtbar.</p>
      <button type="button" className="min-h-11 text-sm font-bold text-[#0b75d9] underline" onClick={() => { clearFile(); setPath(null) }}>Logo entfernen</button>
      <label className="grid gap-1.5 text-xs font-bold">Begrüßung für dein Team<textarea name="welcomeText" value={welcome} aria-describedby="branding-text-help" aria-invalid={invalidText} className={`${corporateInputClass} min-h-28`} onChange={event => setWelcome(event.target.value)} /></label>
      <p id="branding-text-help" className="text-xs text-[#617080]">{[...welcome.trim()].length}/500 Zeichen. Klartext; leer verwendet die Standardbegrüßung.</p>
    </fieldset>
    {checkingFile && <p role="status" className="text-sm">Logo wird geprüft …</p>}
    {(fileError || invalidText) && <p role="alert" className="text-sm text-amber-950">{fileError || "Bitte maximal 500 Zeichen ohne Steuerzeichen eingeben."}</p>}
    <div aria-label="Vorschau des Firmenauftritts" className="flex items-start gap-4 rounded-2xl bg-[#f4f8fc] p-4">
      <BrandingLogo key={previewKey} companyId={company.company_id} companyName={company.company_name} path={fileError || checkingFile ? null : path} file={file} />
      <div className="min-w-0"><h3 className="font-bold">{company.company_name}</h3><p className="whitespace-pre-wrap break-words text-sm">{welcome.trim() || `Willkommen bei ${company.company_name}!`}</p></div>
    </div>
    {state.message && <p role={state.status === "updated" || state.status === "idle" ? "status" : "alert"} className="rounded-xl border p-3 text-sm">{state.message}</p>}
    {state.cleanupWarning && <p className="text-sm text-amber-950">{state.cleanupWarning}</p>}
    <div className="flex flex-wrap gap-4">
      <button type="submit" className={corporateButtonClass} disabled={blocked || invalidText || !!fileError}>{pending ? "Speichert …" : "Speichern"}</button>
      <button type="button" disabled={pending || checkingFile} onClick={reload} className="min-h-11 text-sm font-bold text-[#0b75d9] underline disabled:opacity-50">Serverstand neu laden</button>
    </div>
  </form>
}
