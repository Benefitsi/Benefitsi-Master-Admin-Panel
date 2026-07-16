"use client"

import Image from "next/image"
import { useState, type ReactNode } from "react"
import { signOut } from "./actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"

export function AdminShell({
  adminName,
  children,
}: {
  adminName: string
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <main className="min-h-screen bg-[#f3f5f7] text-zinc-950">
      <div
        className={`grid min-h-screen transition-[grid-template-columns] duration-200 ${
          collapsed
            ? "lg:grid-cols-[72px_minmax(0,1fr)]"
            : "lg:grid-cols-[220px_minmax(0,1fr)]"
        }`}
      >
        <aside
          className={`border-r border-zinc-200 bg-white py-4 transition-[padding] duration-200 ${
            collapsed ? "px-3" : "px-4"
          }`}
        >
          <div
            className={`flex items-center ${
              collapsed ? "flex-col gap-3" : "justify-between gap-3"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-zinc-100">
                <Image
                  src="/Benefitsi_Icon_FullColor_RGB_512.png"
                  alt="Benefitsi Logo"
                  width={34}
                  height={34}
                />
              </div>
              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold uppercase tracking-[0.16em] text-teal-800">
                    Benefitsi
                  </p>
                  <p className="text-xs text-zinc-500">Admin panel</p>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
              className="grid size-8 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
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
            <nav className="mt-5 space-y-1">
              <a
                href="#partners"
                className="flex h-9 items-center rounded-md bg-teal-50 px-3 text-sm font-semibold text-teal-800"
              >
                Partners
              </a>
            </nav>
          ) : null}
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-5">
            <h1 className="text-xl font-semibold tracking-normal text-zinc-950">
              Partner Management
            </h1>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="max-w-full truncate text-sm text-zinc-600">
                {adminName}
              </p>
              <form action={signOut}>
                <PendingSubmitButton
                  pendingLabel="Signing out..."
                  className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 sm:w-auto"
                >
                  Sign out
                </PendingSubmitButton>
              </form>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 lg:px-5">{children}</div>
        </section>
      </div>
    </main>
  )
}
