"use client"

import { useEffect, useMemo, useState } from "react"
import type { PartnerWithDeals } from "@/lib/admin-data"
import {
  resolveMicrositeConfig,
  type MicrositeConfig,
} from "@/lib/microsites"
import { MicrositeIntegrationProvider, type MicrositeCommerceAction } from "@/components/microsite/microsite-integration"
import { MicrositeRenderer } from "@/components/microsite/microsite-renderer"
import { AdminLanguageControl, AdminLanguageProvider } from "@/app/admin-language"
import { micrositeVersions } from "@/lib/microsite-workflow"

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
  const versions = micrositeVersions(partner.microsite)
  const builderHref = `${previewBasePath.replace(/microsite-preview$/, "microsite-builder")}/${previewIdentifier}`
  const liveHref = `${(process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL || "https://benefitsi.de").replace(/\/+$/, "")}/partner/${previewIdentifier}`

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
      return "Vorschau · aktueller Arbeitsstand"
    }
    const savedVersions = micrositeVersions(partner.microsite)
    const version = previewSource === "published" ? savedVersions.published : savedVersions.editable
    const versionLabel = version?.version_number != null ? ` · v${version.version_number}` : ""
    return previewSource !== "published" && savedVersions.draft
      ? `Gespeicherter Entwurf${versionLabel}`
      : version
        ? `${savedVersions.published?.id === version.id ? "Veröffentlichte Version" : "Gespeicherte Version"}${versionLabel}`
        : "Vorschau · noch nicht gespeichert"
  }, [partner.microsite, previewSource, useBuilderDraft])

  return (
    <AdminLanguageProvider initialLanguage={previewBasePath.startsWith("/partner/") ? "de" : "en"}><main className="min-h-screen min-w-0 overflow-x-clip bg-[#f7f6f3] px-2 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto mb-3 flex max-w-6xl flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <div className="space-y-2">
          <span className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-2 text-sky-900">{statusLabel}</span>
          <p className="max-w-xl font-normal text-zinc-600">{useBuilderDraft ? "Hier siehst du deine aktuellen Änderungen. Mit Speichern sicherst du sie; mit Veröffentlichen werden sie öffentlich." : "Diese Vorschau zeigt den gespeicherten Stand. Deine Änderungen bearbeitest du im Builder."}</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <AdminLanguageControl />
          <a className="rounded-md bg-teal-700 px-3 py-2 text-center text-white" href={builderHref}>Bearbeiten</a>
          {versions.published ? <a className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-center text-emerald-800" href={liveHref} target="_blank" rel="noreferrer">Live-Seite · Version {versions.published.version_number ?? "–"}</a> : null}
          <a
            className="min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-center text-zinc-700 transition hover:bg-zinc-50"
            href={`${previewBasePath}/${previewIdentifier}?${mobileParams.toString()}`}
          >
            Mobile
          </a>
          <details className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-zinc-700">
            <summary className="cursor-pointer">Gespeicherte Versionen</summary>
            <div className="mt-2 flex flex-col gap-2">
              <a className="py-1 underline" href={previewHref("builder")}>Aktuelle Vorschau</a>
              {versions.editable ? <a className="py-1 underline" href={previewHref("saved")}>Gespeicherter Stand · Version {versions.editable.version_number ?? "–"}</a> : null}
              {versions.published ? <a className="py-1 underline" href={previewHref("published")}>Veröffentlichte Version {versions.published.version_number ?? "–"}</a> : null}
            </div>
          </details>
        </div>
      </div>
      <div data-admin-i18n-ignore="true" className={isMobile ? "mx-auto w-full min-w-0 max-w-[390px]" : "min-w-0"}>
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
    </main></AdminLanguageProvider>
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
