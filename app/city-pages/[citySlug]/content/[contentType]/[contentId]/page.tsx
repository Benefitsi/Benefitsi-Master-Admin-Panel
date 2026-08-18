import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { restoreCityContentField, saveCityContent } from "@/app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions"
import { CityEditorFormBehavior } from "@/components/city-pages/editor-form-behavior"
import { FieldModeSelect } from "@/components/city-pages/field-mode-select"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import {
  loadCityContentEditor,
  type CityEditorMediaAssignment,
  type EditorField,
  type EditorRelationOptions,
} from "@/lib/city-pages/content-editor"
import {
  isCityContentType,
} from "@/lib/city-operations/contracts"
import type { FieldControlMode } from "@/lib/city-pages/field-controls"
import {
  hasStructuredEventPricing,
  structuredPlacePricingCount,
  validateCityContentCrossFields,
} from "@/lib/city-pages/content-validation"

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
  const qualityValidation = validateCityContentCrossFields({
    contentType: definition.contentType,
    currentValues: (record ?? {}) as Record<string, unknown>,
    nextValues: (record ?? {}) as Record<string, unknown>,
    changedFields: new Set<string>(),
    isNew,
  })
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
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/media?city=${encodeURIComponent(editor.city.slug)}&entityType=${encodeURIComponent(mediaEntityType(definition.contentType))}&entityId=${encodeURIComponent(route.contentId)}`}
              className={secondaryButton}
            >
              Media
            </Link>
            <Link
              href={`/city-operations/${definition.contentType}/${route.contentId}`}
              className={secondaryButton}
            >
              Review öffnen
            </Link>
          </div>
        ) : null}
      </div>

      {feedback.success ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          {feedback.success === "review_queued"
            ? "Gespeichert. Ein optionaler Agent-Recheck wurde angefordert; die menschliche Freigabe bleibt unabhängig möglich."
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
      <ContentQualityPanel
        contentType={definition.contentType}
        record={(record ?? {}) as Record<string, unknown>}
        warnings={qualityValidation.warnings}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.55fr)]">
        <form
          id="city-content-editor-form"
          data-city-editor-form="true"
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

          <CityEditorFormBehavior />

          <nav
            aria-label="Editor-Bereiche"
            className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-[#061829]/10 bg-white px-5 py-3 sm:px-6"
          >
            {editorSections(definition.fields).map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="shrink-0 rounded-xl px-3 py-2 text-xs font-black text-[#617080] transition hover:bg-[#f3f8ff] hover:text-[#0b75d9]"
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className="grid gap-6 p-5 sm:p-6">
            {editorSections(definition.fields).map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-20">
                <div className="mb-4 flex items-end justify-between gap-4 border-b border-[#061829]/10 pb-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
                      {section.kicker}
                    </p>
                    <h3 className="mt-1 text-lg font-black">{section.label}</h3>
                  </div>
                  {section.id === "seo" ? (
                    <span className="hidden text-xs font-semibold text-[#7a8793] sm:block">
                      Leer = automatisch ableiten
                    </span>
                  ) : null}
                </div>
                {section.id === "media" ? (
                  <MediaAssignmentSummary assignments={editor.mediaAssignments} />
                ) : null}
                <div className="grid gap-5">
                  {section.fields.map((field) => (
                    <EditorFieldControl
                      key={field.name}
                      field={field}
                      value={record?.[field.name]}
                      mode={editor.fieldControls?.[field.name]?.mode ?? "AUTO"}
                      partners={partners}
                      deals={deals}
                      relationOptions={editor.relationOptions}
                    />
                  ))}
                </div>
              </section>
            ))}
            <section id="settings" className="scroll-mt-20 rounded-2xl border border-[#118cff]/15 bg-[#f3f8ff] p-4">
              <div className="flex items-start gap-3">
                <input
                  id="confirm-auto-update"
                  name="confirm_auto_update"
                  type="checkbox"
                  className="mt-1 size-4 accent-[#118cff]"
                />
                <label htmlFor="confirm-auto-update" className="text-sm leading-6 text-[#344454]">
                  <span className="font-black">Automatische Pflege ausdrücklich erlauben</span>
                  <span className="mt-1 block text-xs font-medium text-[#617080]">
                    Nur aktivieren, wenn ein manuell gepflegtes Feld wieder auf AUTO gestellt werden soll. Die nächste Automation darf den Wert dann wieder ändern.
                  </span>
                </label>
              </div>
            </section>
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
            <h2 className="mt-2 text-xl font-black">Human Curation zuerst</h2>
            <ol className="mt-5 space-y-4 text-sm text-white/70">
              <WorkflowStep number="1" text="Admin erstellt oder ändert den Datensatz." />
              <WorkflowStep number="2" text="Nur relevante Aktualitätsänderungen erhalten eine neue Quellenprüfung." />
              <WorkflowStep number="3" text="Der Stadt-Agent kann optional einen Recheck oder Vorschlag liefern." />
              <WorkflowStep number="4" text="Ein berechtigter Mensch entscheidet über die Veröffentlichung." />
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

          {!isNew ? <ContentAuditPanel editor={editor} contentType={definition.contentType} contentId={route.contentId} /> : null}
        </aside>
      </div>
    </AdminShell>
  )
}

function ContentQualityPanel({
  contentType,
  record,
  warnings,
}: {
  contentType: string
  record: Record<string, unknown>
  warnings: Array<{ field: string; message: string }>
}) {
  const isPlace = contentType === "places"
  const isEvent = contentType === "events"
  const placePricingCount = isPlace
    ? structuredPlacePricingCount(record.pricing)
    : 0
  const eventHasStructuredPricing = isEvent && hasStructuredEventPricing(record.pricing)
  if (!warnings.length && !placePricingCount && !eventHasStructuredPricing) return null

  return (
    <section className="rounded-2xl border border-[#061829]/10 bg-white px-4 py-3 shadow-[0_12px_30px_rgba(6,24,41,.04)]">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0b75d9]">
        Qualitätsprüfung
      </p>
      {placePricingCount ? (
        <p className="mt-2 text-sm font-semibold leading-6 text-[#344454]">
          Öffentliche Eintrittsinformation: {placePricingCount} strukturierte Tarifzeilen aus <code className="rounded bg-[#f3f8ff] px-1">pricing</code> werden verwendet. Das Kurzfeld bleibt optional.
        </p>
      ) : null}
      {eventHasStructuredPricing ? (
        <p className="mt-2 text-sm font-semibold leading-6 text-[#344454]">
          Öffentliche Preisinformation: strukturierte Veranstaltungs-Preise aus <code className="rounded bg-[#f3f8ff] px-1">pricing</code> werden verwendet. Das Kurzfeld bleibt optional.
        </p>
      ) : null}
      {warnings.length ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-950">
          <p className="font-black">Content Gap · Speichern bleibt möglich</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((warning) => <li key={`${warning.field}:${warning.message}`}>{warning.message}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function ContentAuditPanel({ editor, contentType, contentId }: { editor: Awaited<ReturnType<typeof loadCityContentEditor>>; contentType: string; contentId: string }) {
  if (!editor.audits?.length) {
    return <section className="rounded-3xl border border-dashed border-[#061829]/15 bg-white p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-[#0b75d9]">Restore</p><p className="mt-2 text-sm leading-6 text-[#617080]">Nach einer Feldänderung erscheint hier der vorherige Wert mit sicherer Wiederherstellung.</p></section>
  }
  return <section className="rounded-3xl border border-[#061829]/10 bg-white p-5"><p className="text-xs font-black uppercase tracking-[.14em] text-[#0b75d9]">Restore / letzte Änderungen</p><p className="mt-2 text-sm leading-6 text-[#617080]">Restore erzeugt eine neue Revision, hält die bisherige öffentliche Version als Fallback und veröffentlicht den wiederhergestellten Wert über denselben Human-Approval-Pfad.</p><div className="mt-4 divide-y divide-[#061829]/10">{editor.audits.slice(0, 10).map((audit) => <div key={audit.id} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black">{audit.fieldPath} · {audit.action}</p><p className="mt-1 text-xs font-semibold text-[#71808b]">{formatDate(audit.createdAt)} · {audit.actorProfile || "Admin"}</p><p className="mt-2 break-words rounded-lg bg-[#f7f9fa] px-2 py-1 text-xs text-[#526170]">Vorher: {shortAuditValue(audit.beforeValue)}</p></div>{audit.action !== "RESTORE" ? <form action={restoreCityContentField}><input type="hidden" name="citySlug" value={editor.city?.slug ?? ""} /><input type="hidden" name="contentType" value={contentType} /><input type="hidden" name="contentId" value={contentId} /><input type="hidden" name="auditId" value={audit.id} /><button className="min-h-10 rounded-xl border border-[#061829]/12 bg-white px-3 text-xs font-black text-[#061829] transition hover:border-[#118cff]/45 hover:bg-[#f3f8ff]">Wiederherstellen &amp; veröffentlichen</button></form> : null}</div></div>)}</div></section>
}

function shortAuditValue(value: unknown) { const raw = typeof value === "string" ? value : JSON.stringify(value); return (raw || "leer").slice(0, 180) }

type EditorSection = {
  id: "content" | "media" | "seo" | "relations" | "sources"
  label: string
  kicker: string
  fields: EditorField[]
}

function editorSections(fields: EditorField[]): EditorSection[] {
  const sections: EditorSection[] = [
    { id: "content", label: "Inhalt", kicker: "CONTENT", fields: [] },
    { id: "media", label: "Medien", kicker: "MEDIA", fields: [] },
    { id: "seo", label: "SEO", kicker: "SEO", fields: [] },
    { id: "relations", label: "Verknüpfungen", kicker: "RELATIONS", fields: [] },
    { id: "sources", label: "Quellen", kicker: "SOURCES", fields: [] },
  ]

  for (const field of fields) {
    const section =
      field.name.startsWith("seo_")
        ? sections[2]
        : field.name.startsWith("image_")
          ? sections[1]
          : field.kind === "relation" ||
              field.kind === "relations" ||
              field.kind === "partner" ||
              field.kind === "deal"
            ? sections[3]
            : ["source_url", "source_name", "expires_at", "image_credit_label", "image_credit_url", "image_license", "image_license_url"].includes(field.name)
              ? sections[4]
              : sections[0]
    section.fields.push(field)
  }

  return sections.filter((section) => section.fields.length > 0)
}

function MediaAssignmentSummary({
  assignments,
}: {
  assignments: CityEditorMediaAssignment[]
}) {
  return (
    <div className="mb-5 rounded-2xl border border-[#17d4d7]/25 bg-[#f1fbfb] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0b75d9]">
            Media Library
          </p>
          <p className="mt-1 text-sm font-bold text-[#344454]">
            Primäre Bildrollen werden zentral in der Media Library gepflegt.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#617080]">
          {assignments.length} zugewiesen
        </span>
      </div>
      {assignments.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {assignments.map((assignment) => (
            <a
              key={assignment.id}
              href={assignment.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-3 rounded-xl border border-white bg-white p-2 text-xs font-bold text-[#344454] transition hover:border-[#118cff]/30"
            >
              <img
                src={assignment.publicUrl}
                alt={assignment.altText || assignment.title || "Zugewiesenes Bild"}
                className="size-12 shrink-0 rounded-lg object-cover"
              />
              <span className="min-w-0">
                <span className="block truncate">{assignment.title || "Ohne Titel"}</span>
                <span className="mt-0.5 block text-[11px] font-semibold text-[#7a8793]">
                  {assignment.role}{assignment.isPrimary ? " · Primär" : ""}
                </span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold leading-5 text-[#617080]">
          Noch keine Media-Zuweisung. Öffne die Media Library, um Hero-, Card- oder Galerie-Bilder zuzuweisen.
        </p>
      )}
    </div>
  )
}

function EditorFieldControl({
  field,
  value,
  mode,
  partners,
  deals,
  relationOptions,
}: {
  field: EditorField
  value: unknown
  mode: FieldControlMode
  partners: PartnerOption[]
  deals: DealOption[]
  relationOptions: EditorRelationOptions
}) {
  const id = `field-${field.name}`
  const disabled = mode === "LOCKED"
  const modeControl = <FieldModeSelect fieldPath={field.name} mode={mode} />
  if (field.kind === "opening_hours") {
    return (
      <div data-field-control={field.name} className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-[#526170]">
            {field.label}
          </span>
          {modeControl}
        </div>
        <OpeningHoursControl field={field} value={value} disabled={disabled} />
      </div>
    )
  }
  const common = {
    id,
    name: field.name,
    required: field.required,
    disabled,
    "data-field-input": "true",
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
        <option value="">Kein Deal</option>
        {deals.map((deal) => (
          <option key={deal.id} value={deal.id}>
            {deal.title}
          </option>
        ))}
      </select>
    )
  } else if (field.kind === "relation") {
    const options = field.relationType
      ? relationOptions[field.relationType]
      : []
    control = (
      <select {...common} defaultValue={stringValue(value)} className={inputClass}>
        <option value="">Kein Eintrag ausgewählt</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  } else if (field.kind === "relations") {
    const options = field.relationType
      ? relationOptions[field.relationType]
      : []
    const selected = new Set(stringArrayValue(value))
    control = (
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 items-center gap-2.5 rounded-xl border border-[#061829]/12 bg-[#f8faf9] px-3 text-sm font-bold text-[#344454]"
          >
            <input
              type="checkbox"
              name={field.name}
              value={option.value}
              defaultChecked={selected.has(option.value)}
              disabled={disabled}
              data-field-input="true"
              className="size-4 accent-[#118cff]"
            />
            {option.label}
          </label>
        ))}
        {!options.length ? (
          <span className="rounded-xl bg-[#f8faf9] px-3 py-3 text-sm text-[#7a8793]">
            Noch keine passenden Einträge in dieser Stadt.
          </span>
        ) : null}
      </div>
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
              disabled={disabled}
              data-field-input="true"
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
        // Existing production values must never be rejected by a coarse HTML
        // step (for example a 7-decimal latitude). Range validation remains
        // server-side in parseField().
        step={field.kind === "number" ? "any" : field.step}
        inputMode={field.kind === "number" ? (field.step === 1 ? "numeric" : "decimal") : undefined}
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

  if (field.kind === "checkbox") {
    return (
      <div data-field-control={field.name} className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          {control}
          {modeControl}
        </div>
      </div>
    )
  }
  if (field.kind === "weekdays") {
    return (
      <fieldset data-field-control={field.name} className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <legend className="text-xs font-bold text-[#526170]">{field.label}</legend>
          {modeControl}
        </div>
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
    <div data-field-control={field.name} className="grid gap-2 text-xs font-bold text-[#526170]">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id}>
          {field.label}
          {field.required ? <span className="text-rose-600"> *</span> : null}
        </label>
        {modeControl}
      </div>
      {control}
      {field.helper ? (
        <span className="font-medium leading-5 text-[#7a8793]">{field.helper}</span>
      ) : null}
    </div>
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
  disabled = false,
}: {
  field: EditorField
  value: unknown
  disabled?: boolean
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
                  disabled={disabled || entry?.closed}
                  data-field-input="true"
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
                  disabled={disabled || entry?.closed}
                  data-field-input="true"
                  className={inputClass}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-xs font-bold text-[#526170]">
                <input
                  type="checkbox"
                  name={`${field.name}_${weekday}_closed`}
                  aria-label={`${label} geschlossen`}
                  defaultChecked={entry?.closed === true}
                  disabled={disabled}
                  data-field-input="true"
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

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
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
    event_ticket_validation:
      "Bei einem ticket- oder registrierungspflichtigen Termin muss ein Ticket- oder Registrierungslink hinterlegt sein.",
    event_contact_validation:
      "Bitte eine gültige Veranstalter-E-Mail-Adresse eingeben.",
    place_admission_validation:
      "Bei einem kostenpflichtigen Ort muss eine öffentliche Eintrittsangabe hinterlegt sein.",
    place_contact_validation:
      "Bitte eine gültige Kontakt-E-Mail-Adresse eingeben.",
    invalid_partner:
      "Der gewählte Partner gehört nicht zu dieser Stadt oder ist nicht mehr verfügbar.",
    invalid_deal:
      "Der gewählte Deal gehört nicht zum ausgewählten Partner oder ist nicht mehr verfügbar.",
    invalid_relation:
      "Mindestens eine Verknüpfung gehört nicht zu dieser Stadt oder ist nicht mehr verfügbar.",
    locked_field:
      "Dieses Feld ist gesperrt. Stelle es zuerst ausdrücklich auf Manuell, bevor du es änderst.",
    locked_requires_manual:
      "Ein gesperrtes Feld kann nur über Manuell entsperrt werden.",
    auto_unlock_confirmation:
      "Bitte bestätige in den Einstellungen, dass die automatische Pflege wieder zugreifen darf.",
    control_sync:
      "Der Inhalt wurde gespeichert, aber die Feldpflege-Einstellungen konnten nicht gespeichert werden.",
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

function mediaEntityType(contentType: string) {
  return {
    events: "EVENT",
    places: "PLACE",
    routes: "ROUTE",
    guides: "GUIDE",
    benefits: "BUSINESS",
    clubs: "BUSINESS",
    playgrounds: "PLACE",
    challenges: "CITY",
  }[contentType] || "PLACE"
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
