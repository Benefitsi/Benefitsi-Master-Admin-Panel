import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"
import { loadEditorialWorkspace } from "@/lib/editorial"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "City Editorial",
  description: "Bestehende redaktionelle Beiträge eines City-Portals öffnen und bearbeiten.",
}

const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl border border-[#061829]/12 bg-white px-3 text-xs font-black text-[#061829] transition hover:border-[#118cff]/45 hover:bg-[#f3f8ff]"
const primaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#118cff] px-3 text-xs font-black text-white transition hover:bg-[#0878df]"

export default async function CityEditorialPage({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params
  const { adminSession } = await requireAdmin()
  const workspace = await loadEditorialWorkspace()
  const city = workspace.cities.find((item) => item.slug === citySlug)
  if (!city) notFound()
  const posts = workspace.posts.filter((post) => post.scope === "city" && post.city_id === city.id)
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"
  const base = (process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() || "https://benefitsi.de").replace(/\/$/, "")

  return <AdminShell adminName={adminName} title={`Editorial · ${city.name}`} subtitle="Bestehenden Editorial Editor aus dem City CMS erreichen – ohne doppelte Content-Verwaltung.">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/city-pages/${citySlug}`} className="text-sm font-black text-[#0b75d9]">← Zur City-Übersicht</Link><Link href="/editorial" className={secondaryButton}>Editorial-Hauptbereich öffnen</Link></div>
    <section className="rounded-3xl border border-[#061829]/10 bg-[#061829] p-5 text-white sm:p-6"><p className="text-xs font-black uppercase tracking-[.16em] text-[#17d4d7]">EDITORIAL INTEGRATION</p><h2 className="mt-2 text-2xl font-black tracking-[-.035em]">Beiträge bleiben im bestehenden Editorial Editor</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">Hier werden nur Stadtbeiträge gefiltert und verknüpft. Bearbeitung, Status und Audit bleiben im bestehenden Editorial-System.</p></section>
    {workspace.warnings.map((warning) => <p key={warning} role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">{warning}</p>)}
    <section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#0b75d9]">{city.name}</p><h2 className="mt-1 text-xl font-black">{posts.length} Stadtbeiträge</h2></div><Link href="/editorial/new" className={secondaryButton}>Neuen Beitrag im Editorial Editor anlegen</Link></div>{posts.length ? <div className="grid gap-3">{posts.map((post) => <article key={post.id} className="rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_12px_35px_rgba(6,24,41,.04)]"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={post.status} /><span className="rounded-full bg-[#f3f6f7] px-2.5 py-1 text-[11px] font-black text-[#617080]">/blog/{post.slug}</span></div><h3 className="mt-3 text-xl font-black">{post.title}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-[#617080]">{post.excerpt}</p></div><div className="flex flex-wrap gap-2"><a href={`${base}/stadt/${encodeURIComponent(city.slug)}/blog/${encodeURIComponent(post.slug)}`} target="_blank" rel="noreferrer" className={secondaryButton}>Public Preview</a><Link href={`/editorial/${post.id}`} className={primaryButton}>Bestehenden Editor öffnen</Link></div></div></article>)}</div> : <div className="rounded-3xl border border-dashed border-[#061829]/15 bg-white p-10 text-center"><p className="font-black">Noch keine Stadtbeiträge</p><p className="mt-2 text-sm text-[#617080]">Erstelle einen Beitrag im bestehenden Editorial Editor und ordne ihn dort dieser Stadt zu.</p><Link href="/editorial/new" className={`${secondaryButton} mt-5`}>Editorial öffnen</Link></div>}</section>
  </AdminShell>
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { active: "Aktiv", needs_review: "Prüfung", draft: "Entwurf", archived: "Archiv" }
  return <span className="rounded-full bg-[#eef8f8] px-2.5 py-1 text-[11px] font-black text-[#227174]">{labels[status] || status}</span>
}
