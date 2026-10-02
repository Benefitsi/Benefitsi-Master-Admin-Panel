"use client"

import { useEffect, useMemo, useState } from "react"
import type { PartnerWithDeals } from "@/lib/admin-data"
import {
  resolveMicrositeConfig,
  type MicrositeConfig,
} from "@/lib/microsites"
import { MicrositeIntegrationProvider, type MicrositeCommerceAction } from "@/components/microsite/microsite-integration"
import { MicrositeRenderer } from "@/components/microsite/microsite-renderer"

export function MicrositePreviewShell({
  partner,
  initialConfig,
  commerceActions = [],
  previewStorageKey,
  useBuilderDraft,
  isMobile,
  previewMode,
  previewSource = useBuilderDraft ? "builder" : "saved",
  previewBasePath = "/microsite-preview",
}: {
  partner: PartnerWithDeals
  commerceActions?: MicrositeCommerceAction[]
  initialConfig: MicrositeConfig
  previewStorageKey: string
  useBuilderDraft: boolean
  isMobile: boolean
  previewMode?: "light" | "dark"
  previewSource?: "builder" | "saved" | "published"
  previewBasePath?: string
}) {
  const [config, setConfig] = useState(initialConfig)
  const displayedConfig = useMemo(
    () => withPreviewMode(useBuilderDraft ? config : initialConfig, previewMode),
    [config, initialConfig, previewMode, useBuilderDraft],
  )
  const previewIdentifier = encodeURIComponent(
    partner.microsite?.slug || partner.slug || partner.id || "partner",
  )
  const selectedMode = previewMode || displayedConfig.appearance?.mode || "light"
  const previewHref = (source: "builder" | "saved" | "published") => `${previewBasePath}/${previewIdentifier}?${new URLSearchParams({ source, mode: selectedMode })}`
  const mobileParams = new URLSearchParams({ viewport: "mobile", source: previewSource, mode: selectedMode })

  useEffect(() => {
    if (!useBuilderDraft) {
      return
    }

    let cancelled = false

    const applyStoredConfig = (storedConfig: string | null) => {
      if (cancelled) return

      if (!storedConfig) {
        setConfig(initialConfig)
        return
      }

      try {
        setConfig(resolveMicrositeConfig(JSON.parse(storedConfig), partner))
      } catch {
        setConfig(initialConfig)
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === previewStorageKey) applyStoredConfig(event.newValue)
    }

    queueMicrotask(() => {
      applyStoredConfig(window.localStorage.getItem(previewStorageKey))
    })

    window.addEventListener("storage", handleStorage)

    return () => {
      cancelled = true
      window.removeEventListener("storage", handleStorage)
    }
  }, [initialConfig, partner, previewStorageKey, useBuilderDraft])

  const statusLabel = useMemo(() => {
    if (useBuilderDraft) {
      return "Builder-Referenz · aktueller Arbeitsstand"
    }
    const version = previewSource === "published" ? partner.microsite?.publishedVersion : partner.microsite?.draftVersion ?? partner.microsite?.publishedVersion
    const versionLabel = version?.version_number != null ? ` · v${version.version_number}` : ""
    return previewSource !== "published" && partner.microsite?.draftVersion
      ? `Gespeicherter Entwurf${versionLabel}`
      : version
        ? `Veröffentlichter Stand${versionLabel}`
        : "Partnerdaten-Fallback"
  }, [partner.microsite?.draftVersion, partner.microsite?.publishedVersion, previewSource, useBuilderDraft])

  return (
    <main className="min-h-screen min-w-0 overflow-x-clip bg-[#f7f6f3] px-2 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto mb-3 flex max-w-6xl flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <div className="space-y-2">
          <span className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-2 text-sky-900">{statusLabel}</span>
          <p className="max-w-xl font-normal text-zinc-600">{useBuilderDraft ? "Verbindliche Layout-Vorschau. Änderungen im Builder können noch ungespeichert sein." : "Versionsvergleich. Maßgeblich für das Layout ist die Builder-Referenz."}</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {!useBuilderDraft ? <a className="rounded-md border border-sky-200 bg-white px-3 py-2 text-center text-sky-900" href={previewHref("builder")}>Builder-Referenz öffnen</a> : null}
          <a
            className="min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-center text-zinc-700 transition hover:bg-zinc-50"
            href={previewHref("saved")}
          >
            Gespeicherten Entwurf öffnen
          </a>
          {partner.microsite?.publishedVersion ? <a className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-center text-zinc-700" href={previewHref("published")}>Veröffentlichten Stand vergleichen</a> : null}
          <a
            className="min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-center text-zinc-700 transition hover:bg-zinc-50"
            href={`${previewBasePath}/${previewIdentifier}?${mobileParams.toString()}`}
          >
            Mobile
          </a>
        </div>
      </div>
      <div className={isMobile ? "mx-auto w-full min-w-0 max-w-[390px]" : "min-w-0"}>
        <MicrositeIntegrationProvider value={{ commerceActions }}>
        <MicrositeRenderer
          partner={partner}
          config={{...displayedConfig,mediaPermitted:partner.media_rich_enabled===true}}
          showMockDeals={
            useBuilderDraft &&
            displayedConfig.template !== "restaurant-premium" &&
            displayedConfig.builder.mockDealsPreview
          }
        />
        </MicrositeIntegrationProvider>
      </div>
    </main>
  )
}

function withPreviewMode(config: MicrositeConfig, mode?: "light" | "dark") {
  if (!mode || config.appearance?.mode === mode) {
    return config
  }

  return {
    ...config,
    appearance: {
      ...(config.appearance ?? { mode: "light" }),
      mode,
    },
  }
}
