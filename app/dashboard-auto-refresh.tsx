"use client"

import { useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

const FALLBACK_REFRESH_MS = 45_000
const REFRESH_DEBOUNCE_MS = 500

export function DashboardAutoRefresh() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refreshTimer = useRef<number | null>(null)
  const lastRefresh = useRef(0)

  useEffect(() => {
    lastRefresh.current = Date.now()
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => {
        startTransition(() => router.refresh())
        lastRefresh.current = Date.now()
        refreshTimer.current = null
      }, REFRESH_DEBOUNCE_MS)
    }

    const supabase = createClient()
    const channel = supabase
      .channel("admin-dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public" }, refresh)
      .subscribe()
    const fallback = window.setInterval(refresh, FALLBACK_REFRESH_MS)
    const refreshAfterAbsence = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefresh.current > FALLBACK_REFRESH_MS
      ) {
        refresh()
      }
    }
    window.addEventListener("focus", refreshAfterAbsence)
    document.addEventListener("visibilitychange", refreshAfterAbsence)

    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      window.clearInterval(fallback)
      window.removeEventListener("focus", refreshAfterAbsence)
      document.removeEventListener("visibilitychange", refreshAfterAbsence)
      void supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
