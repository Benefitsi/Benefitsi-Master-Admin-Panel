import type { Metadata } from 'next'
import { AdminShell } from '@/app/admin-shell'
import { requireAdmin } from '@/lib/admin'
import { getFinanceAccess, type FinanceStatus } from '@/lib/finance-agent'
import { requestFinance } from '@/lib/finance-agent-server'
import { FinanceWorkflow } from './finance-workflow'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Buchhaltung & Steuern | Benefitsi Admin', robots: { index: false, follow: false } }

export default async function FinancePage() {
  const { supabase, adminSession } = await requireAdmin()
  const access = await getFinanceAccess(supabase, adminSession)
  const adminName = adminSession.profile?.display_name || adminSession.user.email || 'Admin'
  let data: FinanceStatus | null = null
  if (access.financeRead) {
    try { data = await requestFinance('status') as FinanceStatus } catch { /* Honest offline state; no raw bridge error in client. */ }
  }
  return <AdminShell adminName={adminName} title="Buchhaltung & Steuern" subtitle="Belege vorbereiten, Lücken erkennen und geordnet prüfen lassen">
    {access.financeRead ? <FinanceWorkflow initial={data} /> : <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><h2 className="text-lg font-bold">Finanzberechtigung erforderlich</h2><p className="mt-2 text-sm">Für diesen Arbeitsbereich wird zusätzlich zur Admin-Rolle die bestehende Berechtigung financeRead benötigt. Status, Belege und Exporte werden erst danach geladen.</p></section>}
  </AdminShell>
}
