import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { CityMemoryStampManager } from "@/components/city-memory/memory-stamp-manager"
import { requireAdmin } from "@/lib/admin"
import { getCityMemoryAdminConfig } from "@/lib/city-memory/config"
import { loadCityMediaLibraryData } from "@/lib/city-media/data"
import { loadCityPageDetail } from "@/lib/city-pages/data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Memory Stamps verwalten",
  description: "Memory-Stamp-Bilder einer Stadt verwalten, prüfen und veröffentlichen.",
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

export default async function CityMemoryStampsPage({
  params,
}: {
  params: Promise<{ citySlug: string }>
}) {
  const { citySlug } = await params
  const { adminSession } = await requireAdmin()
  const [detail, mediaData] = await Promise.all([
    loadCityPageDetail(citySlug),
    loadCityMediaLibraryData(),
  ])

  if (!detail.city) notFound()

  const city = detail.city
  const memoryConfig = getCityMemoryAdminConfig(city.slug)
  const initialSlots = memoryConfig.slots.map((slot) => {
    const asset = mediaData.assets.find((candidate) =>
      candidate.cityId === city.id && candidate.assignments.some((assignment) =>
        assignment.cityId === city.id &&
        assignment.entityType === "COLLECTION" &&
        assignment.entityKey === slot.id &&
        assignment.role === "MEMORY_STAMP_ARTWORK",
      ),
    ) ?? null
    const assignment = asset?.assignments.find((candidate) =>
      candidate.cityId === city.id &&
      candidate.entityType === "COLLECTION" &&
      candidate.entityKey === slot.id &&
      candidate.role === "MEMORY_STAMP_ARTWORK",
    ) ?? null

    return { ...slot, asset, assignment }
  })
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"
  const publicUrl = `${cityWebBaseUrl()}/stadt/${city.slug}/memories`

  return (
    <AdminShell
      adminName={adminName}
      title={`${city.name} · Memory Stamps`}
      subtitle="Bilder und Freigaben innerhalb der Städeseite verwalten"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/city-pages/${city.slug}`}
          className="inline-flex items-center text-sm font-black text-[#0b75d9] transition hover:text-[#075eae]"
        >
          <BackIcon className="mr-1.5 size-4" />
          Zur Städeseite
        </Link>
        <div className="flex flex-wrap gap-2">
          <a href={publicUrl} target="_blank" rel="noreferrer" className={secondaryButton}>
            Öffentliche Memory-Seite ↗
          </a>
          <Link href={`/media?city=${encodeURIComponent(city.slug)}&entityType=COLLECTION&role=MEMORY_STAMP_ARTWORK`} className={secondaryButton}>
            In Media Library öffnen
          </Link>
        </div>
      </div>

      <header className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white shadow-[0_18px_50px_rgba(6,24,41,.1)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#17d4d7]">Städteseite · Memory Collection</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">{memoryConfig.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{memoryConfig.description} Jedes Bild wird als manuelles City-Media-Asset gespeichert und erst nach Prüfung öffentlich verwendet.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[30rem]">
            <Stat label="Slots" value={String(memoryConfig.slots.length)} />
            <Stat label="Mit Bild" value={String(initialSlots.filter((slot) => slot.asset).length)} />
            <Stat label="Veröffentlicht" value={String(initialSlots.filter((slot) => slot.asset?.status === "PUBLISHED").length)} />
            <Stat label="Bald verfügbar" value={String(initialSlots.filter((slot) => slot.status === "PENDING_PLACE_RELATION").length)} />
          </div>
        </div>
      </header>

      {memoryConfig.slots.length ? (
        <CityMemoryStampManager
          cityId={city.id}
          cityName={city.name}
          citySlug={city.slug}
          initialSlots={initialSlots}
        />
      ) : (
        <section className="rounded-3xl border border-dashed border-[#061829]/20 bg-white p-8 text-center">
          <p className="text-lg font-black">Für diese Stadt sind noch keine Memory-Slots konfiguriert.</p>
          <p className="mt-2 text-sm text-[#617080]">Die Oberfläche ist generisch vorbereitet. Ergänze zuerst die City-Collection-Konfiguration.</p>
        </section>
      )}
    </AdminShell>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 px-3 py-3">
      <p className="text-2xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-[11px] font-bold text-white/60">{label}</p>
    </div>
  )
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M16 10H4m4-4-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-black text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff] active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"
