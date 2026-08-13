import type { Metadata } from "next"
import type { ReactNode } from "react"
import { AdminShell } from "@/app/admin-shell"
import { ReviewQueueRow } from "@/components/city-operations/review-ui"
import { requireAdmin } from "@/lib/admin"
import {
  cityContentTypes,
  contentTypeLabel,
  filterCityReviewRecords,
  stageLabel,
  type CityReviewStage,
} from "@/lib/city-operations/contracts"
import { loadCityOperationsData } from "@/lib/city-operations/data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Städte-Review | Benefitsi Admin",
  description: "Zentrale Qualitätskontrolle für alle Benefitsi-Stadtinhalte.",
}

type SearchParams = {
  city?: string
  region?: string
  type?: string
  stage?: string
  q?: string
}

const stages: CityReviewStage[] = [
  "agent_draft",
  "ready_for_human",
  "correction_requested",
  "rejected",
  "published",
]

export default async function CityOperationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { adminSession } = await requireAdmin()
  const params = await searchParams
  const data = await loadCityOperationsData()
  const regionCityIds = params.region
    ? new Set(
        data.memberships
          .filter((membership) => membership.geoAreaId === params.region)
          .map((membership) => membership.cityId),
      )
    : undefined
  const records = filterCityReviewRecords(data.records, {
    city: params.city,
    regionCityIds,
    contentType: params.type,
    stage: params.stage,
    query: params.q,
  })
  const cities = Array.from(
    new Map(
      data.records.map((record) => [
        record.citySlug,
        { slug: record.citySlug, name: record.cityName },
      ]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, "de"))
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"
  const openCount = data.records.filter(
    (record) => !["published", "rejected", "archived"].includes(record.stage),
  ).length
  const blockingCount = data.records.filter((record) =>
    record.issues.some((issue) => issue.severity === "blocking"),
  ).length
  const readyCount = data.records.filter(
    (record) => record.stage === "ready_for_human",
  ).length

  return (
    <AdminShell
      adminName={adminName}
      title="Städte-Review"
      subtitle="Alle Städte, Agent-Prüfungen und Freigaben in einer Queue"
    >
      {data.warnings.map((warning) => (
        <div
          key={warning}
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
        >
          {warning}
        </div>
      ))}

      <section className="grid overflow-hidden rounded-3xl border border-[#061829]/10 bg-[#061829] text-white sm:grid-cols-3">
        <Metric label="Offene Prüfungen" value={openCount} />
        <Metric label="Bereit zur Prüfung" value={readyCount} />
        <Metric label="Blockierende Fehler" value={blockingCount} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_18px_50px_rgba(6,24,41,.06)]">
        <div className="border-b border-[#061829]/10 p-4 md:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
                Globale Arbeitsliste
              </p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.025em]">
                {records.length} Inhalte
              </h2>
            </div>
            <p className="text-sm text-[#617080]">
              Agenten erstellen Entwürfe – Menschen veröffentlichen.
            </p>
          </div>

          <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_repeat(4,minmax(9rem,.65fr))_auto]">
            <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
              Suche
              <input
                type="search"
                name="q"
                defaultValue={params.q}
                placeholder="Titel, Ort, Inhalt"
                className="h-11 rounded-xl border border-[#061829]/15 px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
              />
            </label>
            <FilterSelect name="city" label="Ort" value={params.city}>
              <option value="">Alle Orte</option>
              {cities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="region" label="Region" value={params.region}>
              <option value="">Alle Regionen</option>
              {data.geoAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="type" label="Inhalt" value={params.type}>
              <option value="">Alle Inhalte</option>
              {cityContentTypes.map((contentType) => (
                <option key={contentType} value={contentType}>
                  {contentTypeLabel(contentType)}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="stage" label="Status" value={params.stage}>
              <option value="">Alle Status</option>
              {stages.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabel(stage)}
                </option>
              ))}
            </FilterSelect>
            <button className="mt-auto h-11 rounded-xl bg-[#118cff] px-5 text-sm font-black text-white transition hover:bg-[#0878df] active:scale-[.98]">
              Filtern
            </button>
          </form>
        </div>

        {records.length > 0 ? (
          <div>
            {records.map((record) => (
              <ReviewQueueRow
                key={`${record.contentType}-${record.id}`}
                record={record}
              />
            ))}
          </div>
        ) : (
          <div className="px-5 py-16 text-center">
            <p className="text-lg font-black">Keine passenden Inhalte</p>
            <p className="mt-2 text-sm text-[#617080]">
              Filter zurücksetzen oder auf den nächsten Agent-Entwurf warten.
            </p>
          </div>
        )}
      </section>
    </AdminShell>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-white/10 px-5 py-5 sm:border-l sm:first:border-l-0">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-sm font-semibold text-white/65">{label}</p>
    </div>
  )
}

function FilterSelect({
  name,
  label,
  value,
  children,
}: {
  name: string
  label: string
  value?: string
  children: ReactNode
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="h-11 rounded-xl border border-[#061829]/15 bg-white px-3 text-sm text-[#061829] outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
      >
        {children}
      </select>
    </label>
  )
}
