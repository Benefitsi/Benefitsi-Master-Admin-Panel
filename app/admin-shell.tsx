"use client"

import Image from "next/image"
import Link from "next/link"
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

export function AdminShell({
  adminName,
  title = "Partnerverwaltung",
  subtitle = "Alle Partner und ihre Informationen",
  micrositeCount,
  children,
}: {
  adminName: string
  title?: string
  subtitle?: string
  micrositeCount?: number
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

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

          {!collapsed ? (
            <nav aria-label="Admin navigation" className="mt-4 space-y-1 lg:mt-8">
              <Link
                href="/#partners"
                className="flex h-11 items-center rounded-xl border border-[#17d4d7]/20 bg-[#118cff]/22 px-3 text-sm font-bold text-white shadow-[inset_3px_0_0_#17d4d7] transition hover:bg-[#118cff]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17d4d7]"
              >
                Partner
              </Link>
            </nav>
          ) : null}
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

function SystemSwitcher({ micrositeCount }: { micrositeCount?: number }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const appUrl = process.env.NEXT_PUBLIC_BENEFITSI_APP_URL?.trim() || ""
  const cityUrl =
    process.env.NEXT_PUBLIC_BENEFITSI_CITY_URL?.trim() ||
    "https://benefitsi.de/stadt/annweiler"
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
        aria-label="Benefitsi Systeme öffnen"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="benefitsi-system-switcher"
        title="Benefitsi Systeme"
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
          aria-label="Benefitsi Systeme"
          className="absolute left-0 top-[calc(100%+0.75rem)] z-50 w-[min(23.5rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_22px_60px_rgba(6,24,41,.16)] sm:left-auto sm:right-0"
        >
          <header>
            <h2 className="text-lg font-bold tracking-tight text-[#061829]">
              Benefitsi Systeme
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
              href={cityUrl}
              external
              icon={<MapIcon className="size-10 text-[#17bfc5]" />}
              title="Städteseiten"
              description="Städte, Guides & lokale Inhalte"
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
