import { PartnerDashboard } from '@/components/partner/partner-dashboard'
import { PartnerTaskSettingsLoader } from '@/components/partner/partner-task-settings-loader'
import { partnerPageContext } from '@/lib/partners/page-context'
import { canConfirmPartnerTask } from '@/lib/partners/tasks'

export const dynamic = 'force-dynamic'
export default async function PartnerTaskConfirmationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams, ctx = await partnerPageContext(query.partner)
  return <PartnerDashboard {...ctx} active="deals">
    <div className="mb-5"><h1 className="text-2xl font-bold">Aufgabe bestätigen</h1><p className="mt-2 text-sm leading-6 text-slate-600">Bereits zugesagte Aufgaben erfüllen. Die Kamera zum Scannen findest du in der App.</p></div>
    {canConfirmPartnerTask(ctx.rights) ? <PartnerTaskSettingsLoader partnerId={ctx.partnerId} confirmationOnly /> : <p role="alert" className="rounded-xl bg-amber-50 p-4">Für Aufgabenbestätigungen fehlt das aktive Verwaltungsrecht.</p>}
  </PartnerDashboard>
}
