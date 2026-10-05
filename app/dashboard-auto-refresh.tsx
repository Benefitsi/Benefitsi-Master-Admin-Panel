"use client"

import { useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

const FALLBACK_REFRESH_MS = 45_000
const REFRESH_DEBOUNCE_MS = 500
const DASHBOARD_TABLES = new Set([
  "partners", "deals", "cities", "users", "partner_holidays", "partner_socials",
  "partner_reward_milestones", "partner_staff", "partner_memberships", "partner_opening_hours",
  "menus", "menu_categories", "menu_items", "menu_item_addons", "visits", "deal_redemptions",
  "redemption_applied_benefits", "qr_tokens", "stamp_cards_progress", "microsites", "microsite_versions",
  "partner_feature_flags", "partner_entitlement_overrides", "partner_subscriptions", "partner_feedback_settings",
])

export function PanelDataAutoRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const refreshTimer = useRef<number | null>(null)
  const completionTimer = useRef<number | null>(null)
  const refreshing = useRef(false)
  const transitionPending = useRef(false)
  const queued = useRef(false)
  const refreshBridge = useRef<(() => void) | null>(null)
  const lastRefresh = useRef(0)

  useEffect(() => {
    transitionPending.current = pending
    refreshing.current = pending
    if (!pending && queued.current) refreshBridge.current?.()
  }, [pending])

  useEffect(() => {
    const dirtyForms = new Set<HTMLFormElement>()
    lastRefresh.current = Date.now()
    const canRefresh = () => {
      for (const form of dirtyForms) if (!form.isConnected) dirtyForms.delete(form)
      return document.visibilityState === "visible" && !refreshing.current &&
        !document.querySelector("form[data-partner-save-form]") &&
        !document.querySelector('form[aria-busy="true"], form button[aria-busy="true"]') && !dirtyForms.size
    }
    const refresh = () => {
      queued.current = true
      if (!canRefresh()) return
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null
        if (!canRefresh()) return
        queued.current = false
        refreshing.current = true
        startTransition(() => router.refresh())
        lastRefresh.current = Date.now()
        // A cached refresh may complete before React commits a pending frame.
        completionTimer.current = window.setTimeout(() => {
          completionTimer.current = null
          if (!transitionPending.current) {
            refreshing.current = false
            if (queued.current) refresh()
          }
        }, REFRESH_DEBOUNCE_MS)
      }, REFRESH_DEBOUNCE_MS)
    }
    refreshBridge.current = refresh
    const edited = (event: Event) => {
      const form = (event.target as HTMLElement | null)?.closest?.("form")
      if (form) dirtyForms.add(form)
    }
    const reset = (event: Event) => {
      if (!event.defaultPrevented) dirtyForms.delete(event.target as HTMLFormElement)
      if (queued.current) refresh()
    }

    const supabase = createClient()
    const channel = supabase
      .channel("admin-dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public" }, payload => {
        if (DASHBOARD_TABLES.has(payload.table)) refresh()
      })
      .subscribe()
    const fallback = window.setInterval(refresh, FALLBACK_REFRESH_MS)
    const refreshAfterAbsence = () => {
      if (
        document.visibilityState === "visible" &&
        (queued.current || Date.now() - lastRefresh.current > FALLBACK_REFRESH_MS)
      ) {
        refresh()
      }
    }
    window.addEventListener("focus", refreshAfterAbsence)
    document.addEventListener("visibilitychange", refreshAfterAbsence)
    document.addEventListener("input", edited)
    document.addEventListener("change", edited)
    document.addEventListener("reset", reset)

    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current)
      window.clearInterval(fallback)
      window.removeEventListener("focus", refreshAfterAbsence)
      document.removeEventListener("visibilitychange", refreshAfterAbsence)
      document.removeEventListener("input", edited)
      document.removeEventListener("change", edited)
      document.removeEventListener("reset", reset)
      refreshBridge.current = null
      void supabase.removeChannel(channel)
    }
  }, [router, startTransition])

  return null
}

// Kept as a named alias for the admin page while the same live-data bridge is
// also used by the partner portal.
export const DashboardAutoRefresh = PanelDataAutoRefresh
