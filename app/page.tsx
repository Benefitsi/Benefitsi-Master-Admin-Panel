import { Suspense } from "react"
import { AdminTranslationBoundary } from "@/components/admin-translation-boundary"
import {
  EcosystemActivity, EcosystemAgents, EcosystemDirectory, EcosystemFleet,
  EcosystemFocus, EcosystemGoals, EcosystemMetrics, EcosystemOverviewLayout,
  EcosystemSectionLoading, EcosystemTimestamp,
} from "@/components/ecosystem/ecosystem-overview"
import { loadAgentControl } from "@/lib/agent-control-data"
import { loadBusinessAnalytics } from "@/lib/analytics/loader"
import { parseBusinessAnalyticsFilters } from "@/lib/analytics/filters"
import { selectOverviewAnalytics } from "@/lib/ecosystem/overview"
import { buildAgentSummaries } from "@/lib/ecosystem/overview"
import { selectOverviewGoals } from "@/lib/ecosystem/analytics"
import { agentSearchEntries, pageSearchEntries } from "@/lib/ecosystem/search"
import { EcosystemSearch, EcosystemSearchProvider, EcosystemSearchRegistration } from "@/components/ecosystem/ecosystem-search"
import { buildPageDirectory, parsePublicMicrositeDirectory } from "@/lib/ecosystem/directory"
import { loadFounderOverview } from "@/lib/founder-overview-data"
import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData } from "@/lib/admin-data"
import { getPartnerPortalSession } from "@/lib/partner-portal"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { AdminShell, PartnerPanelLink } from "./admin-shell"
import { AdminLanguageControl, AdminLanguageProvider } from "./admin-language"
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
  if (["partner", "mode", "tab", "view"].some(key => singleQueryValue(query[key]))) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item)
    }
    redirect(`/partners?${params}`)
  }
  // Authenticate first, then share one request per source across independent sections.
  const sources = {
    dashboard: getDashboardData(supabase),
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
    <EcosystemSearchProvider>
    <AdminShell
      title="Übersicht"
      subtitle=""
      adminName={adminName}
      micrositeCount={<Suspense fallback="…"><DashboardPartnerCount data={sources.dashboard} /></Suspense>}
      headerSearch={<EcosystemSearch />}
      headerActions={<Suspense fallback={null}><DashboardPartnerLink data={sources.portal} /></Suspense>}
    >
      <Suspense fallback={null}><DashboardRefreshWhenReady sources={sources} /></Suspense>
      <EcosystemOverviewLayout
        timestamp={<Suspense fallback={null}><DashboardTimestamp data={sources.founder} /></Suspense>}
        metrics={<Suspense fallback={<EcosystemSectionLoading label="Kennzahlen werden geladen" variant="metrics" />}><DashboardMetrics sources={sources} /></Suspense>}
        activity={<Suspense fallback={<EcosystemSectionLoading label="Analytics werden geladen" variant="activity" />}><DashboardActivity data={sources.analytics} /></Suspense>}
        fleet={<Suspense fallback={<EcosystemSectionLoading label="Agent-Status wird geladen" />}><DashboardFleet data={sources.agents} /></Suspense>}
        focus={<Suspense fallback={<EcosystemSectionLoading label="Aufträge werden geladen" />}><DashboardFocus data={sources.founder} /></Suspense>}
        goals={<Suspense fallback={<EcosystemSectionLoading label="Ziele werden geladen" />}><DashboardGoals data={sources.analytics} /></Suspense>}
        agents={<Suspense fallback={<EcosystemSectionLoading label="Agents werden geladen" variant="agents" />}><DashboardAgents data={sources.agents} /></Suspense>}
        directory={<Suspense fallback={<EcosystemSectionLoading label="Seiten werden geladen" variant="directory" />}><DashboardDirectory sources={sources} /></Suspense>}
      />

    </AdminShell>
    </EcosystemSearchProvider>
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

async function DashboardGoals({ data }: { data: DashboardSources["analytics"] }) {
  return <AdminTranslationBoundary><EcosystemGoals goals={selectOverviewGoals(await data)} /></AdminTranslationBoundary>
}

async function DashboardAgents({ data }: { data: DashboardSources["agents"] }) {
  const agentData = await data
  return <AdminTranslationBoundary>
    <EcosystemSearchRegistration source="agents" entries={agentSearchEntries(buildAgentSummaries(agentData))} state={agentData.runtime.state === "fresh" ? "ready" : "partial"} />
    <EcosystemAgents agentData={agentData} />
  </AdminTranslationBoundary>
}

async function DashboardDirectory({ sources }: { sources: DashboardSources }) {
  const [dashboard, publicMicrosites] = await Promise.all([sources.dashboard, sources.publicMicrosites])
  const pages = buildPageDirectory(dashboard, publicMicrosites)
  const incomplete = dashboard.errors.length > 0 || publicMicrosites.state === "unavailable"
  return <AdminTranslationBoundary>
    <EcosystemSearchRegistration source="pages" entries={pageSearchEntries(pages)} state={incomplete ? "partial" : "ready"} />
    <EcosystemDirectory pages={pages} incomplete={incomplete} />
  </AdminTranslationBoundary>
}


function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function SetupRequired() {
  return (
    <AdminLanguageProvider>
    <main className="grid min-h-screen place-items-center bg-[#f6f7f4] px-5 text-zinc-950">
      <section className="w-full max-w-xl rounded-md border border-zinc-200 bg-white p-6 shadow-sm">
        <AdminLanguageControl />
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
    </AdminLanguageProvider>
  )
}
