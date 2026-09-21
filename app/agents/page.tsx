import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"
import { loadAgentControl } from "@/lib/agent-control-data"
import { AgentOverview } from "./agent-overview"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Agenten | Benefitsi Admin",
  robots: { index: false, follow: false },
}

export default async function AgentsPage() {
  const { supabase, adminSession } = await requireAdmin()
  const data = await loadAgentControl(supabase)
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"
  return <AdminShell adminName={adminName} title="Agenten" subtitle="Profile, Zeitpläne, Kontext und Freigaben"><AgentOverview data={data} /></AdminShell>
}
