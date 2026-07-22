import { redirect } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { MenuApprovalWorkspace } from "@/app/partner-admin"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData } from "@/lib/admin-data"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function MenuApprovalsPage() {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    redirect("/")
  }

  const supabase = await createClient()
  const adminSession = await getAdminSession(supabase)

  if (!adminSession?.isAdmin) {
    redirect("/login")
  }

  const dashboard = await getDashboardData(supabase)
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell
      adminName={adminName}
      title="Menu approvals"
      subtitle="Review submitted partner menus before publishing"
      micrositeCount={dashboard.partners.length}
    >
      {dashboard.errors.length ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Supabase returned warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {dashboard.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </section>
      ) : null}
      <MenuApprovalWorkspace partners={dashboard.partners} />
    </AdminShell>
  )
}
