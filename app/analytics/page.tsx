import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import {
  AnalyticsAccessState,
  BusinessControlCenter,
} from "@/components/analytics/business-control-center"
import { requireAdmin } from "@/lib/admin"
import {
  parseBusinessAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/analytics/filters"
import { loadBusinessAnalytics } from "@/lib/analytics/loader"
import { getSupabaseConfig } from "@/lib/supabase/config"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Business Control Center",
  description: "Geprüfte Business-, Produkt-, Marketing- und Finanzkennzahlen.",
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<AnalyticsSearchParams>
}) {
  const config = getSupabaseConfig()
  if (!config.isConfigured) {
    return <AnalyticsConfigurationRequired />
  }

  const filters = parseBusinessAnalyticsFilters(await searchParams)
  const { supabase, adminSession } = await requireAdmin()
  const analytics = await loadBusinessAnalytics(supabase, filters)
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell
      adminName={adminName}
      title="Business Control Center"
      subtitle="Business, Produkt, Marketing und Profit in einer geprüften Sicht"
    >
      {analytics.state === "ready" ||
      analytics.state === "empty" ||
      analytics.state === "partial" ? (
        <BusinessControlCenter
          payload={analytics.payload}
          canReadFinance={analytics.permissions.financeRead}
        />
      ) : (
        <AnalyticsAccessState state={analytics.state} />
      )}
    </AdminShell>
  )
}

function AnalyticsConfigurationRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6f1] px-5 text-[#061829]">
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-[#061829]/10 bg-white shadow-[0_20px_56px_rgba(6,24,41,.08)]">
        <div className="h-1.5 bg-[linear-gradient(90deg,#118cff,#17d4d7)]" />
        <div className="p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0b75d9]">
            Benefitsi Admin
          </p>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.035em]">
            Supabase-Konfiguration erforderlich
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#526170]">
            Das Business Control Center lädt keine Daten, solange URL und
            Publishable Key für diese Umgebung fehlen.
          </p>
        </div>
      </section>
    </main>
  )
}
