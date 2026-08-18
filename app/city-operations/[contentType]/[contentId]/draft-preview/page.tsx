import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"
import {
  contentTypeLabel,
  isCityContentType,
} from "@/lib/city-operations/contracts"
import { loadCityReviewDetail } from "@/lib/city-operations/data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Entwurfsvorschau | Benefitsi Städte-Review",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export default async function CityDraftPreviewPage({
  params,
}: {
  params: Promise<{ contentType: string; contentId: string }>
}) {
  const { adminSession } = await requireAdmin()
  const route = await params
  if (!isCityContentType(route.contentType)) notFound()

  const detail = await loadCityReviewDetail(route.contentType, route.contentId)
  if (!detail.record) notFound()

  const record = detail.record
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell
      adminName={adminName}
      title={`Entwurf: ${record.title}`}
      subtitle={`${record.cityName} · ${contentTypeLabel(record.contentType)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/city-operations/${record.contentType}/${record.id}`}
          className="inline-flex min-h-11 items-center text-sm font-black text-[#0b75d9] hover:underline"
        >
          ← Zur Review
        </Link>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-900">
          Nur Admin · noindex
        </span>
      </div>

      <article className="overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_18px_50px_rgba(6,24,41,.06)]">
        <header className="border-b border-[#061829]/10 bg-[#061829] px-5 py-8 text-white sm:px-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#17d4d7]">
            Entwurfsvorschau
          </p>
          <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-[-0.04em] sm:text-5xl">
            {record.title}
          </h1>
          <p className="mt-3 text-sm font-semibold text-white/65">
            Diese Darstellung ist geschützt und nicht Teil der öffentlichen Indexierung.
          </p>
        </header>

        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <p className="whitespace-pre-line text-base leading-8 text-[#334454]">
              {record.description}
            </p>
            <div className="mt-8 rounded-2xl border border-[#118cff]/15 bg-[#f3f8ff] p-4">
              <p className="text-sm font-black text-[#061829]">Vor Veröffentlichung prüfen</p>
              <p className="mt-1 text-sm leading-6 text-[#526170]">
                Vergleiche diesen Entwurf mit der veröffentlichten Version und entscheide anschließend im Review.
              </p>
            </div>
          </div>

          <dl className="divide-y divide-[#061829]/10 border-y border-[#061829]/10 text-sm">
            <PreviewDatum label="Status" value={record.contentStatus} />
            <PreviewDatum label="Review" value={record.stage} />
            <PreviewDatum label="Geänderte Felder" value={record.changedFields.join(", ") || "—"} />
            <PreviewDatum label="Quelle" value={record.sourceStatus} />
          </dl>
        </div>
      </article>
    </AdminShell>
  )
}

function PreviewDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-xs font-bold text-[#617080]">{label}</dt>
      <dd className="mt-1 font-black text-[#061829]">{value || "—"}</dd>
    </div>
  )
}
