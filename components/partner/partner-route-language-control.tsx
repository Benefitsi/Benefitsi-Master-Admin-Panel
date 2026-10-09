"use client"

import { usePathname } from "next/navigation"
import { AdminLanguageControl } from "@/app/admin-language"

/** Standalone partner tools share the language used by the dashboard. */
export function PartnerRouteLanguageControl() {
  const pathname = usePathname()
  const standalone = ["/partner/bookings", "/partner/commerce", "/partner/seo"].some(route => pathname === route || pathname?.startsWith(`${route}/`))
  if (!standalone) return null
  return <div className="flex justify-end px-4 pt-4"><AdminLanguageControl /></div>
}
