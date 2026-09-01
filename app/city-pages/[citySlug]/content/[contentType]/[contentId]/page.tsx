import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { saveCityContent } from "@/app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import {
  loadCityContentEditor,
  type EditorField,
} from "@/lib/city-pages/content-editor"
import {
  isCityContentType,
} from "@/lib/city-operations/contracts"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Stadtinhalt bearbeiten",
  description: "Stadtmodule zentral anlegen und zur Agent-Prüfung einreichen.",
}

type SearchParams = {
  success?: string
  error?: string
}

type PartnerOption = {
  id: string
  name: string
  slug: string
}

type DealOption = {
  id: string
  title: string
  partner_id: string
}

export default async function CityContentEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{
    citySlug: string
    contentType: string
    contentId: string
  }>
  searchParams: Promise<SearchParams>
}) {
  const route = await params
  const feedback = await searchParams
  if (!isCityContentType(route.contentType)) notFound()
  if (route.contentId !== "new" && !isUuid(route.contentId)) notFound()

  const { adminSession, supabase } = await requireAdmin()
  const editor = await loadCityContentEditor(
    route.citySlug,
    route.contentType,
    route.contentId,
  )
  if (!editor.city || (route.contentId !== "new" && !editor.record)) notFound()

  const partnerResult = await supabase
    .from("partners")
    .select("id,name,slug")
    .eq("city_id", editor.city.id)
    .order("name")
  const partners = (partnerResult.data ?? []) as PartnerOption[]
  const partnerIds = partners.map((partner) => partner.id)
  const dealResult = partnerIds.length
    ? await supabase
        .from("deals")
        .select("id,title,partner_id")
        .in("partner_id", partnerIds)
        .order("title")
    : { data: [] }
  const deals = (dealResult.data ?? []) as DealOption[]
  const isNew = route.contentId === "new"
  const definition = editor.definition
  const record = editor.record
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"
  const currentTitle =
    record && typeof record[definition.titleField] === "string"
      ? String(record[definition.titleField])
      : `${definition.singular} anlegen`

  return (
    <AdminShell
      adminName={adminName}
      title={currentTitle}
      subtitle={`${editor.city.name} · ${definition.singular} ${
        isNew ? "anlegen" : "bearbeiten"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/city-pages/${editor.city.slug}`}
          className="inline-flex min-h-11 items-center text-sm font-black text-[#0b75d9] transition hover:text-[#075eae]"
        >
          <BackIcon className="mr-1.5 size-4" />
          Zur Stadtverwaltung
        </Link>
        {!isNew ? (
          <Link
            href={`/city-operations/${definition.contentType}/${route.contentId}`}
            className={secondaryButton}
          >
            Review öffnen
          </Link>
        ) : null}
      </div>

      {feedback.success ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          {feedback.success === "review_queued"
            ? "Gespeichert. Ein neuer Agent-Prüfauftrag wurde angelegt."
            : "Der Entwurf wurde gespeichert."}
        </div>
      ) : null}
      {feedback.error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
        >
          {errorMessage(feedback.error)}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.55fr)]">
        <form
          action={saveCityContent}
          className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_18px_50px_rgba(6,24,41,.05)]"
        >
          <input type="hidden" name="cityId" value={editor.city.id} />
          <input type="hidden" name="citySlug" value={editor.city.slug} />
          <input
            type="hidden"
            name="contentType"
            value={definition.contentType}
          />
          <input type="hidden" name="contentId" value={route.contentId} />

          <div className="border-b border-[#061829]/10 p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              {definition.plural}
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">
              {isNew ? "Neuen Datensatz anlegen" : "Datensatz bearbeiten"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617080]">
              {definition.description}
            </p>
          </div>

          <div className="grid gap-5 p-5 sm:p-6">
            {definition.fields.map((field) => (
              <EditorFieldControl
                key={field.name}
                field={field}
                value={record?.[field.name]}
                partners={partners}
                deals={deals}
              />
            ))}
          </div>

          <div className="grid gap-3 border-t border-[#061829]/10 bg-[#fafbf9] p-5 sm:grid-cols-2 sm:p-6">
            <PendingSubmitButton
              name="intent"
              value="draft"
              pendingLabel="Entwurf wird gespeichert …"
              className={secondaryButton}
            >
              Als Entwurf speichern
            </PendingSubmitButton>
            <PendingSubmitButton
              name="intent"
              value="review"
              pendingLabel="Prüfauftrag wird angelegt …"
              className={primaryButton}
            >
              Speichern & Agent prüfen lassen
            </PendingSubmitButton>
          </div>
        </form>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">
              Sicherer Workflow
            </p>
            <h2 className="mt-2 text-xl font-black">Keine direkte Veröffentlichung</h2>
            <ol className="mt-5 space-y-4 text-sm text-white/70">
              <WorkflowStep number="1" text="Admin erstellt oder ändert den Datensatz." />
              <WorkflowStep number="2" text="Quelle und Prüfstatus werden zurückgesetzt." />
              <WorkflowStep number="3" text="Stadt-Agent prüft Aktualität, Quelle und Vollständigkeit." />
              <WorkflowStep number="4" text="Ein Mensch entscheidet über die Veröffentlichung." />
            </ol>
          </section>

          {!isNew ? (
            <section className="rounded-3xl border border-[#061829]/10 bg-white p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
                Aktueller Datensatz
              </p>
              <dl className="mt-4 divide-y divide-[#061829]/10 border-y border-[#061829]/10 text-sm">
                <Datum label="Status" value={stringValue(record?.status)} />
                <Datum
                  label="Zuletzt geändert"
                  value={formatDate(stringValue(record?.updated_at))}
                />
                <Datum
                  label="Zuletzt verifiziert"
                  value={formatDate(stringValue(record?.last_verified_at))}
                />
              </dl>
              {record?.status === "active" ? (
                <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
                  Beim Speichern wird der Inhalt wieder zum Entwurf. Dadurch bleiben ungeprüfte Änderungen nicht live.
                </p>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
    </AdminShell>
  )
}

function EditorFieldControl({
  field,
  value,
  partners,
  deals,
}: {
  field: EditorField
  value: unknown
  partners: PartnerOption[]
  deals: DealOption[]
}) {
  const id = `field-${field.name}`
  if (field.kind === "opening_hours") {
    return (
      <OpeningHoursControl
        field={field}
        value={value}
      />
    )
  }
  const common = {
    id,
    name: field.name,
    required: field.required,
  }

  let control: React.ReactNode

  if (field.kind === "textarea" || field.kind === "tags") {
    control = (
      <textarea
        {...common}
        rows={field.rows ?? (field.kind === "tags" ? 4 : 6)}
        maxLength={field.maxLength}
        defaultValue={field.kind === "tags" ? arrayValue(value) : stringValue(value)}
        placeholder={field.placeholder}
        className={`${inputClass} min-h-28 py-3 leading-6`}
      />
    )
  } else if (field.kind === "select") {
    control = (
      <select
        {...common}
        defaultValue={stringValue(value)}
        className={inputClass}
      >
        {field.options?.map((option) => (
          <option key={option.value || "empty"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  } else if (field.kind === "partner") {
    control = (
      <select {...common} defaultValue={stringValue(value)} className={inputClass}>
        <option value="">{field.required ? "Partner auswählen" : "Kein Partner"}</option>
        {partners.map((partner) => (
          <option key={partner.id} value={partner.id}>
            {partner.name}
          </option>
        ))}
      </select>
    )
  } else if (field.kind === "deal") {
    control = (
      <select {...common} defaultValue={stringValue(value)} className={inputClass}>
        <option value="">Kein Vorteil</option>
        {deals.map((deal) => (
          <option key={deal.id} value={deal.id}>
            {deal.title}
          </option>
        ))}
      </select>
    )
  } else if (field.kind === "checkbox") {
    control = (
      <label
        htmlFor={id}
        className="flex min-h-12 items-center gap-3 rounded-xl border border-[#061829]/15 bg-[#f8faf9] px-3 text-sm font-bold"
      >
        <input
          {...common}
          type="checkbox"
          defaultChecked={value === true}
          className="size-4 accent-[#118cff]"
        />
        {field.label}
      </label>
    )
  } else if (field.kind === "weekdays") {
    const selected = new Set(numberArrayValue(value))
    control = (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {field.options?.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 items-center gap-2.5 rounded-xl border border-[#061829]/12 bg-[#f8faf9] px-3 text-sm font-bold text-[#344454]"
          >
            <input
              type="checkbox"
              name={field.name}
              value={option.value}
              defaultChecked={selected.has(Number(option.value))}
              className="size-4 accent-[#118cff]"
            />
            {option.label}
          </label>
        ))}
      </div>
    )
  } else {
    control = (
      <input
        {...common}
        type={
          field.kind === "url"
            ? "url"
            : field.kind === "number"
              ? "number"
            : field.kind === "datetime"
              ? "datetime-local"
              : field.kind === "date"
                ? "date"
                : field.kind === "time"
                  ? "time"
                : "text"
        }
        min={field.min}
        max={field.max}
        step={field.step}
        maxLength={field.maxLength}
        defaultValue={
          field.kind === "datetime"
            ? datetimeLocalValue(value)
            : field.kind === "time"
              ? timeValue(value)
            : stringValue(value)
        }
        placeholder={field.placeholder}
        className={inputClass}
      />
    )
  }

  if (field.kind === "checkbox") return control
  if (field.kind === "weekdays") {
    return (
      <fieldset className="grid gap-2">
        <legend className="text-xs font-bold text-[#526170]">{field.label}</legend>
        {control}
        {field.helper ? (
          <span className="text-xs font-medium leading-5 text-[#7a8793]">
            {field.helper}
          </span>
        ) : null}
      </fieldset>
    )
  }

  return (
    <label htmlFor={id} className="grid gap-2 text-xs font-bold text-[#526170]">
      <span>
        {field.label}
        {field.required ? <span className="text-rose-600"> *</span> : null}
      </span>
      {control}
      {field.helper ? (
        <span className="font-medium leading-5 text-[#7a8793]">{field.helper}</span>
      ) : null}
    </label>
  )
}

const weekdayLabels = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
]

type OpeningHoursEditorValue = {
  weekday: number
  closed: boolean
  opens?: string
  closes?: string
}

function OpeningHoursControl({
  field,
  value,
}: {
  field: EditorField
  value: unknown
}) {
  const entries = new Map(
    (Array.isArray(value) ? value : [])
      .filter(
        (entry): entry is OpeningHoursEditorValue =>
          Boolean(entry) &&
          typeof entry === "object" &&
          Number.isInteger((entry as OpeningHoursEditorValue).weekday),
      )
      .map((entry) => [entry.weekday, entry]),
  )

  return (
    <fieldset className="grid gap-3">
      <legend className="text-xs font-bold text-[#526170]">{field.label}</legend>
      <div className="overflow-hidden rounded-2xl border border-[#061829]/12">
        {weekdayLabels.map((label, index) => {
          const weekday = index + 1
          const entry = entries.get(weekday)
          return (
            <div
              key={label}
              className="grid gap-3 border-b border-[#061829]/10 bg-[#f8faf9] p-3 last:border-b-0 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-center"
            >
              <span className="text-sm font-black text-[#344454]">{label}</span>
              <label className="grid gap-1 text-[11px] font-bold text-[#6a7885]">
                Öffnet
                <input
                  type="time"
                  name={`${field.name}_${weekday}_opens`}
                  aria-label={`${label} öffnet`}
                  defaultValue={entry?.opens?.slice(0, 5) ?? ""}
                  disabled={entry?.closed}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-[11px] font-bold text-[#6a7885]">
                Schließt
                <input
                  type="time"
                  name={`${field.name}_${weekday}_closes`}
                  aria-label={`${label} schließt`}
                  defaultValue={entry?.closes?.slice(0, 5) ?? ""}
                  disabled={entry?.closed}
                  className={inputClass}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-xs font-bold text-[#526170]">
                <input
                  type="checkbox"
                  name={`${field.name}_${weekday}_closed`}
                  aria-label={`${label} geschlossen`}
                  defaultChecked={entry?.closed === true}
                  className="size-4 accent-[#118cff]"
                />
                geschlossen
              </label>
            </div>
          )
        })}
      </div>
      {field.helper ? (
        <span className="text-xs font-medium leading-5 text-[#7a8793]">
          {field.helper}
        </span>
      ) : null}
    </fieldset>
  )
}

function WorkflowStep({ number, text }: { number: string; text: string }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] items-start gap-3">
      <span className="grid size-8 place-items-center rounded-full border border-white/15 bg-white/8 font-black text-white">
        {number}
      </span>
      <span className="pt-1.5 leading-6">{text}</span>
    </li>
  )
}

function Datum({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="font-semibold text-[#617080]">{label}</dt>
      <dd className="text-right font-black">{value || "Nicht vorhanden"}</dd>
    </div>
  )
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : ""
}

function arrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").join("\n")
    : ""
}

function numberArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : []
}

function timeValue(value: unknown) {
  return typeof value === "string" ? value.slice(0, 5) : ""
}

function datetimeLocalValue(value: unknown) {
  if (typeof value !== "string" || !value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Berlin",
      }).format(date)
}

function errorMessage(error: string) {
  return {
    field_validation:
      "Bitte alle Pflichtfelder, URLs, Auswahlwerte und Zahlen prüfen.",
    date_order:
      "Das Ende muss nach dem Beginn liegen; das Ablaufdatum darf nicht vor dem Ende liegen.",
    recurrence_validation:
      "Bitte Rhythmus, Wochentage bzw. Monatstag, Uhrzeiten, Gültigkeit, Quelle und öffentliche Beschreibung der Terminserie prüfen.",
    event_price_validation:
      "Bei einem kostenpflichtigen Termin muss eine öffentliche Preisangabe hinterlegt sein.",
    event_contact_validation:
      "Bitte eine gültige Veranstalter-E-Mail-Adresse eingeben.",
    place_admission_validation:
      "Bei einem kostenpflichtigen Ort muss eine öffentliche Eintrittsangabe hinterlegt sein.",
    place_contact_validation:
      "Bitte eine gültige Kontakt-E-Mail-Adresse eingeben.",
    invalid_partner:
      "Der gewählte Partner gehört nicht zu dieser Stadt oder ist nicht mehr verfügbar.",
    invalid_deal:
      "Der gewählte Vorteil gehört nicht zum ausgewählten Partner oder ist nicht mehr verfügbar.",
    content_missing: "Der Datensatz wurde nicht gefunden oder gehört zu einer anderen Stadt.",
    review_sync:
      "Der Inhalt wurde gespeichert, aber der zentrale Prüfdatensatz konnte nicht aktualisiert werden.",
    audit_sync:
      "Der Inhalt und seine Prüfung wurden gespeichert, aber der Audit-Eintrag fehlt. Bitte vor Veröffentlichung prüfen.",
    queue_failed:
      "Der Inhalt wurde gespeichert, konnte aber nicht in die Agent-Prüfung eingereiht werden.",
    schedule_sync:
      "Der Termin wurde gespeichert, aber die Terminserie konnte nicht vollständig aktualisiert werden.",
    save_failed:
      "Der Inhalt konnte nicht gespeichert werden. Möglicherweise existiert der Slug bereits.",
  }[error] || "Die Aktion konnte nicht abgeschlossen werden."
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
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

const inputClass =
  "min-h-12 w-full rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df] active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-black text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff] active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"
