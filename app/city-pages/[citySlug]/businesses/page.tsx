import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Businesses im City-Portal",
  description: "Bestehende Partnerdaten, City-Darstellung und Microsite-Editoren öffnen.",
}

type SearchParams = { city?: string }

const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl border border-[#061829]/12 bg-white px-3 text-xs font-black text-[#061829] transition hover:border-[#118cff]/45 hover:bg-[#f3f8ff]"
const primaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#118cff] px-3 text-xs font-black text-white transition hover:bg-[#0878df]"

export default async function CityBusinessesPage({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params
  const { adminSession, supabase } = await requireAdmin()
  const cityResult = await supabase.from("cities").select("id,name,slug,region").eq("slug", citySlug).maybeSingle()
  if (cityResult.error || !cityResult.data) notFound()

  const partnerResult = await supabase
    .from("partners")
    .select("id,name,slug,status,updated_at")
    .eq("city_id", cityResult.data.id)
    .order("name")
  const partners = (partnerResult.data ?? []) as Array<{ id: string; name: string | null; slug: string | null; status: string | null; updated_at: string | null }>
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"
  const base = (process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() || "https://benefitsi.de").replace(/\/$/, "")

  return <AdminShell adminName={adminName} title={`Businesses · ${cityResult.data.name}`} subtitle="Bestehende Partnerdaten aus dem City CMS öffnen – ohne eine zweite Business-Datenwelt.">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={`/city-pages/${citySlug}`} className="text-sm font-black text-[#0b75d9]">← Zur City-Übersicht</Link>
      <Link href="/partner" className={secondaryButton}>Partnerverwaltung öffnen</Link>
    </div>
    <section className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white sm:p-6">
      <p className="text-xs font-black uppercase tracking-[.16em] text-[#17d4d7]">BUSINESS INTEGRATION</p>
      <h2 className="mt-2 text-2xl font-black tracking-[-.035em]">Partner bleiben im bestehenden Editor</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">Diese Übersicht verknüpft den bestehenden Partner-/Microsite-Editor mit der öffentlichen City-Darstellung. Es werden keine Partnerdaten dupliziert.</p>
    </section>
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#0b75d9]">{cityResult.data.name}</p><h2 className="mt-1 text-xl font-black">{partners.length} Businesses</h2></div></div>
      {partners.length ? <div className="grid gap-3">{partners.map((partner) => { const identifier = partner.slug || partner.id; const publicPath = `${base}/stadt/${encodeURIComponent(citySlug)}/essen-trinken/${encodeURIComponent(identifier)}`; return <article key={partner.id} className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_12px_35px_rgba(6,24,41,.04)]"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#eef8f8] px-2.5 py-1 text-[11px] font-black text-[#227174]">{partner.status || "unbekannt"}</span><span className="rounded-full bg-[#f3f6f7] px-2.5 py-1 text-[11px] font-black text-[#617080]">Bestehender Partnerdatensatz</span></div><h3 className="mt-3 text-xl font-black">{partner.name || "Ohne Namen"}</h3><p className="mt-1 text-xs font-semibold text-[#71808b]">/{identifier}{partner.updated_at ? ` · aktualisiert ${formatDate(partner.updated_at)}` : ""}</p></div><div className="flex flex-wrap gap-2"><a href={publicPath} target="_blank" rel="noreferrer" className={primaryButton}>City-Seite öffnen</a><Link href={`/partner/microsite-builder/${encodeURIComponent(identifier)}`} className={secondaryButton}>Microsite bearbeiten</Link><Link href={`/partner/microsite-preview/${encodeURIComponent(identifier)}?source=city-editor`} target="_blank" className={secondaryButton}>Microsite-Vorschau</Link></div></div></article>})}</div> : <div className="rounded-3xl border border-dashed border-[#061829]/15 bg-white p-10 text-center"><p className="font-black">Noch keine Businesses zugeordnet</p><p className="mt-2 text-sm text-[#617080]">Die bestehende Partnerverwaltung kann die Zuordnung ergänzen.</p></div>}
    </section>
  </AdminShell>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date)
}
