import type { Metadata } from "next"
import Link from "next/link"
import { AdminShell } from "@/app/admin-shell"
import { archiveEditorialPost } from "@/app/editorial/actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import { loadEditorialWorkspace } from "@/lib/editorial"
import type { EditorialPost } from "@/lib/editorial-types"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Editorial & Magazin",
  description: "SEO-Beiträge für Benefitsi, Stadtportale und Partner verwalten.",
}

type SearchParams = { success?: string; error?: string }

const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#118cff] px-4 text-sm font-black text-white transition hover:bg-[#0878df]"
const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-black text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff]"

export default async function EditorialPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { adminSession } = await requireAdmin()
  const params = await searchParams
  const data = await loadEditorialWorkspace()
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"
  const counts = {
    total: data.posts.length,
    active: data.posts.filter((post) => post.status === "active").length,
    review: data.posts.filter((post) => post.status === "needs_review").length,
    drafts: data.posts.filter((post) => post.status === "draft").length,
  }
  const cities = new Map(data.cities.map((city) => [city.id, city]))
  const partners = new Map(data.partners.map((partner) => [partner.id, partner]))

  return (
    <AdminShell adminName={adminName} title="Editorial & Magazin" subtitle="Ein Inhaltssystem für Benefitsi, Städteseiten und Partnerbeiträge">
      {params.success ? <SuccessMessage code={params.success} /> : null}
      {params.error ? <ErrorMessage code={params.error} /> : null}
      {data.warnings.map((warning) => <Warning key={warning}>{warning}</Warning>)}

      <section className="grid overflow-hidden rounded-3xl border border-[#061829]/10 bg-[#061829] text-white sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Beiträge gesamt" value={counts.total} />
        <Metric label="Aktiv öffentlich" value={counts.active} />
        <Metric label="Zur Prüfung" value={counts.review} />
        <Metric label="Entwürfe" value={counts.drafts} />
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,24,41,.05)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Content-System</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Ein Beitrag, mehrere lokale Ausspielwege</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617080]">Status, Zielgruppe und Zuordnung bleiben an einer Stelle nachvollziehbar. Nur aktive Beiträge mit Veröffentlichungsdatum werden auf der Website angezeigt.</p>
        </div>
        <Link href="/editorial/new" className={`${primaryButton} shrink-0`}>+ Neuer Beitrag</Link>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0b75d9]">Redaktionsliste</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.025em]">Alle Beiträge</h2>
          </div>
          <span className="text-sm font-semibold text-[#617080]">{data.posts.length} Einträge</span>
        </div>

        {data.posts.length ? (
          <div className="grid gap-3">
            {data.posts.map((post) => <EditorialCard key={post.id} post={post} city={post.city_id ? cities.get(post.city_id) : undefined} partner={post.partner_id ? partners.get(post.partner_id) : undefined} />)}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-[#061829]/20 bg-white px-5 py-16 text-center">
            <p className="text-lg font-black">Noch keine redaktionellen Beiträge</p>
            <p className="mt-2 text-sm text-[#617080]">Lege den ersten Beitrag für das Benefitsi Magazin oder ein Stadtportal an.</p>
            <Link href="/editorial/new" className={`${primaryButton} mt-5`}>Ersten Beitrag anlegen</Link>
          </div>
        )}
      </section>
    </AdminShell>
  )
}

function EditorialCard({ post, city, partner }: { post: EditorialPost; city?: { name: string; slug: string }; partner?: { name: string; slug: string } }) {
  const target = post.scope === "global" ? "Benefitsi Magazin" : post.scope === "city" ? `Stadt · ${city?.name ?? "nicht zugeordnet"}` : `Partner · ${partner?.name ?? "nicht zugeordnet"}`
  const previewPath = post.scope === "global" ? `/blog/${post.slug}` : post.scope === "city" && city ? `/stadt/${city.slug}/blog/${post.slug}` : null

  return (
    <article className="rounded-3xl border border-[#061829]/10 bg-white p-4 shadow-[0_12px_35px_rgba(6,24,41,.04)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />
            <span className="rounded-full bg-[#eef8f8] px-2.5 py-1 text-[11px] font-black text-[#227174]">{target}</span>
            <span className="rounded-full bg-[#f3f6f7] px-2.5 py-1 text-[11px] font-black text-[#617080]">{post.audience === "partner" ? "Für Partner" : "Für Benefitsi"}</span>
          </div>
          <h3 className="mt-3 text-xl font-black tracking-[-0.03em]">{post.title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#617080]">{post.excerpt}</p>
          <p className="mt-3 text-xs font-bold text-[#8995a0]">/{post.slug} · aktualisiert {formatDate(post.updated_at)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/editorial/${post.id}`} className={secondaryButton}>Bearbeiten</Link>
          {previewPath ? <a href={publicUrl(previewPath)} target="_blank" rel="noreferrer" className={secondaryButton}>Öffnen</a> : null}
          {post.status !== "archived" ? <form action={archiveEditorialPost}><input type="hidden" name="postId" value={post.id} /><PendingSubmitButton pendingLabel="Archiviert…" className="min-h-11 rounded-xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 transition hover:bg-rose-50">Archivieren</PendingSubmitButton></form> : null}
        </div>
      </div>
    </article>
  )
}

function publicUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() || "https://benefitsi.de"
  return `${base.replace(/\/$/, "")}${path}`
}

function formatDate(value: string) {
  if (!value) return "–"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date)
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border-white/10 px-5 py-5 sm:border-l sm:first:border-l-0"><p className="text-3xl font-black tracking-[-0.04em]">{value}</p><p className="mt-1 text-sm font-semibold text-white/65">{label}</p></div>
}

function StatusBadge({ status }: { status: EditorialPost["status"] }) {
  const config = {
    active: ["Aktiv", "bg-emerald-100 text-emerald-800"],
    needs_review: ["Prüfung", "bg-amber-100 text-amber-900"],
    draft: ["Entwurf", "bg-slate-100 text-slate-700"],
    archived: ["Archiv", "bg-rose-100 text-rose-800"],
  } as const
  const [label, className] = config[status]
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${className}`}>{label}</span>
}

function SuccessMessage({ code }: { code: string }) {
  const message = code === "created" ? "Beitrag angelegt." : code === "archived" ? "Beitrag archiviert." : "Beitrag gespeichert."
  return <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{message}</div>
}

function ErrorMessage({ code }: { code: string }) {
  const message = code === "archive" ? "Der Beitrag konnte nicht archiviert werden." : "Der Vorgang konnte nicht abgeschlossen werden."
  return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{message}</div>
}

function Warning({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">{children}</div>
}
