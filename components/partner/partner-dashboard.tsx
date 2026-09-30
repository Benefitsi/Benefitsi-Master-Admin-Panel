import { PartnerStatistics } from '@/components/partner/partner-statistics'
import type { Dashboard } from '@/lib/partners/analytics'
import type { ReactNode } from 'react'
import type { Entitlements } from '@/lib/partners/entitlements'
import { canManageProfile } from '@/lib/partners/entitlements'
export function PartnerDashboard({
  partnerId,
  name,
  partners,
  rights,
  active,
  children,
  signOut,
}: {
  partnerId: string
  name: string
  partners: { id: string; name: string }[]
  rights: Entitlements
  active: string
  children: ReactNode
  signOut?: ReactNode
}) {
  const navigation = [
    ['overview', 'Übersicht', '/partner'],
    ['deals', 'Vorteile', '/partner?section=deals'],
    ['statistics', 'Statistiken', '/partner/statistics'],
    ['business', 'Betrieb', '/partner?section=business'],
    ['billing', 'Tarif & Module', '/partner/billing'],
  ].filter(
    ([key]) => !['deals', 'business'].includes(key) || canManageProfile(rights),
  )
  return (
    <main className="min-h-screen bg-[#f7f6f1] text-[#061829]">
      <div className="mx-auto grid min-w-0 grid-cols-[minmax(0,1fr)] max-w-[1480px] lg:min-h-screen lg:grid-cols-[235px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-slate-200 bg-white p-3 sm:p-5 lg:border-b-0 lg:border-r lg:p-7">
          <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
            <div className="shrink-0">
              <a
                href={`/partner?partner=${encodeURIComponent(partnerId)}`}
                className="text-2xl font-black tracking-tight"
              >
                benefitsi<span className="text-[#118cff]">.</span>
              </a>
              <p className="mt-1 hidden text-xs font-bold uppercase tracking-widest text-slate-500 lg:block">
                Partner
              </p>
            </div>
            <div className="min-w-0 text-right lg:mt-7 lg:text-left">
              <h2 className="truncate text-sm font-bold lg:text-base">
                {name}
              </h2>
              <span className="mt-1 inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-800 lg:mt-2 lg:px-3 lg:py-1">
                {rights.plan_code === 'pro' ? 'Pro' : 'Free'}
              </span>
            </div>
          </div>
          <nav
            aria-label="Partnerbereiche"
            className="mt-3 flex min-w-0 max-w-full gap-1 overflow-x-auto pb-1 lg:mt-5 lg:flex-col"
          >
            {navigation.map(([key, label, path]) => (
              <a
                key={key}
                href={`${path}${path.includes('?') ? '&' : '?'}partner=${encodeURIComponent(partnerId)}`}
                aria-current={active === key ? 'page' : undefined}
                className={`shrink-0 rounded-xl px-3 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-sky-600 ${active === key ? 'bg-[#061829] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {label}
              </a>
            ))}
          </nav>
          {partners.length > 1 && (
            <details className="mt-2 text-sm lg:mt-4">
              <summary className="cursor-pointer font-semibold">
                Betrieb wechseln
              </summary>
              <ul className="mt-2 space-y-2">
                {partners.map((p) => (
                  <li key={p.id}>
                    <a
                      href={`/partner?partner=${encodeURIComponent(p.id)}`}
                      className="block rounded-lg p-2 hover:bg-sky-50"
                    >
                      {p.name}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-6 hidden text-xs leading-5 text-slate-500 lg:block">
            Scannen an der Kasse?
            <br />
            Nutze dafür die Benefitsi App.
          </p>
          {signOut && <div className="mt-4">{signOut}</div>}
        </aside>
        <div className="min-w-0 p-5 sm:p-8 lg:p-10">
          <header className="mb-7 border-b border-slate-200 pb-6">
            <p className="text-sm text-slate-500">Dein Betrieb im Überblick</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {navigation.find(([key]) => key === active)?.[1] ?? 'Übersicht'}
            </h1>
          </header>
          {children}
        </div>
      </div>
    </main>
  )
}

export function PartnerOverview({
  partnerId,
  name,
  rights,
  data,
}: {
  partnerId: string
  name: string
  rights: Entitlements
  data?: Dashboard
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">So läuft es bei {name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Letzte 7 Tage · bestätigte Besuche und Einlösungen
          </p>
        </div>
        <a
          className="text-sm font-semibold text-sky-700 underline"
          href={`/partner/statistics?partner=${partnerId}`}
        >
          Alle Statistiken ansehen
        </a>
      </div>
      {data && <PartnerStatistics data={data} compact />}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold">Dein Auftritt bei Benefitsi</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {rights.plan_code === 'free'
            ? 'Free zeigt dein Standardprofil auf der Stadtseite.'
            : 'Pro ermöglicht eine eigene Microsite.'}{' '}
          Basisprofil, Menü und Öffnungszeiten bearbeitest du unter Betrieb.
          Individuelles Layout und Veröffentlichung übernimmt das
          Benefitsi-Team.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-sky-700">
          {canManageProfile(rights) && (
            <>
              <a
                className="underline"
                href={`/partner?section=business&partner=${partnerId}`}
              >
                Betriebsdaten prüfen
              </a>
              <a
                className="underline"
                href={`/partner?section=deals&partner=${partnerId}`}
              >
                Vorteile verwalten
              </a>
            </>
          )}
          <a
            className="underline"
            href={`/partner/billing?partner=${partnerId}`}
          >
            Tarif & Module ansehen
          </a>
        </div>
      </section>
      <section className="mt-4 rounded-2xl bg-[#061829] p-5 text-white">
        <h2 className="font-bold">Bereit für den nächsten Gast?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Öffne die Benefitsi App zum Scannen an der Kasse. Der Partnerbereich
          im Browser hilft dir bei Auswertung und Verwaltung.
        </p>
      </section>
    </>
  )
}
