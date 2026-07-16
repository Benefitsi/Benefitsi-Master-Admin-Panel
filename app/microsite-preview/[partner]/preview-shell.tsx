"use client"

import { useEffect, useMemo, useState } from "react"
import type { PartnerWithDeals } from "@/lib/admin-data"
import {
  resolveMicrositeConfig,
  type MicrositeConfig,
} from "@/lib/microsites"
import { MicrositeRenderer } from "@/components/microsite/microsite-renderer"

export function MicrositePreviewShell({
  partner,
  initialConfig,
  previewStorageKey,
  useBuilderDraft,
  isMobile,
  previewBasePath = "/microsite-preview",
}: {
  partner: PartnerWithDeals
  initialConfig: MicrositeConfig
  previewStorageKey: string
  useBuilderDraft: boolean
  isMobile: boolean
  previewBasePath?: string
}) {
  const [config, setConfig] = useState(initialConfig)
  const displayedConfig = useBuilderDraft ? config : initialConfig

  useEffect(() => {
    if (!useBuilderDraft) {
      return
    }

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      const storedConfig = window.localStorage.getItem(previewStorageKey)

      if (!storedConfig) {
        setConfig(initialConfig)
        return
      }

      try {
        setConfig(resolveMicrositeConfig(JSON.parse(storedConfig), partner))
      } catch {
        setConfig(initialConfig)
      }
    })

    return () => {
      cancelled = true
    }
  }, [initialConfig, partner, previewStorageKey, useBuilderDraft])

  const statusLabel = useMemo(() => {
    if (useBuilderDraft) {
      return "Aktueller Builder-Stand"
    }

    return partner.microsite?.draftVersion
      ? "Gespeicherter Entwurf"
      : partner.microsite?.publishedVersion
        ? "Published Version"
        : "Partnerdaten-Fallback"
  }, [partner.microsite?.draftVersion, partner.microsite?.publishedVersion, useBuilderDraft])

  return (
    <main className="min-h-screen min-w-0 overflow-x-clip bg-[#f7f6f3] px-2 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto mb-3 flex max-w-6xl flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-zinc-600">
          {statusLabel}
        </span>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <a
            className="min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-center text-zinc-700 transition hover:bg-zinc-50"
            href={`${previewBasePath}/${encodeURIComponent(partner.slug || partner.id || "partner")}`}
          >
            Gespeicherten Entwurf öffnen
          </a>
          <a
            className="min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-center text-zinc-700 transition hover:bg-zinc-50"
            href={`${previewBasePath}/${encodeURIComponent(partner.slug || partner.id || "partner")}?viewport=mobile${useBuilderDraft ? "&source=builder" : ""}`}
          >
            Mobile
          </a>
        </div>
      </div>
      <div className={isMobile ? "mx-auto w-full min-w-0 max-w-[390px]" : "min-w-0"}>
        <MicrositeRenderer partner={partner} config={displayedConfig} />
      </div>
    </main>
  )
}
