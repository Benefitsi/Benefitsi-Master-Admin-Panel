import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode, SVGProps } from "react"
import { AdminShell } from "@/app/admin-shell"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData } from "@/lib/admin-data"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function SystemPage() {
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
  const appUrl = process.env.NEXT_PUBLIC_BENEFITSI_APP_URL?.trim() || ""
  const cityUrl =
    process.env.NEXT_PUBLIC_BENEFITSI_CITY_URL?.trim() ||
    "https://benefitsi.de/stadt/annweiler"
  const websiteUrl =
    process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() || "https://benefitsi.de"

  return (
    <AdminShell
      adminName={adminName}
      title="Systemübersicht"
      subtitle="Die zentralen Benefitsi-Oberflächen an einem Ort"
      micrositeCount={dashboard.partners.length}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="Benefitsi App"
          description="Mobile Nutzer-App für Deals, Stempel, Rewards und Challenges."
          href={appUrl || undefined}
          status={appUrl ? "Verknüpft" : "App-Link folgt"}
          icon={
            <Image
              src="/Benefitsi_Icon_FullColor_RGB_512.png"
              alt=""
              width={46}
              height={46}
            />
          }
          external={Boolean(appUrl)}
        />
        <OverviewCard
          title="Microsites"
          description="Builder, Entwürfe, Vorschauen und veröffentlichte Partnerseiten."
          href="/microsites"
          status={`${dashboard.partners.length} Partner`}
          accent="blue"
          icon={<BrowserIcon className="size-7" />}
        />
        <OverviewCard
          title="Städteseiten"
          description="Städte, lokale Guides, Kategorien und regionale Inhalte."
          href={cityUrl}
          status="Öffentlich"
          accent="cyan"
          icon={<MapIcon className="size-7" />}
          external
        />
        <OverviewCard
          title="Benefitsi Webseite"
          description="Öffentliche Hauptseite und Partnergewinnung."
          href={websiteUrl}
          status="Öffentlich"
          accent="blue"
          icon={<GlobeIcon className="size-7" />}
          external
        />
      </section>

      <section className="rounded-2xl border border-[#061829]/10 bg-white p-5 shadow-[0_18px_48px_rgba(6,24,41,.05)]">
        <h2 className="text-base font-bold text-[#061829]">Systemzuständigkeit</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Responsibility
            title="Benefitsi App"
            text="Mobile App, Nutzerkonto, Deals, Stempel, Rewards und Scanning."
          />
          <Responsibility
            title="Benefitsi Admin"
            text="Partnerdaten, Builder, Draft, Preview, Publish und Partnerportal."
          />
          <Responsibility
            title="Benefitsi Web"
            text="Hauptwebseite, Partnergewinnung, Städte- und SEO-Seiten."
          />
        </div>
      </section>

      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
      >
        Zur Partnerverwaltung
      </Link>
    </AdminShell>
  )
}

function OverviewCard({
  title,
  description,
  href,
  status,
  icon,
  external = false,
  accent = "neutral",
}: {
  title: string
  description: string
  href?: string
  status: string
  icon: ReactNode
  external?: boolean
  accent?: "neutral" | "blue" | "cyan"
}) {
  const iconClass = {
    neutral: "bg-zinc-100 text-[#061829]",
    blue: "bg-blue-50 text-[#118cff]",
    cyan: "bg-cyan-50 text-[#17bfc5]",
  }[accent]
  const body = (
    <>
      <span className={`grid size-12 place-items-center rounded-xl ${iconClass}`}>
        {icon}
      </span>
      <h2 className="mt-4 text-lg font-bold text-[#061829]">{title}</h2>
      <p className="mt-2 min-h-16 text-sm leading-6 text-zinc-500">
        {description}
      </p>
      <span className="mt-4 inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
        {status}
      </span>
    </>
  )
  const className =
    "rounded-2xl border border-zinc-200 bg-white p-5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"

  if (!href) {
    return <article className={`${className} opacity-75`}>{body}</article>
  }

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${className} hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm`}
      >
        {body}
      </a>
    )
  }

  return (
    <Link
      href={href}
      className={`${className} hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm`}
    >
      {body}
    </Link>
  )
}

function Responsibility({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="font-semibold text-[#061829]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>
    </article>
  )
}

function BrowserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="5" width="21" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 10h21" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="7" cy="7.5" r=".8" fill="currentColor" />
      <circle cx="10" cy="7.5" r=".8" fill="currentColor" />
    </svg>
  )
}

function MapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" {...props}>
      <path d="m3 8 7-3 8 3 7-3v15l-7 3-8-3-7 3V8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 5v15M18 8v15" stroke="currentColor" strokeWidth="1.7" />
      <path d="M17 9.5c0 2.3-3 5.5-3 5.5s-3-3.2-3-5.5a3 3 0 1 1 6 0Z" fill="white" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="9.5" r=".8" fill="currentColor" />
    </svg>
  )
}

function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" {...props}>
      <circle cx="14" cy="14" r="10.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 14h21M14 3.5c3 3 4.3 6.6 4.3 10.5S17 21.5 14 24.5c-3-3-4.3-6.6-4.3-10.5S11 6.5 14 3.5Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
