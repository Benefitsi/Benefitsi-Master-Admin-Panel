"use client"

import { useEffect, useState } from "react"
import type { PartnerWithDeals } from "@/lib/admin-data"

type Capabilities = { media_rich_enabled: boolean; menu_ai_import_enabled: boolean }

export function usePartnerCapabilities(partner: PartnerWithDeals | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ source: PartnerWithDeals; flags?: Capabilities; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const needsLoad = enabled && Boolean(partner?.id) && partner?.menu_ai_import_enabled === undefined

  useEffect(() => {
    if (!needsLoad || !partner?.id) return
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(`/api/partners/${encodeURIComponent(partner.id!)}/capabilities`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
          cache: "no-store",
        })
        const flags = await response.json() as Capabilities
        if (!response.ok || typeof flags.media_rich_enabled !== "boolean" || typeof flags.menu_ai_import_enabled !== "boolean") {
          throw new Error("Berechtigungen konnten nicht geladen werden.")
        }
        if (!controller.signal.aborted) setResult({ source: partner, flags })
      } catch {
        if (!controller.signal.aborted) setResult({ source: partner, error: "Tarifberechtigungen konnten nicht geladen werden." })
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt, needsLoad, partner])

  const current = result?.source === partner ? result : null
  return {
    partner: current?.flags && partner ? { ...partner, ...current.flags } : partner,
    error: current?.error,
    retry: () => setAttempt(value => value + 1),
  }
}
