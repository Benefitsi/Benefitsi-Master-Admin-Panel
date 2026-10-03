import { Suspense } from "react"
import { AdminTranslationBoundary } from "@/components/admin-translation-boundary"
import {
  EcosystemActivity, EcosystemAgents, EcosystemDirectory, EcosystemFleet,
  EcosystemFocus, EcosystemMetrics, EcosystemOverviewLayout,
  EcosystemSectionLoading, EcosystemTimestamp,
} from "@/components/ecosystem/ecosystem-overview"
import { loadAgentControl } from "@/lib/agent-control-data"
import { loadBusinessAnalytics } from "@/lib/analytics/loader"
import { parseBusinessAnalyticsFilters } from "@/lib/analytics/filters"
import { selectOverviewAnalytics } from "@/lib/ecosystem/overview"
import { buildPageDirectory, parsePublicMicrositeDirectory } from "@/lib/ecosystem/directory"
import { loadFounderOverview } from "@/lib/founder-overview-data"
import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData } from "@/lib/admin-data"
import { getPartnerPortalSession } from "@/lib/partner-portal"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { PartnerWorkspace } from "./partner-admin"
import { AdminShell, PartnerPanelLink } from "./admin-shell"
import { DashboardAutoRefresh } from "./dashboard-auto-refresh"

export const dynamic = "force-dynamic"
// Menu recognition has a 145-second request budget including native OCR.
export const maxDuration = 180

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    return <SetupRequired />
  }

  const supabase = await createClient()
  const adminSession = await getAdminSession(supabase)

  if (!adminSession?.isAdmin) {
    redirect("/login")
  }

  const query = await searchParams
  const requestedPartnerId = singleQueryValue(query.partner)
  // Authenticate first, then share one request per source across independent sections.
  const sources = {
    dashboard: getDashboardData(supabase, { entitlementPartnerId: requestedPartnerId || null }),
    founder: loadFounderOverview(supabase),
    agents: loadAgentControl(supabase),
    analytics: loadBusinessAnalytics(supabase, parseBusinessAnalyticsFilters({})),
    publicMicrosites: Promise.resolve(supabase.rpc("get_public_microsites_v1", {
      p_partner_ids: null, p_slug: null, p_include_config: false,
    })).then(result => parsePublicMicrositeDirectory(result.data, result.error),
      () => parsePublicMicrositeDirectory(null, true)),
    portal: getPartnerPortalSession(supabase, adminSession).catch(() => null),
  }
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell
      title="Ecosystem."
      subtitle=""
      adminName={adminName}
      micrositeCount={<Suspense fallback="…"><DashboardPartnerCount data={sources.dashboard} /></Suspense>}
      headerActions={<Suspense fallback={null}><DashboardPartnerLink data={sources.portal} /></Suspense>}
    >
      <Suspense fallback={null}><DashboardRefreshWhenReady sources={sources} /></Suspense>
      <EcosystemOverviewLayout
        timestamp={<Suspense fallback={null}><DashboardTimestamp data={sources.founder} /></Suspense>}
        metrics={<Suspense fallback={<EcosystemSectionLoading label="Kennzahlen werden geladen" variant="metrics" />}><DashboardMetrics sources={sources} /></Suspense>}
        activity={<Suspense fallback={<EcosystemSectionLoading label="Analytics werden geladen" variant="activity" />}><DashboardActivity data={sources.analytics} /></Suspense>}
        fleet={<Suspense fallback={<EcosystemSectionLoading label="Agent-Status wird geladen" />}><DashboardFleet data={sources.agents} /></Suspense>}
        focus={<Suspense fallback={<EcosystemSectionLoading label="Aufträge werden geladen" />}><DashboardFocus data={sources.founder} /></Suspense>}
        agents={<Suspense fallback={<EcosystemSectionLoading label="Agents werden geladen" variant="agents" />}><DashboardAgents data={sources.agents} /></Suspense>}
        directory={<Suspense fallback={<EcosystemSectionLoading label="Seiten werden geladen" variant="directory" />}><DashboardDirectory sources={sources} /></Suspense>}
      />
      <div id="partners" className="scroll-mt-24">
        <Suspense fallback={<EcosystemSectionLoading label="Partner werden geladen" />}>
          <DashboardPartners data={sources.dashboard} query={query} />
        </Suspense>
      </div>
    </AdminShell>
  )
}

type DashboardSources = {
  dashboard: ReturnType<typeof getDashboardData>
  founder: ReturnType<typeof loadFounderOverview>
  agents: ReturnType<typeof loadAgentControl>
  analytics: ReturnType<typeof loadBusinessAnalytics>
  publicMicrosites: Promise<ReturnType<typeof parsePublicMicrositeDirectory>>
  portal: ReturnType<typeof getPartnerPortalSession>
}

async function DashboardPartnerCount({ data }: { data: DashboardSources["dashboard"] }) {
  return <AdminTranslationBoundary inline>{`${(await data).partners.length} Partner`}</AdminTranslationBoundary>
}

async function DashboardPartnerLink({ data }: { data: DashboardSources["portal"] }) {
  return (await data)?.partnerIds.length ? <AdminTranslationBoundary inline><PartnerPanelLink /></AdminTranslationBoundary> : null
}

async function DashboardRefreshWhenReady({ sources }: { sources: DashboardSources }) {
  // Do not start the refresh interval while the initial response is still streaming.
  await Promise.allSettled(Object.values(sources))
  return <DashboardAutoRefresh />
}

async function DashboardTimestamp({ data }: { data: DashboardSources["founder"] }) {
  return <AdminTranslationBoundary inline><EcosystemTimestamp checkedAt={(await data).checkedAt} /></AdminTranslationBoundary>
}

async function DashboardMetrics({ sources }: { sources: DashboardSources }) {
  const [snapshot, agentData] = await Promise.all([sources.founder, sources.agents])
  return <AdminTranslationBoundary><EcosystemMetrics snapshot={snapshot} agentData={agentData} /></AdminTranslationBoundary>
}

async function DashboardActivity({ data }: { data: DashboardSources["analytics"] }) {
  return <AdminTranslationBoundary><EcosystemActivity analytics={selectOverviewAnalytics(await data)} /></AdminTranslationBoundary>
}

async function DashboardFleet({ data }: { data: DashboardSources["agents"] }) {
  return <AdminTranslationBoundary><EcosystemFleet agentData={await data} /></AdminTranslationBoundary>
}

async function DashboardFocus({ data }: { data: DashboardSources["founder"] }) {
  return <AdminTranslationBoundary><EcosystemFocus snapshot={await data} /></AdminTranslationBoundary>
}

async function DashboardAgents({ data }: { data: DashboardSources["agents"] }) {
  return <AdminTranslationBoundary><EcosystemAgents agentData={await data} /></AdminTranslationBoundary>
}

async function DashboardDirectory({ sources }: { sources: DashboardSources }) {
  const [dashboard, publicMicrosites] = await Promise.all([sources.dashboard, sources.publicMicrosites])
  return <AdminTranslationBoundary><EcosystemDirectory pages={buildPageDirectory(dashboard, publicMicrosites)} incomplete={dashboard.errors.length > 0 || publicMicrosites.state === "unavailable"} /></AdminTranslationBoundary>
}

async function DashboardPartners({ data, query }: {
  data: DashboardSources["dashboard"]
  query: Record<string, string | string[] | undefined>
}) {
  const dashboard = await data
  const requestedPartnerId = singleQueryValue(query.partner)
  const initialPartnerId = dashboard.partners.some(partner => partner.id === requestedPartnerId)
    ? requestedPartnerId : dashboard.partners[0]?.id ?? ""
  return <AdminTranslationBoundary>
    {dashboard.errors.length > 0 ? (
      <section className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Supabase returned warnings</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {dashboard.errors.map(error => <li key={error}>{error}</li>)}
        </ul>
      </section>
    ) : null}
    <PartnerWorkspace
      partners={dashboard.partners}
      cities={dashboard.cities}
      owners={dashboard.owners}
      initialMode={singleQueryValue(query.mode) === "create" ? "create" : "view"}
      initialPartnerId={initialPartnerId}
      initialSettingsTab={singleQueryValue(query.tab)}
      initialView={singleQueryValue(query.view) === "microsite" ? "microsite" : "settings"}
    />
  </AdminTranslationBoundary>
}

function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f4] px-5 text-zinc-950">
      <section className="w-full max-w-xl rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Benefitsi Admin</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          Supabase env setup required
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Create `.env.local` from `.env.example`, then add your Supabase
          publishable key.
        </p>
      </section>
    </main>
  )
}
