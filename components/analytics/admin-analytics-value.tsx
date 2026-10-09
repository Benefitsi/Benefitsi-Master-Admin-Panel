"use client"

import { useAdminLocale, translateValue } from "@/app/admin-language"
import type { AnalyticsMetricUnit } from "@/lib/analytics/contracts"
import { formatAnalyticsValue } from "@/lib/analytics/normalize"

/** Format raw values at the display boundary so the selected language controls units and separators. */
export function AdminAnalyticsValue({ value, unit, formattedValue }: {
  value: number | null
  unit: AnalyticsMetricUnit
  formattedValue?: string | null
}) {
  const locale = useAdminLocale()
  const language = locale.startsWith("en") ? "en" : "de"
  const text = formatAnalyticsValue(value, unit, formattedValue, locale)
  return <span data-admin-i18n-ignore="true">{formattedValue ? translateValue(text, language) : text}</span>
}
