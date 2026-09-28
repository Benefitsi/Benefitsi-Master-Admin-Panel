import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { AdminShell } from '../../admin-shell'
import {
  getComparisonOptions,
  comparisonStore,
} from '@/lib/seo/seo-comparison-data'
import {
  comparisonToday,
  comparisonDate,
  readComparisonConfig,
  compareRankBatches,
} from '@/lib/seo/seo-comparison'
import { CreateComparisonForm } from './create-form'
import { ComparisonReport } from './report'

export const dynamic = 'force-dynamic'
export default async function PartnerComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{
    target?: string
    partner?: string
    asof?: string
    error?: string
    saved?: string
  }>
}) {
  const { supabase, adminSession } = await requireAdmin()
  const params = await searchParams,
    today = comparisonToday()
  const { partners, campaigns } = await getComparisonOptions(supabase)
  const selectedId = params.target ?? campaigns[0]?.id
  const store = comparisonStore(supabase)
  const target = selectedId ? await store.getTarget(selectedId) : null
  const config = target?.partner_id
    ? readComparisonConfig(target.provider_config.comparison)
    : null
  let asOf = today
  try {
    if (params.asof) asOf = comparisonDate(params.asof, today)
  } catch {
    /* Invalid report dates use today and are shown in the form. */
  }
  const [batches, events] =
    target && config
      ? await Promise.all([
          store.getBatches(target.id, config),
          store.getEvents(target.id),
        ])
      : [[], []]
  const partner = partners.find((p) => p.id === target?.partner_id)
  return (
    <AdminShell
      title="Partnervergleich"
      subtitle="Google-Rankings vor und nach dem SEO-Paket"
      adminName={
        adminSession.profile?.display_name || adminSession.user.email || 'Admin'
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/seo" className="text-[#0b75d9] hover:underline">
            ← SEO &amp; Sichtbarkeit
          </Link>
          <span className="text-zinc-400">/</span>
          <span className="font-medium">Partnervergleich</span>
          <span className="text-zinc-400">/</span>
          <Link href={`/seo/automatisierung${target ? `?target=${encodeURIComponent(target.id)}` : ''}`} className="text-[#0b75d9] hover:underline">Automatisierung &amp; Wartung</Link>
        </div>
        <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-[#0b75d9]">
            Entwicklung sichtbar machen
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Was hat sich seit dem Start verändert?
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-600">
            Bestehende Webseiten, Benefitsi-Partnerseiten und
            Google-Maps-Profile getrennt betrachten. Ein fester Ausgangsstand,
            vergleichbare Suchbedingungen und dokumentierte Maßnahmen machen
            Fortschritte und Rückgänge nachvollziehbar.
          </p>
        </section>
        {params.error && (
          <p
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            {params.error.slice(0, 500)}
          </p>
        )}
        {params.saved && (
          <p
            role="status"
            className="rounded-md border border-[#b8dcff] bg-[#f3f8ff] p-3 text-sm text-[#061829]"
          >
            {params.saved.slice(0, 500)}
          </p>
        )}
        {campaigns.length > 0 && (
          <form
            className="flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 bg-white p-4"
            method="get"
          >
            <label className="min-w-0 flex-1 text-sm font-medium">
              Partner und Messziel
              <select
                name="target"
                defaultValue={selectedId}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.channel === 'maps' ? 'Maps' : 'Webseite'} ·{' '}
                    {c.url}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-md border border-[#118cff] px-4 py-2 text-sm font-medium text-[#0b75d9] hover:bg-[#f3f8ff]">
              Vergleich öffnen
            </button>
          </form>
        )}
        {target && config && partner ? (
          <ComparisonReport
            targetId={target.id}
            targetStatus={target.status}
            updatedAt={target.updated_at}
            partnerName={partner.name}
            config={config}
            batches={batches}
            events={events}
            asOf={asOf}
            today={today}
            report={compareRankBatches(config, config.baseline, batches, asOf)}
          />
        ) : campaigns.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#b8dcff] bg-[#f3f8ff] p-5 text-sm leading-6 text-[#061829]">
            Noch kein Partnervergleich eingerichtet. Wähle unten einen Partner
            und seine bestehende Webseite oder sein Google-Profil. Bereits
            bekannte frühere Rankings können anschließend mit ihrem
            Originalbeleg erfasst werden.
          </div>
        ) : (
          <p role="alert" className="text-sm text-rose-700">
            Dieser Partnervergleich ist nicht verfügbar. Bitte ein vorhandenes
            Messziel auswählen.
          </p>
        )}
        <details
          className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm"
          open={campaigns.length === 0}
        >
          <summary className="cursor-pointer text-base font-semibold">
            Weiteren Partner oder Messbereich einrichten
          </summary>
          <CreateComparisonForm
            partners={partners}
            today={today}
            initialPartnerId={params.partner}
          />
        </details>
      </div>
    </AdminShell>
  )
}
