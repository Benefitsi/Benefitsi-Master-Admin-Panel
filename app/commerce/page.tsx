import Link from 'next/link'
import { AdminShell } from '@/app/admin-shell'
import { requireAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { OrderingSwitch } from './ordering-switch'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Online-Bestellungen | Benefitsi Admin' }

export default async function CommerceSettingsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; success?: string; error?: string }>;
}) {
  const { adminSession } = await requireAdmin()
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : ''
  const adminName = adminSession.profile?.display_name || adminSession.user.email || 'Admin'
  if (process.env.BENEFITSI_COMMERCE_ENABLED !== 'true') return <AdminShell adminName={adminName} title="Online-Bestellungen" subtitle="Freischaltung pro Partner"><p>Das Bestellmodul ist für diese Umgebung noch nicht eingeschaltet.</p></AdminShell>
  const admin = createAdminClient()
  let partnersQuery = admin.from('partners').select('id,name').order('name').limit(250)
  if (query) partnersQuery = partnersQuery.ilike('name', `%${query.replace(/[\\%_]/g, '\\$&')}%`)
  const partnersResult = await partnersQuery
  const partners = partnersResult.data || []
  const providersResult = partners.length ? await admin.from('booking_providers')
    .select('id,partner_id,food_ordering_enabled').in('partner_id', partners.map(p => p.id)) : {data: [], error: null}
  const failed = Boolean(partnersResult.error || providersResult.error)
  const providers = providersResult.data || []
  return <AdminShell adminName={adminName} title="Online-Bestellungen" subtitle="Ein Schalter pro Partner – für die bestehende App und die Microsite.">
    <section className="rounded-2xl border border-blue-100 bg-white p-5">
      <p className="text-sm leading-6 text-slate-600">Freigeschaltete Partner erhalten den Button „Bestellen“, sobald Speisekarte und verfügbare Bestellzeiten eingerichtet sind. Vorteile wie „2 für 1“ werden weiterhin mit dem Benefitsi-Konto in der App eingelöst.</p>
      <p className="mt-2 text-sm text-slate-500">Ausschalten stoppt neue Essensbestellungen. Bestehende Bestellungen, Stornierungen und eigenständige Reservierungen bleiben verwaltbar.</p>
    </section>
    {params.success === 'saved' && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">Freischaltung gespeichert. Die App übernimmt den Status beim Öffnen der Partnerseite oder beim Zurückkehren in die App.</p>}
    {(params.error || failed) && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-900">Die Einstellungen konnten nicht geladen oder gespeichert werden. Bitte Datenbank-Einrichtung und Verbindung prüfen.</p>}
    <form className="flex flex-wrap gap-3"><label className="grow"><span className="sr-only">Partner suchen</span><input type="search" name="q" defaultValue={query} placeholder="Partner suchen, z. B. Knobi" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4" /></label><button className="rounded-xl bg-[#087cd9] px-5 py-2 font-semibold text-white">Suchen</button></form>
    {!failed && <section className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Bestellfreischaltung nach Partner">
      {partners.map(partner => {
        const provider = providers.find(p => p.partner_id === partner.id)
        return <article key={partner.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div><h2 className="font-bold text-[#061829]">{partner.name}</h2><Link className="mt-1 inline-block text-sm text-blue-700 underline" href={provider ? `/partner/commerce?provider=${provider.id}` : '/partner/commerce'}>{provider ? 'Speisekarte, Bilder & Bestellzeiten' : 'Bestellangebot einrichten'}</Link></div>
          {provider ? <OrderingSwitch providerId={provider.id} partnerId={partner.id} partnerName={partner.name} enabled={provider.food_ordering_enabled === true} /> : <span className="text-sm text-slate-500">Noch nicht eingerichtet</span>}
        </article>
      })}
      {!partners.length && <p className="p-6 text-slate-500">Keine passenden Partner gefunden.</p>}
    </section>}
    {partners.length === 250 && <p className="text-sm text-slate-500">Die ersten 250 Treffer werden angezeigt. Grenze die Suche ein, um weitere Partner zu finden.</p>}
  </AdminShell>
}
