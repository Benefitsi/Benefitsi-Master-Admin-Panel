import type { Metadata } from "next"
import Link from "next/link"
import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"
import {
  loadCityPagesData,
  type CityPageSummary,
} from "@/lib/city-pages/data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Städteseiten",
  description: "Zentrale Übersicht aller Benefitsi-Stadtportale.",
}

type SearchParams = {
  q?: string
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

export default async function CityPagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { adminSession } = await requireAdmin()
  const params = await searchParams
  const data = await loadCityPagesData()
  const query = params.q?.trim().toLocaleLowerCase("de") ?? ""
  const cities = data.cities.filter((city) =>
    query
      ? `${city.name} ${city.region ?? ""} ${city.slug}`
          .toLocaleLowerCase("de")
          .includes(query)
      : true,
  )
  const baseUrl = cityWebBaseUrl()
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  const openReviews = data.cities.reduce(
    (sum, city) => sum + city.openReviewCount,
    0,
  )
  const pendingCommunity = data.cities.reduce(
    (sum, city) => sum + city.pendingCommunityCount,
    0,
  )
  const subscribers = data.cities.reduce(
    (sum, city) => sum + city.confirmedSubscriberCount,
    0,
  )

  return (
    <AdminShell
      adminName={adminName}
      title="Städteseiten"
      subtitle="Alle Stadtportale, Inhalte und Arbeitsbereiche zentral verwalten"
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

      <section className="grid overflow-hidden rounded-3xl border border-[#061829]/10 bg-[#061829] text-white sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Stadtportale" value={data.cities.length} />
        <Metric label="Offene Prüfungen" value={openReviews} />
        <Metric label="Community-Review" value={pendingCommunity} />
        <Metric label="Newsletter-Abos" value={subscribers} />
      </section>

      <section className="rounded-3xl border border-[#061829]/10 bg-white p-4 shadow-[0_18px_50px_rgba(6,24,41,.05)] md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <form className="w-full max-w-xl">
            <label className="grid gap-1.5 text-xs font-bold text-[#526170]">
              Stadt oder Region suchen
              <div className="flex gap-2">
                <input
                  type="search"
                  name="q"
                  defaultValue={params.q}
                  placeholder="z. B. Annweiler oder Südliche Weinstraße"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-[#061829]/15 px-3 text-sm outline-none transition focus:border-[#118cff] focus:ring-3 focus:ring-[#118cff]/10"
                />
                <button className="h-11 rounded-xl bg-[#118cff] px-5 text-sm font-black text-white transition hover:bg-[#0878df]">
                  Suchen
                </button>
              </div>
            </label>
          </form>

          <div className="flex flex-wrap gap-2">
            <Link href="/city-operations" className={secondaryButton}>
              Globale Review-Queue
            </Link>
            <Link href="/automation" className={primaryButton}>
              Automation Control
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">
              Stadtverwaltung
            </p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.025em]">
              {cities.length} {cities.length === 1 ? "Stadt" : "Städte"}
            </h2>
          </div>
          {query ? (
            <Link href="/city-pages" className="text-sm font-bold text-[#118cff]">
              Suche zurücksetzen
            </Link>
          ) : null}
        </div>

        {cities.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {cities.map((city) => (
              <CityCard key={city.id} city={city} baseUrl={baseUrl} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-[#061829]/10 bg-white px-5 py-16 text-center">
            <p className="text-lg font-black">Keine Stadt gefunden</p>
            <p className="mt-2 text-sm text-[#617080]">
              Suche anpassen oder zurücksetzen.
            </p>
          </div>
        )}
      </section>
    </AdminShell>
  )
}

function CityCard({
  city,
  baseUrl,
}: {
  city: CityPageSummary
  baseUrl: string
}) {
  const publicUrl = `${baseUrl}/stadt/${city.slug}`

  return (
    <article className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_16px_40px_rgba(6,24,41,.045)]">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-2xl font-black tracking-[-0.035em]">
                {city.name}
              </h3>
              <StatusBadge ready={city.profileComplete} />
              {city.possibleDuplicate ? (
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-black text-rose-800">
                  Mögliche Dublette
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[#617080]">
              {city.region || "Noch keiner Region zugeordnet"} · /stadt/{city.slug}
            </p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e9f8f8] text-[#087f84]">
            <CityGlyph className="size-6" />
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SmallMetric label="Aktive Inhalte" value={city.activeContentCount} />
          <SmallMetric label="Offene Reviews" value={city.openReviewCount} />
          <SmallMetric label="Blocker" value={city.blockingIssueCount} alert />
          <SmallMetric label="Newsletter" value={city.confirmedSubscriberCount} />
        </div>

        {city.pendingCommunityCount > 0 ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
            {city.pendingCommunityCount} Community-
            {city.pendingCommunityCount === 1 ? "Eintrag wartet" : "Einträge warten"} auf Prüfung.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-[#061829]/10 bg-[#fafbf9] p-4">
        <a href={publicUrl} target="_blank" rel="noreferrer" className={primaryButton}>
          Seite öffnen
        </a>
        <Link href={`/city-pages/${encodeURIComponent(city.slug)}`} className={secondaryButton}>
          Stadt verwalten
        </Link>
        <Link
          href={`/city-operations?city=${encodeURIComponent(city.slug)}`}
          className={secondaryButton}
        >
          Reviews
        </Link>
        <Link
          href={`/automation?city=${encodeURIComponent(city.id)}`}
          className={secondaryButton}
        >
          Automationen
        </Link>
      </div>
    </article>
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

function SmallMetric({
  label,
  value,
  alert = false,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <div className="rounded-2xl bg-[#f3f6f7] px-3 py-3">
      <p className={`text-xl font-black ${alert && value > 0 ? "text-rose-600" : ""}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-bold leading-4 text-[#617080]">
        {label}
      </p>
    </div>
  )
}

function StatusBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
        ready
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-900"
      }`}
    >
      {ready ? "Seitenprofil vollständig" : "Seitenprofil ergänzen"}
    </span>
  )
}

function CityGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 20V9l5-4 4 3 3-2 4 3v11M8 20v-5h4v5m4-3h.01m0-4h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const primaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"

const secondaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-black text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"
