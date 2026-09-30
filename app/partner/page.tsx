import {
  PartnerDashboard,
  PartnerOverview,
} from '@/components/partner/partner-dashboard'
import { PartnerWorkspace } from '@/app/partner-admin'
import { AdminLanguageProvider } from '@/app/admin-language'
import { partnerPageContext } from '@/lib/partners/page-context'
import { dashboardWindow, readDashboard } from '@/lib/partners/analytics'
import { readPartnerWorkspace } from '@/lib/partners/workspace-data'
import { canManageProfile } from '@/lib/partners/entitlements'
import { signOutPartner } from './actions'
export const dynamic = 'force-dynamic'
export const maxDuration = 180
export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const query = await searchParams,
    ctx = await partnerPageContext(query.partner)
  const section = ['business', 'deals'].includes(query.section ?? '')
    ? query.section!
    : 'overview'
  let statistics,
    workspace,
    error = ''
  try {
    if (section === 'overview')
      statistics = await readDashboard(
        ctx.client,
        ctx.partnerId,
        dashboardWindow('last7'),
      )
    else if (canManageProfile(ctx.rights))
      workspace = await readPartnerWorkspace(ctx.client, ctx.partnerId)
    else
      error =
        'Für diesen Bereich ist ein berechtigter Inhaber- oder Pro-Verwalterzugang erforderlich.'
  } catch {
    error =
      'Die Daten konnten nicht geladen werden. Bitte versuche es erneut oder prüfe deine Berechtigung.'
  }
  return (
    <AdminLanguageProvider
      initialLanguage="de"
      storageKey="benefitsi-partner-language"
    >
      <PartnerDashboard
        {...ctx}
        active={section}
        signOut={
          <form action={signOutPartner}>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              Abmelden
            </button>
          </form>
        }
      >
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5"
          >
            {error}
          </div>
        )}
        {section === 'overview' && (
          <PartnerOverview {...ctx} data={statistics} />
        )}
        {workspace && (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Microsite:{' '}
              {workspace.partner.microsite?.status === 'published'
                ? 'Veröffentlicht'
                : workspace.partner.microsite?.status === 'pending_review'
                  ? 'In Prüfung'
                  : 'Entwurf'}{' '}
              · Layoutänderungen und Veröffentlichung durch das Benefitsi-Team.
            </p>
            <PartnerWorkspace
              partners={[workspace.partner]}
              cities={workspace.cities}
              owners={[]}
              initialMode="view"
              initialPartnerId={ctx.partnerId}
              initialSettingsTab={section === 'deals' ? 'deals' : query.tab}
              initialView="settings"
              portalMode
              micrositeEditingEnabled={false}
              adminAccess={false}
            />
          </>
        )}
      </PartnerDashboard>
    </AdminLanguageProvider>
  )
}
