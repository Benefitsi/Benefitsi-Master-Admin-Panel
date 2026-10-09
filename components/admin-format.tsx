"use client"

import { useAdminLocale } from "@/app/admin-language"

export function AdminDate({ value, options, className, fallback = "—" }: {
  value: string | number | null | undefined
  options?: Intl.DateTimeFormatOptions
  className?: string
  fallback?: string
}) {
  const locale = useAdminLocale()
  const date = value === null || value === undefined || value === "" ? null : new Date(value)
  const label = date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { timeZone: "Europe/Berlin", ...(options ?? { dateStyle: "medium", timeStyle: "short" }) }).format(date)
    : fallback
  return <span data-admin-i18n-ignore="true" className={className}>{label}</span>
}

export function AdminNumber({ value, options, className, fallback = "—" }: {
  value: number | null | undefined
  options?: Intl.NumberFormatOptions
  className?: string
  fallback?: string
}) {
  const locale = useAdminLocale()
  return <span data-admin-i18n-ignore="true" className={className}>{typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat(locale, options).format(value) : fallback}</span>
}
