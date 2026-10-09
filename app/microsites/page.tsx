import Link from "next/link"
import { redirect } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData, type PartnerWithDeals } from "@/lib/admin-data"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { micrositeVersions } from "@/lib/microsite-workflow"

export const dynamic = "force-dynamic"

const publicWebBaseUrl = (
  process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() || "https://benefitsi.de"
).replace(/\/+$/, "")

export default async function MicrositesPage() {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    redirect("/login")
  }

  const supabase = await createClient()
  const adminSession = await getAdminSession(supabase)

  if (!adminSession?.isAdmin) {
    redirect("/login")
  }

  const dashboard = await getDashboardData(supabase)
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  const liveCount = dashboard.partners.filter(
    (partner) => micrositeVersions(partner.microsite).published,
  ).length
  const draftCount = dashboard.partners.filter(
    (partner) =>
      micrositeVersions(partner.microsite).draft &&
      !micrositeVersions(partner.microsite).published,
  ).length

  return (
    <AdminShell
      adminName={adminName}
      title="Mikroseiten"
      subtitle="Seiten bearbeiten, speichern und veröffentlichen"
      micrositeCount={dashboard.partners.length}
    >
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Partner" value={dashboard.partners.length} />
        <Metric label="Veröffentlichte Stände" value={liveCount} tone="green" />
        <Metric label="Nur Entwurf" value={draftCount} tone="blue" />
      </section>

      {dashboard.errors.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Supabase returned warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {dashboard.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[#061829]/10 bg-white shadow-[0_18px_48px_rgba(6,24,41,.05)]">
        <header className="border-b border-[#061829]/10 px-4 py-4 sm:px-5">
          <h2 className="text-base font-bold text-[#061829]">
            Mikroseiten der Partner
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Bearbeite deine Seite und speichere sie als Entwurf. Erst mit Veröffentlichen werden die Änderungen auf der Live-Seite sichtbar.
          </p>
        </header>

        <div className="divide-y divide-[#061829]/10">
          {dashboard.partners.map((partner) => (
            <MicrositeRow key={partner.id || partner.name} partner={partner} />
          ))}
        </div>
      </section>
    </AdminShell>
  )
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: number
  tone?: "neutral" | "green" | "blue"
}) {
  const toneClass = {
    neutral: "border-[#061829]/10 bg-white text-[#061829]",
    green: "border-[#17d4d7]/35 bg-[#effdfb] text-[#08777a]",
    blue: "border-[#118cff]/25 bg-[#f1f7ff] text-[#075fb8]",
  }[tone]

  return (
    <article className={`rounded-2xl border p-5 shadow-[0_12px_30px_rgba(6,24,41,.035)] ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </article>
  )
}

function MicrositeRow({ partner }: { partner: PartnerWithDeals }) {
  const identifier =
    partner.microsite?.slug ||
    partner.slug ||
    partner.subdomain ||
    partner.id ||
    "partner"
  const previewIdentifier = identifier
  const versions = micrositeVersions(partner.microsite)
  const liveHref =
    (versions.published
      ? `${publicWebBaseUrl}/partner/${encodeURIComponent(identifier)}`
      : null)
  const state = versions.published
    ? "Live"
    : versions.draft
      ? "Draft"
      : "Not created"

  return (
    <article className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eafcfc] text-sm font-black text-[#08777a]">
          {(partner.name || "P").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 data-admin-i18n-ignore={Boolean(partner.name)} className="truncate font-semibold text-[#061829]">
              {partner.name || "Unnamed partner"}
            </h3>
            <StatusBadge state={state} />
          </div>
          <p data-admin-i18n-ignore={Boolean(partner.city_name || partner.address)} className="mt-1 truncate text-sm text-zinc-500">
            {partner.city_name || partner.address || identifier}
          </p>
          {versions.editable ? <p className="mt-1 text-xs text-zinc-500">Gespeichert: Version {versions.editable.version_number ?? "–"}{versions.published ? ` · Online: Version ${versions.published.version_number ?? "–"}` : " · Noch nicht veröffentlicht"}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Link
          href={`/microsite-builder/${encodeURIComponent(identifier)}`}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#17d4d7_0%,#118cff_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(17,140,255,.18)] transition hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(17,140,255,.24)] active:translate-y-0 active:scale-[.98]"
        >
          Bearbeiten
        </Link>
        <Link
          href={`/microsite-preview/${encodeURIComponent(previewIdentifier)}?source=builder&mode=light`}
          target="_blank"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
        >
          Vorschau
        </Link>
        {liveHref ? (
          <a
            href={liveHref}
            target="_blank"
            rel="noreferrer"
            className="col-span-2 inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            Live-Seite · Version {versions.published?.version_number ?? "–"}
          </a>
        ) : null}
      </div>
    </article>
  )
}

function StatusBadge({ state }: { state: "Live" | "Draft" | "Not created" }) {
  const classes = {
    Live: "bg-emerald-100 text-emerald-800",
    Draft: "bg-blue-100 text-blue-800",
    "Not created": "bg-zinc-100 text-zinc-600",
  }[state]

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${classes}`}>
      {state === "Live" ? "Veröffentlichter Stand vorhanden" : state === "Draft" ? "Entwurf vorhanden" : "Noch nicht angelegt"}
    </span>
  )
}
