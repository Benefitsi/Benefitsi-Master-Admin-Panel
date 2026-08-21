import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { updateCityPageProfile } from "@/app/city-pages/[citySlug]/actions"
import { CityEditorFormBehavior } from "@/components/city-pages/editor-form-behavior"
import { FieldModeSelect } from "@/components/city-pages/field-mode-select"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import {
  cityContentTypes,
  contentTypeLabel,
  stageLabel,
} from "@/lib/city-operations/contracts"
import { cityContentEditorDefinitions } from "@/lib/city-pages/content-editor"
import { loadCityCommunityInbox } from "@/lib/city-pages/community"
import { loadCityPageDetail } from "@/lib/city-pages/data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Stadt verwalten",
  description: "Stadtprofil, Inhalte und Abläufe zentral verwalten.",
}

type SearchParams = {
  success?: string
  error?: string
}

function cityWebBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_BENEFITSI_CITY_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim()

  if (configured) return configured.replace(/\/$/, "")
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://benefitsi.de"
}

export default async function CityPageDetail({
  params,
  searchParams,
}: {
  params: Promise<{ citySlug: string }>
  searchParams: Promise<SearchParams>
}) {
  const { citySlug } = await params
  const query = await searchParams
  const { adminSession, supabase } = await requireAdmin()
  const [detail, community] = await Promise.all([
    loadCityPageDetail(citySlug),
    loadCityCommunityInbox(citySlug),
  ])

  if (!detail.city) notFound()

  const city = detail.city
  const partnerResult = await supabase
    .from("partners")
    .select("id", { count: "exact", head: true })
    .eq("city_id", city.id)
  const partnerCount = partnerResult.count ?? 0
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"
  const blockingCount = detail.records.filter((record) =>
    record.issues.some((issue) => issue.severity === "blocking"),
  ).length
  const openCount = detail.records.filter(
    (record) => !["published", "rejected", "archived"].includes(record.stage),
  ).length
  const profileComplete = Boolean(
    city.intro && city.heroImageUrl && city.seoTitle && city.seoDescription,
  )
  const publicUrl = `${cityWebBaseUrl()}/stadt/${city.slug}`
  const publicationLabel = city.slug === "annweiler" ? "PRELAUNCH" : "INTERN VORBEREITET"

  return (
    <AdminShell
      adminName={adminName}
      title={city.name}
      subtitle={`Stadtportal /stadt/${city.slug} zentral verwalten`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/city-pages"
          className="inline-flex items-center text-sm font-black text-[#0b75d9] transition hover:text-[#075eae]"
        >
          <BackIcon className="mr-1.5 size-4" />
          Alle Städteseiten
        </Link>
        <div className="flex flex-wrap gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className={secondaryButton}
          >
            Öffentliche Seite
          </a>
          <Link
            href={`/city-operations?city=${encodeURIComponent(city.slug)}`}
            className={secondaryButton}
          >
            Review-Queue
          </Link>
          <Link
            href={`/city-pages/${city.slug}/community`}
            className={secondaryButton}
          >
            Community-Inbox
          </Link>
          <Link
            href={`/city-pages/${city.slug}/newsletter`}
            className={secondaryButton}
          >
            Stadtnewsletter
          </Link>
          <Link
            href={`/media?city=${encodeURIComponent(city.slug)}`}
            className={secondaryButton}
          >
            Media Library
          </Link>
          <Link
            href={`/city-pages/${city.slug}/memory-stamps`}
            className={secondaryButton}
          >
            Memory Stamps
          </Link>
          <Link
            href={`/automation?city=${encodeURIComponent(city.id)}`}
            className={primaryButton}
          >
            Automationen
          </Link>
        </div>
      </div>

      {query.success === "profile_saved" ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          Stadtprofil gespeichert. Die öffentliche Seite verwendet die neuen Daten beim nächsten Abruf.
        </div>
      ) : null}
      {query.error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
        >
          Das Stadtprofil konnte nicht gespeichert werden. Bitte Pflichtfelder und URLs prüfen.
        </div>
      ) : null}
      {detail.warnings.map((warning) => (
        <div
          key={warning}
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
        >
          {warning}
        </div>
      ))}

      <section className="grid overflow-hidden rounded-3xl border border-[#061829]/10 bg-[#061829] text-white sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Partner" value={partnerCount} />
        <Metric label="Stadtinhalte" value={detail.records.length} />
        <Metric label="Offene Reviews" value={openCount} />
        <Metric label="Blockierende Hinweise" value={blockingCount} alert />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <form
          action={updateCityPageProfile}
          data-city-editor-form="true"
          className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_18px_50px_rgba(6,24,41,.05)]"
        >
          <input type="hidden" name="cityId" value={city.id} />
          <CityEditorFormBehavior />
          <div className="border-b border-[#061829]/10 p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Stadtprofil
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">
              Inhalte und Auffindbarkeit
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617080]">
              Diese Angaben steuern Hero, regionale Zuordnung und Suchmaschinen-Darstellung der öffentlichen Stadtseite.
            </p>
          </div>

          <div className="grid gap-5 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Stadtname" fieldPath="name" mode={detail.fieldControls.name?.mode ?? "AUTO"} required>
                <input
                  name="name"
                  required
                  maxLength={180}
                  defaultValue={city.name}
                  className={inputClass}
                />
              </Field>
              <Field label="URL-Pfad" helper="Der Slug bleibt stabil, damit bestehende Links funktionieren.">
                <input
                  value={`/stadt/${city.slug}`}
                  readOnly
                  className={`${inputClass} bg-[#f3f6f7] text-[#617080]`}
                />
              </Field>
              <Field label="Region" fieldPath="region" mode={detail.fieldControls.region?.mode ?? "AUTO"}>
                <input
                  name="region"
                  maxLength={180}
                  defaultValue={city.region}
                  placeholder="z. B. Pfälzerwald"
                  className={inputClass}
                />
              </Field>
              <Field label="Zugeordnete Gebiete">
                <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-[#061829]/10 bg-[#f8faf9] px-3 py-2">
                  {detail.regions.length ? (
                    detail.regions.map((region) => (
                      <span
                        key={region}
                        className="rounded-full bg-[#e8f4ff] px-2.5 py-1 text-xs font-black text-[#0b75d9]"
                      >
                        {region}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[#617080]">Noch keine Gebietszuordnung</span>
                  )}
                </div>
              </Field>
            </div>

            <Field label="Einleitung" fieldPath="intro" mode={detail.fieldControls.intro?.mode ?? "AUTO"} required helper="Klare lokale Zusammenfassung für Bewohner, Besucher und Suchmaschinen.">
              <textarea
                name="intro"
                required
                maxLength={4000}
                rows={6}
                defaultValue={city.intro}
                className={`${inputClass} min-h-36 py-3 leading-6`}
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Hero-Bild URL" fieldPath="hero_image_url" mode={detail.fieldControls.hero_image_url?.mode ?? "AUTO"} helper="Primäres Hero-Bild bitte über die Media Library zuweisen; diese URL bleibt der Legacy-Fallback.">
                <input
                  name="heroImageUrl"
                  type="url"
                  maxLength={2000}
                  defaultValue={city.heroImageUrl}
                  placeholder="https://…"
                  className={inputClass}
                />
              </Field>
              <Field label="Bildbeschreibung" fieldPath="hero_image_alt" mode={detail.fieldControls.hero_image_alt?.mode ?? "AUTO"}>
                <input
                  name="heroImageAlt"
                  maxLength={300}
                  defaultValue={city.heroImageAlt}
                  placeholder={`${city.name} aus der Vogelperspektive`}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SEO-Titel" fieldPath="seo_title" mode={detail.fieldControls.seo_title?.mode ?? "AUTO"} helper={`${city.seoTitle.length}/180 Zeichen`}>
                <input
                  name="seoTitle"
                  maxLength={180}
                  defaultValue={city.seoTitle}
                  className={inputClass}
                />
              </Field>
              <Field label="SEO-Beschreibung" fieldPath="seo_description" mode={detail.fieldControls.seo_description?.mode ?? "AUTO"} helper={`${city.seoDescription.length}/500 Zeichen`}>
                <textarea
                  name="seoDescription"
                  maxLength={500}
                  rows={3}
                  defaultValue={city.seoDescription}
                  className={`${inputClass} min-h-12 py-3`}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Bundesland" fieldPath="state" mode={detail.fieldControls.state?.mode ?? "AUTO"}>
                <input name="state" maxLength={120} defaultValue={city.state} className={inputClass} />
              </Field>
              <Field label="Land" fieldPath="country" mode={detail.fieldControls.country?.mode ?? "AUTO"}>
                <input name="country" maxLength={120} defaultValue={city.country} className={inputClass} />
              </Field>
              <Field label="Breitengrad" fieldPath="latitude" mode={detail.fieldControls.latitude?.mode ?? "AUTO"}>
                <input name="latitude" inputMode="decimal" defaultValue={city.latitude ?? ""} className={inputClass} />
              </Field>
              <Field label="Längengrad" fieldPath="longitude" mode={detail.fieldControls.longitude?.mode ?? "AUTO"}>
                <input name="longitude" inputMode="decimal" defaultValue={city.longitude ?? ""} className={inputClass} />
              </Field>
            </div>
          </div>

          <div className="border-t border-[#061829]/10 bg-[#f3f8ff] px-5 py-4 sm:px-6">
            <label className="flex items-start gap-3 text-sm leading-6 text-[#344454]">
              <input
                name="confirm_auto_update"
                type="checkbox"
                className="mt-1 size-4 accent-[#118cff]"
              />
              <span>
                <span className="block font-black">Automatische Pflege ausdrücklich erlauben</span>
                <span className="block text-xs font-medium text-[#617080]">
                  Nur erforderlich, wenn ein manuell gepflegtes Profilfeld wieder auf automatisch gestellt wird.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#061829]/10 bg-[#fafbf9] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <p className="text-xs font-semibold text-[#617080]">
              Letzte Datenänderung: {formatDate(city.updatedAt)}
            </p>
            <PendingSubmitButton
              pendingLabel="Stadtprofil wird gespeichert …"
              className={`${primaryButton} min-w-48`}
            >
              Stadtprofil speichern
            </PendingSubmitButton>
          </div>
        </form>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
                  Veröffentlichungsstatus
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {profileComplete ? "Profil vollständig" : "Profil ergänzen"}
                </h2>
              </div>
              <StatusMark ready={profileComplete} />
            </div>
            <div className="mt-5 divide-y divide-[#061829]/10 border-y border-[#061829]/10">
              <ReadinessRow label="Einleitung" ready={Boolean(city.intro)} />
              <ReadinessRow label="Hero-Bild" ready={Boolean(city.heroImageUrl)} />
              <ReadinessRow label="SEO-Titel" ready={Boolean(city.seoTitle)} />
              <ReadinessRow label="SEO-Beschreibung" ready={Boolean(city.seoDescription)} />
            </div>
          </section>

          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Arbeitsbereiche
            </p>
            <div className="mt-4 grid gap-2">
              <Link href={`/city-operations?city=${city.slug}`} className={wideLink}>
                Inhalte prüfen
                <span>{openCount}</span>
              </Link>
              <Link href={`/automation?city=${city.id}`} className={wideLink}>
                Agent-Aufträge
                <span>Öffnen</span>
              </Link>
              <Link href={`/city-pages/${city.slug}/community`} className={wideLink}>
                Community-Inbox
                <span>{community.submissions.filter((item) => item.status === "needs_review").length}</span>
              </Link>
              <Link href={`/city-pages/${city.slug}/newsletter`} className={wideLink}>
                Stadtnewsletter
                <span>Öffnen</span>
              </Link>
              <a href={publicUrl} target="_blank" rel="noreferrer" className={wideLink}>
                Live-Seite
                <span>Öffnen</span>
              </a>
            </div>
          </section>

          <section className="rounded-3xl border border-[#061829]/10 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              City CMS
            </p>
            <div className="mt-3 rounded-2xl border border-[#f0d58b] bg-[#fff8df] px-3.5 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a6100]">{city.name} · {publicationLabel}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#6f5a20]">Public-Wechsel ist in dieser Welle geschützt. Änderungen bleiben im bestehenden Review-/Freigabeprozess.</p>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#617080]">
              Homepage, sechs Hubs, Collections und gemeinsame Navigation steuern die bestehende Vorlage datengetrieben.
            </p>
            <div className="mt-4 grid gap-2">
              <Link href={`/city-pages/${city.slug}/site/homepage`} className={wideLink}>Homepage <span>Öffnen</span></Link>
              <Link href={`/city-pages/${city.slug}/site/hubs?key=discovery`} className={wideLink}>Hubs <span>6 Bereiche</span></Link>
                  <Link href={`/city-pages/${city.slug}/site/collections?key=sehenswuerdigkeiten`} className={wideLink}>Collections <span>Öffnen</span></Link>
                  <Link href={`/city-pages/${city.slug}/site/navigation`} className={wideLink}>Navigation <span>Desktop + Mobile</span></Link>
                  <Link href={`/city-pages/${city.slug}/memory-stamps`} className={wideLink}>Memory Stamps <span>10 Slots</span></Link>
                  <Link href={`/city-pages/${city.slug}/businesses`} className={wideLink}>Businesses <span>{partnerCount}</span></Link>
              <Link href={`/city-pages/${city.slug}/editorial`} className={wideLink}>Editorial <span>Öffnen</span></Link>
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-3xl border border-[#061829]/10 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Inhalt anlegen
            </p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.025em]">
              Stadtmodul auswählen
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#617080]">
            Neue Inhalte bleiben Entwürfe, bis Agent-Prüfung und menschliche Freigabe abgeschlossen sind.
          </p>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cityContentTypes.map((contentType) => {
            const definition = cityContentEditorDefinitions[contentType]
            const count = detail.records.filter(
              (record) => record.contentType === contentType,
            ).length
            return (
              <Link
                key={contentType}
                href={`/city-pages/${city.slug}/content/${contentType}/new`}
                className="group flex min-h-24 flex-col justify-between rounded-2xl border border-[#061829]/10 bg-[#f8faf9] p-3.5 transition hover:-translate-y-0.5 hover:border-[#118cff]/35 hover:bg-[#f3f8ff] active:translate-y-0"
              >
                <span className="text-sm font-black">{definition.singular}</span>
                <span className="flex items-center justify-between text-xs font-bold text-[#617080]">
                  {count} vorhanden
                  <PlusIcon className="size-4 text-[#0b75d9]" />
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-[#061829]/10 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Inhaltskatalog
            </p>
            <h2 className="mt-1 text-xl font-black">{detail.records.length} Datensätze</h2>
          </div>
          <p className="text-sm text-[#617080]">
            Bearbeitung und Freigabe bleiben im zentralen Admin.
          </p>
        </div>
        {detail.records.length ? (
          <div className="divide-y divide-[#061829]/10">
            {detail.records.map((record) => (
              <article
                key={`${record.contentType}-${record.id}`}
                className="grid gap-4 p-5 md:grid-cols-[8rem_minmax(0,1fr)_auto] md:items-center"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0b75d9]">
                    {contentTypeLabel(record.contentType)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#617080]">
                    {stageLabel(record.stage)}
                  </p>
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-black">{record.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#617080]">
                    {record.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Link
                    href={`/city-pages/${city.slug}/content/${record.contentType}/${record.id}`}
                    className={primaryButton}
                  >
                    Bearbeiten
                  </Link>
                  <Link
                    href={`/city-operations/${record.contentType}/${record.id}`}
                    className={secondaryButton}
                  >
                    Prüfen
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <p className="text-lg font-black">Noch keine Stadtinhalte</p>
            <p className="mt-2 text-sm text-[#617080]">
              Einen Stadt-Scan starten, um geprüfte Entwürfe vorzubereiten.
            </p>
            <Link
              href={`/automation?city=${city.id}`}
              className={`${primaryButton} mt-5`}
            >
              Stadt-Scan starten
            </Link>
          </div>
        )}
      </section>
    </AdminShell>
  )
}

function Field({
  label,
  helper,
  required = false,
  fieldPath,
  mode,
  children,
}: {
  label: string
  helper?: string
  required?: boolean
  fieldPath?: string
  mode?: "AUTO" | "MANUAL" | "LOCKED"
  children: React.ReactNode
}) {
  if (fieldPath && mode) {
    return (
      <div data-field-control={fieldPath} className="grid gap-2 text-xs font-bold text-[#526170]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {label}
            {required ? <span className="text-rose-600"> *</span> : null}
          </span>
          <FieldModeSelect fieldPath={fieldPath} mode={mode} />
        </div>
        {children}
        {helper ? <span className="font-medium leading-5 text-[#7a8793]">{helper}</span> : null}
      </div>
    )
  }

  return (
    <label className="grid gap-2 text-xs font-bold text-[#526170]">
      <span>
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      {children}
      {helper ? <span className="font-medium leading-5 text-[#7a8793]">{helper}</span> : null}
    </label>
  )
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <div className="border-white/10 px-5 py-5 sm:border-l sm:first:border-l-0">
      <p className={`text-3xl font-black tracking-[-0.04em] ${alert && value ? "text-[#ffafaf]" : ""}`}>
        {value}
      </p>
      <p className="mt-1 text-sm font-semibold text-white/65">{label}</p>
    </div>
  )
}

function StatusMark({ ready }: { ready: boolean }) {
  return (
    <span
      className={`grid size-11 place-items-center rounded-full border text-lg font-black ${
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
      aria-label={ready ? "Vollständig" : "Unvollständig"}
    >
      {ready ? <CheckIcon className="size-5" /> : "!"}
    </span>
  )
}

function ReadinessRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="font-semibold">{label}</span>
      <span className={`font-black ${ready ? "text-emerald-700" : "text-amber-800"}`}>
        {ready ? "Vorhanden" : "Fehlt"}
      </span>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return "unbekannt"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "unbekannt"
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M16 10H4m4-4-4 4 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="m4.5 10 3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

const inputClass =
  "min-h-12 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df] active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-black text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff] active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"

const wideLink =
  "flex min-h-12 items-center justify-between rounded-xl border border-[#061829]/10 bg-[#f8faf9] px-3.5 text-sm font-black transition hover:border-[#118cff]/35 hover:bg-[#f3f8ff] active:scale-[.98]"
