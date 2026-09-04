"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from "react"
import { signOut } from "./actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { BrandLogo } from "@/components/brand-logo"
import {
  AdminLanguageControl,
  AdminLanguageProvider,
} from "./admin-language"

type AdminShellProps = {
  adminName: string
  title?: string
  subtitle?: string
  micrositeCount?: number
  children: ReactNode
}

export function AdminShell(props: AdminShellProps) {
  return (
    <AdminLanguageProvider>
      <AdminShellContent {...props} />
    </AdminLanguageProvider>
  )
}

function AdminShellContent({
  adminName,
  title = "Partner management",
  subtitle = "All partners and their information",
  micrositeCount,
  children,
}: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(true)
  const pathname = usePathname()

  return (
    <main className="min-h-screen bg-[#f7f6f1] text-[#061829]">
      <div
        className={`grid min-h-screen transition-[grid-template-columns] duration-200 ${
          collapsed
            ? "lg:grid-cols-[72px_minmax(0,1fr)]"
            : "lg:grid-cols-[244px_minmax(0,1fr)]"
        }`}
      >
        <aside
          className={`border-b border-white/10 bg-[#061829] py-4 text-white transition-[padding] duration-200 lg:sticky lg:top-0 lg:h-[100dvh] lg:border-b-0 lg:border-r ${
            collapsed ? "lg:px-3" : "lg:px-4"
          }`}
        >
          <div
            className={`flex items-center justify-between gap-3 ${
              collapsed ? "lg:flex-col" : ""
            }`}
          >
            <div className="flex min-w-0 items-center">
              <div className={`${collapsed ? "hidden lg:grid" : "hidden"} size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/10`}>
                <Image
                  src="/Benefitsi_Icon_FullColor_RGB_512.png"
                  alt=""
                  width={34}
                  height={34}
                />
              </div>
              <BrandLogo
                surface="dark"
                priority
                className={`${collapsed ? "lg:hidden" : ""} h-auto w-[158px] sm:w-[175px]`}
              />
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
              className="hidden size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 text-white/75 transition hover:border-[#17d4d7]/60 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17d4d7] lg:grid"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className={`size-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
              >
                <path
                  d="m12.5 5-5 5 5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <nav aria-label="Admin navigation" className="mt-4 space-y-1 lg:mt-8">
            <AdminNavigationLink
              href="/#partners"
              label="Partner"
              active={pathname === "/"}
              collapsed={collapsed}
              icon={<PartnerIcon className="size-5" />}
            />
            <CityNavigationGroup pathname={pathname} collapsed={collapsed} />
            <AdminNavigationLink
              href="/bookings"
              label="Booking Control"
              active={pathname.startsWith("/bookings")}
              collapsed={collapsed}
              icon={<BookingIcon className="size-5" />}
            />
            <AdminNavigationLink
              href="/analytics"
              label="Business Control Center"
              active={pathname.startsWith("/analytics")}
              collapsed={collapsed}
              icon={<AnalyticsIcon className="size-5" />}
            />
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex flex-col gap-4 border-b border-[#061829]/10 bg-[#f7f6f1]/95 px-4 py-5 backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:px-7 lg:py-6">
            <div className="min-w-0">
              <h1 className="truncate text-[1.7rem] font-black tracking-[-0.035em] text-[#061829]">
                {title}
              </h1>
              <p className="mt-1 truncate text-sm text-[#526170]">{subtitle}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <AdminLanguageControl className="self-start sm:self-auto" />
              <SystemSwitcher micrositeCount={micrositeCount} />
              <p className="max-w-full truncate text-sm font-medium text-[#526170]">
                {adminName}
              </p>
              <form action={signOut}>
                <PendingSubmitButton
                  pendingLabel="Signing out..."
                  className="h-10 w-full rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-bold text-[#061829] transition hover:border-[#118cff]/40 hover:bg-[#f3f8ff] active:scale-[.98] sm:w-auto"
                >
                  Sign out
                </PendingSubmitButton>
              </form>
            </div>
          </header>

          <div className="space-y-5 px-4 py-5 lg:px-7 lg:py-6">{children}</div>
        </section>
      </div>
    </main>
  )
}

function AdminNavigationLink({
  href,
  label,
  active,
  collapsed,
  icon,
}: {
  href: string
  label: string
  active: boolean
  collapsed: boolean
  icon: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl border text-sm font-bold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17d4d7] ${
        collapsed ? "justify-center px-2" : "px-3"
      } ${
        active
          ? "border-[#17d4d7]/20 bg-[#118cff]/22 shadow-[inset_3px_0_0_#17d4d7] hover:bg-[#118cff]/30"
          : "border-transparent text-white/72 hover:border-white/10 hover:bg-white/8 hover:text-white"
      }`}
    >
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      <span className={collapsed ? "lg:sr-only" : "truncate"}>{label}</span>
    </Link>
  )
}

type CityNavigationItem = {
  href: string
  label: string
  active: boolean
}

function CityNavigationGroup({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const citySlug = pathname.match(/^\/city-pages\/([^/]+)/)?.[1]
  const cityBase = citySlug ? `/city-pages/${citySlug}` : "/city-pages"
  const cityAreaActive = pathname === "/city-pages"
    || pathname.startsWith("/city-pages/")
    || pathname.startsWith("/media")
    || pathname.startsWith("/city-operations")
    || pathname.startsWith("/editorial")
  const [open, setOpen] = useState(cityAreaActive)

  const items: CityNavigationItem[] = citySlug
    ? [
        { href: cityBase, label: "City-Übersicht", active: pathname === cityBase },
        { href: `${cityBase}/site/homepage`, label: "Homepage", active: pathname.startsWith(`${cityBase}/site/homepage`) },
        { href: `${cityBase}/site/hubs?key=discovery`, label: "Hubs", active: pathname.startsWith(`${cityBase}/site/hubs`) },
        { href: `${cityBase}/site/collections?key=sehenswuerdigkeiten`, label: "Collections", active: pathname.startsWith(`${cityBase}/site/collections`) },
        { href: `${cityBase}/memory-stamps`, label: "Memory Stamps", active: pathname.startsWith(`${cityBase}/memory-stamps`) },
        { href: `${cityBase}/site/navigation`, label: "Navigation", active: pathname.startsWith(`${cityBase}/site/navigation`) },
        { href: `${cityBase}/businesses`, label: "Businesses", active: pathname.startsWith(`${cityBase}/businesses`) },
        { href: `${cityBase}/editorial`, label: "Editorial & Blog", active: pathname.startsWith(`${cityBase}/editorial`) },
        { href: `${cityBase}/community`, label: "Community", active: pathname.startsWith(`${cityBase}/community`) },
        { href: `${cityBase}/newsletter`, label: "Newsletter", active: pathname.startsWith(`${cityBase}/newsletter`) },
        { href: "/automation", label: "Agent Control", active: pathname.startsWith("/automation") },
        { href: `/media?city=${encodeURIComponent(citySlug)}`, label: "Media Library", active: pathname.startsWith("/media") },
        { href: "/city-operations", label: "Review & Quellen", active: pathname.startsWith("/city-operations") },
      ]
    : [
        { href: "/city-pages", label: "Alle Städte", active: pathname === "/city-pages" },
        { href: "/media", label: "Media Library", active: pathname.startsWith("/media") },
        { href: "/city-operations", label: "Review & Quellen", active: pathname.startsWith("/city-operations") },
        { href: "/editorial", label: "Editorial & Blog", active: pathname.startsWith("/editorial") },
        { href: "/automation", label: "Agent Control", active: pathname.startsWith("/automation") },
      ]

  return (
    <div>
      <div className="flex items-stretch gap-1">
        <div className="min-w-0 flex-1">
          <AdminNavigationLink
            href="/city-pages"
            label="Städteseiten"
            active={cityAreaActive}
            collapsed={collapsed}
            icon={<CityPagesIcon className="size-5" />}
          />
        </div>
        {!collapsed ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-label={open ? "Städteseiten-Unterpunkte schließen" : "Städteseiten-Unterpunkte öffnen"}
            aria-expanded={open}
            className="grid min-h-11 w-9 shrink-0 place-items-center rounded-xl border border-transparent text-white/60 transition hover:border-white/10 hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17d4d7]"
          >
            <ChevronIcon className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        ) : null}
      </div>
      <div className={`${open ? "" : "hidden"} ${collapsed ? "lg:hidden" : ""} ml-3 mt-1 space-y-0.5 border-l border-white/12 pl-3`}>
        {items.map((item) => <AdminSubNavigationLink key={item.href} {...item} />)}
      </div>
    </div>
  )
}

function AdminSubNavigationLink({ href, label, active }: CityNavigationItem) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17d4d7] ${active ? "bg-[#118cff]/18 text-white" : "text-white/58 hover:bg-white/8 hover:text-white"}`}
    >
      <span className="truncate">{label}</span>
    </Link>
  )
}

function SystemSwitcher({ micrositeCount }: { micrositeCount?: number }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const appUrl = process.env.NEXT_PUBLIC_BENEFITSI_APP_URL?.trim() || ""
  const websiteUrl =
    process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() || "https://benefitsi.de"

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (
        wrapperRef.current &&
        event.target instanceof Node &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [])

  return (
    <div ref={wrapperRef} className="relative self-start sm:self-auto">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Open Benefitsi systems"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="benefitsi-system-switcher"
        title="Benefitsi-Systeme"
        className={`grid size-10 place-items-center rounded-xl border bg-white text-[#061829] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff] ${
          open
            ? "border-[#118cff] bg-[#f3f8ff] shadow-[0_0_0_3px_rgba(17,140,255,.12)]"
            : "border-zinc-200 hover:border-[#118cff] hover:bg-[#f3f8ff]"
        }`}
      >
        <GridIcon className="size-5" />
      </button>

      {open ? (
        <section
          id="benefitsi-system-switcher"
          role="dialog"
          aria-label="Benefitsi-Systeme"
          className="absolute left-0 top-[calc(100%+0.75rem)] z-50 w-[min(23.5rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_22px_60px_rgba(6,24,41,.16)] sm:left-auto sm:right-0"
        >
          <header>
            <h2 className="text-lg font-bold tracking-tight text-[#061829]">
              Benefitsi-Systeme
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Schnell zwischen den Bereichen wechseln
            </p>
          </header>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {appUrl ? (
              <SystemCard
                href={appUrl}
                external
                icon={
                  <Image
                    src="/Benefitsi_Icon_FullColor_RGB_512.png"
                    alt=""
                    width={42}
                    height={42}
                    className="size-10"
                  />
                }
                title="Benefitsi App"
                description="Mobile Nutzer-App"
              />
            ) : (
              <SystemCard
                disabled
                icon={
                  <Image
                    src="/Benefitsi_Icon_FullColor_RGB_512.png"
                    alt=""
                    width={42}
                    height={42}
                    className="size-10"
                  />
                }
                title="Benefitsi App"
                description="Mobile Nutzer-App"
                meta="App-Link folgt"
              />
            )}

            <SystemCard
              href="/microsites"
              icon={<BrowserIcon className="size-10 text-[#118cff]" />}
              title="Microsites"
              description="Builder, Entwürfe & Live-Seiten"
              meta={
                typeof micrositeCount === "number"
                  ? `${micrositeCount} Partner`
                  : undefined
              }
              highlighted
              onNavigate={() => setOpen(false)}
            />

            <SystemCard
              href="/city-pages"
              icon={<MapIcon className="size-10 text-[#17bfc5]" />}
              title="Städteseiten"
              description="Städte, Inhalte & Status"
              onNavigate={() => setOpen(false)}
            />

            <SystemCard
              href={websiteUrl}
              external
              icon={<GlobeIcon className="size-10 text-[#118cff]" />}
              title="Benefitsi Webseite"
              description="Öffentliche Hauptseite"
            />
          </div>

          <Link
            href="/system"
            onClick={() => setOpen(false)}
            className="mt-3 flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-[#118cff] transition hover:bg-[#f3f8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff]"
          >
            Systemübersicht verwalten
            <ArrowRightIcon className="ml-2 size-4" />
          </Link>
        </section>
      ) : null}
    </div>
  )
}

function SystemCard({
  href,
  external = false,
  disabled = false,
  highlighted = false,
  icon,
  title,
  description,
  meta,
  onNavigate,
}: {
  href?: string
  external?: boolean
  disabled?: boolean
  highlighted?: boolean
  icon: ReactNode
  title: string
  description: string
  meta?: string
  onNavigate?: () => void
}) {
  const content = (
    <>
      <span className="flex min-h-11 items-center justify-center">{icon}</span>
      <span className="mt-2 flex items-center justify-center gap-1.5 text-center text-sm font-bold text-[#061829]">
        {title}
        {external && !disabled ? <ExternalLinkIcon className="size-3.5" /> : null}
      </span>
      <span className="mt-1 block text-center text-xs leading-5 text-zinc-500">
        {description}
      </span>
      {meta ? (
        <span
          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            highlighted
              ? "bg-[#e6f2ff] text-[#0b75d9]"
              : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {meta}
        </span>
      ) : null}
    </>
  )
  const className = `flex min-h-[11.25rem] flex-col items-center justify-center rounded-xl border p-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff] ${
    highlighted
      ? "border-[#118cff] bg-[#f3f8ff] hover:bg-[#eaf4ff]"
      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
  } ${disabled ? "cursor-not-allowed opacity-70" : ""}`

  if (disabled || !href) {
    return (
      <div aria-disabled="true" className={className}>
        {content}
      </div>
    )
  }

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        {content}
      </a>
    )
  }

  return (
    <Link href={href} onClick={onNavigate} className={className}>
      {content}
    </Link>
  )
}

function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function BrowserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <rect x="7" y="9" width="34" height="30" rx="5" stroke="currentColor" strokeWidth="2" />
      <path d="M7 17h34" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="13" r="1" fill="currentColor" />
      <circle cx="16" cy="13" r="1" fill="currentColor" />
    </svg>
  )
}

function MapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path d="m6 14 11-5 14 5 11-5v26l-11 5-14-5-11 5V14Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M17 9v26M31 14v26" stroke="currentColor" strokeWidth="2" />
      <path d="M29 14c0 4-5 9-5 9s-5-5-5-9a5 5 0 1 1 10 0Z" fill="white" stroke="currentColor" strokeWidth="2" />
      <circle cx="24" cy="14" r="1.6" fill="currentColor" />
    </svg>
  )
}

function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth="2" />
      <path d="M7 24h34M24 7c5 5 7 11 7 17s-2 12-7 17c-5-5-7-11-7-17s2-12 7-17Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M11.5 4H16v4.5M9 11l7-7M16 11v3.5A1.5 1.5 0 0 1 14.5 16h-9A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4H9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M4 10h12m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PartnerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 20v-8.5L12 5l8 6.5V20M8.5 20v-5h7v5M7 9V5h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AnalyticsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 20V10m5 10V4m6 16v-7m5 7V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m4 7 5-4 6 7 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CityOperationsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="m4 7 5-2 6 2 5-2v13l-5 2-6-2-5 2V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 5v13m6-11v13m-3-9.5 1.3 1.3 2.7-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CityPagesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 20V9l5-4 4 3 3-2 4 3v11M8 20v-5h4v5m4-8h.01M16 16h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MediaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.5" cy="9" r="1.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="m5.5 17 4.2-4.2 3.1 2.8 2.1-2.1 3.6 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BookingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5V9a2 2 0 0 0 0 4v3.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5V13a2 2 0 0 0 0-4V7.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13 8.5v7M9.5 12h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function EditorialIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16V4.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.5 8h6.5M8.5 12h6.5M8.5 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 4.5v12A3.5 3.5 0 0 0 8.5 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
