'use client'

import { useAdminLocale } from "@/app/admin-language"
import { useFormStatus } from 'react-dom'
import {
  SEO_PROVIDERS,
  validateSeoSetup,
  type SeoSetup,
  type ProfileProvider,
} from '@/lib/seo/seo-setup'
import type { SeoTarget, SeoAuditRun } from '@/lib/seo/seo-data'
import { saveSeoSetupAction, runGoogleMeasurementAction } from './setup-actions'

const fields = {
  name: 'Öffentlicher Unternehmensname',
  address: 'Öffentliche Geschäftsadresse',
  phone: 'Telefon',
  description: 'Beschreibung',
  website: 'Website (HTTPS)',
} as const
const states: Record<string, string> = {
  ok: 'Messung verfügbar',
  partial: 'Teilweise verfügbar',
  unconfigured: 'Nicht eingerichtet',
  no_data: 'Keine Daten im Zeitraum',
  invalid_target: 'Ziel-URL nicht zulässig',
  auth_error: 'Google-Autorisierung erneuern',
  forbidden: 'Zugriff fehlt',
  rate_limited: 'Kontingentgrenze erreicht',
  timeout: 'Zeitüberschreitung',
  invalid_response: 'Antwort nicht auswertbar',
  provider_error: 'Anbieter derzeit nicht verfügbar',
}
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={pending}
      className="rounded-md bg-[#118cff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b75d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#118cff] disabled:opacity-50"
    >
      {pending ? 'Bitte warten …' : children}
    </button>
  )
}
function readSetup(value: unknown): SeoSetup {
  try {
    return validateSeoSetup(value)
  } catch {
    return { business: {}, businessConfirmed: false, profiles: {} }
  }
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function formatMetric(value: unknown, suffix: string, locale: string) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}${suffix}`
    : '—'
}
function EvidenceDetails({ evidence }: { evidence: Record<string, unknown> }) {
  const locale = useAdminLocale()
  const metric = (value: unknown, suffix = "") => formatMetric(value, suffix, locale)
  const data = asRecord(evidence.data)
  const period = asRecord(evidence.period)
  const totals = asRecord(data.totals)
  const categories = asRecord(data.categories)
  const metrics = asRecord(data.metrics)
  const queries = Array.isArray(data.queries) ? data.queries.map(asRecord) : []
  return (
    <div className="mt-3 space-y-3">
      {typeof period.startDate === 'string' &&
        typeof period.endDate === 'string' && (
          <p>
            Zeitraum: {period.startDate} bis {period.endDate} · Pacific Time ·
            finalisierte Daten
          </p>
        )}
      {typeof evidence.scope === 'string' && (
        <p className="break-all">
          Umfang:{' '}
          {evidence.scope === 'property'
            ? 'Gesamte Benefitsi-Property'
            : evidence.scope}
        </p>
      )}
      {evidence.provider === 'gsc' && evidence.data !== null && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Klicks', metric(totals.clicks)],
              ['Impressionen', metric(totals.impressions)],
              [
                'CTR',
                metric(
                  typeof totals.ctr === 'number' ? totals.ctr * 100 : null,
                  '%',
                ),
              ],
              ['Ø Position', metric(totals.averagePosition)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-zinc-500">{label}</dt>
                <dd data-admin-i18n-ignore="true" className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-zinc-500">
            Durchschnittliche Google-Position, kein festes Keyword-Ranking.
            Top-Suchanfragen können anonymisierte Anfragen auslassen.
          </p>
          {queries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {[
                      'Suchanfrage',
                      'Klicks',
                      'Impressionen',
                      'CTR',
                      'Ø Position',
                    ].map((label) => (
                      <th key={label} className="p-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queries.map((row, index) => (
                    <tr key={index} className="border-t border-zinc-100">
                      <td data-admin-i18n-ignore="true" className="p-2">
                        {typeof row.query === 'string' ? row.query : '—'}
                      </td>
                      <td data-admin-i18n-ignore="true" className="p-2">{metric(row.clicks)}</td>
                      <td data-admin-i18n-ignore="true" className="p-2">{metric(row.impressions)}</td>
                      <td data-admin-i18n-ignore="true" className="p-2">
                        {metric(
                          typeof row.ctr === 'number' ? row.ctr * 100 : null,
                          '%',
                        )}
                      </td>
                      <td data-admin-i18n-ignore="true" className="p-2">{metric(row.averagePosition)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Keine einzelnen Suchanfragen verfügbar.</p>
          )}
        </>
      )}
      {evidence.provider === 'psi' && evidence.data !== null && (
        <>
          <p>Mobile Lighthouse-Labordaten · fehlende Werte: —</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['Performance', metric(categories.performance, ' / 100')],
              ['Barrierefreiheit', metric(categories.accessibility, ' / 100')],
              [
                'Best Practices',
                metric(categories['best-practices'], ' / 100'),
              ],
              ['SEO', metric(categories.seo, ' / 100')],
              ['Largest Contentful Paint', metric(metrics.lcpMs, ' ms')],
              ['First Contentful Paint', metric(metrics.fcpMs, ' ms')],
              ['Total Blocking Time', metric(metrics.tbtMs, ' ms')],
              ['Cumulative Layout Shift', metric(metrics.cls)],
              ['Speed Index', metric(metrics.speedIndexMs, ' ms')],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-zinc-500">{label}</dt>
                <dd data-admin-i18n-ignore="true" className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {evidence.data === null && (
        <p className="text-zinc-500">
          Für diesen Versuch liegen keine Messwerte vor.
        </p>
      )}
    </div>
  )
}
export function SeoSetupPanel({
  target,
  audits,
}: {
  target: SeoTarget
  audits: SeoAuditRun[]
}) {
  const setup = readSetup(target.provider_config?.setup)
  function download() {
    const packet = {
      target: target.canonical_url,
      notice:
        'Manuell vorbereitete öffentliche Angaben. Keine automatische Synchronisation oder Verifizierung.',
      ...setup,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `seo-profile-${target.id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section className="space-y-5 rounded-md border border-zinc-200 bg-white p-5">
      <div>
        <h3 className="text-lg font-semibold">
          Profile vorbereiten &amp; Google messen
        </h3>
        <p className="mt-2 text-sm text-zinc-600">
          Vorbereitung für {target.canonical_url}. Öffentliche Angaben
          speichern, dann den jeweiligen Anbieter manuell prüfen. Inhaberschaft
          und Eignung werden hier manuell bestätigt; es gibt keine automatische
          Synchronisation.
        </p>
        <p className="mt-2 text-sm text-amber-800">
          Vor dem Launch bleiben Veröffentlichungs-, noindex- und redaktionelle
          Freigaben bestehen. Ein Profil ist nur bei erfüllten
          Anbieterbedingungen geeignet; eine reine Online-Plattform benötigt
          nicht automatisch einen lokalen Eintrag.
        </p>
      </div>
      {['domain', 'partner_microsite'].includes(target.target_type) ? (
        <>
          <details>
            <summary className="cursor-pointer font-semibold">
              Unternehmensdaten und Profile bearbeiten
            </summary>
            <form action={saveSeoSetupAction} className="mt-4 space-y-5">
              <input type="hidden" name="target_id" value={target.id} />
              <input
                type="hidden"
                name="updated_at"
                value={target.updated_at}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(fields).map(([key, label]) => (
                  <label key={key} className="text-sm">
                    {label}
                    <input
                      name={key}
                      defaultValue={
                        setup.business[key as keyof typeof fields] ?? ''
                      }
                      type={key === 'website' ? 'url' : 'text'}
                      maxLength={
                        key === 'description'
                          ? 2000
                          : key === 'website'
                            ? 2048
                            : 500
                      }
                      className="mt-1 w-full rounded-md border border-zinc-300 p-2"
                    />
                  </label>
                ))}
              </div>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  name="business_confirmed"
                  defaultChecked={setup.businessConfirmed}
                />
                Ich habe die öffentlichen Unternehmensangaben manuell geprüft.
              </label>
              {Object.entries(SEO_PROVIDERS).map(([key, provider]) => {
                const profile = setup.profiles[key as ProfileProvider]
                return (
                  <fieldset
                    key={key}
                    className="space-y-3 rounded-md border border-zinc-200 p-4"
                  >
                    <legend className="px-1 font-semibold">
                      {provider.label}
                    </legend>
                    <p className="text-sm text-zinc-600">{provider.action}</p>
                    <a
                      href={provider.onboarding}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-[#0b75d9] underline"
                    >
                      Offizielle Einrichtung öffnen ↗
                    </a>
                    <p className="text-xs text-zinc-500">
                      Gespeicherter Status:{' '}
                      {profile?.checked
                        ? 'Manuell geprüft'
                        : 'Vorbereitung offen'}
                    </p>
                    <label className="block text-sm">
                      Öffentliche Profil-URL
                      <input
                        name={`${key}_url`}
                        type="url"
                        maxLength={2048}
                        defaultValue={profile?.url ?? ''}
                        className="mt-1 w-full rounded-md border border-zinc-300 p-2"
                      />
                    </label>
                    <div className="flex flex-wrap gap-4 text-sm">
                      {(
                        [
                          [
                            'ownership',
                            'Inhaberschaft bestätigt',
                            profile?.ownershipConfirmed,
                          ],
                          [
                            'eligibility',
                            'Eignung bestätigt',
                            profile?.eligibilityConfirmed,
                          ],
                          [
                            'checked',
                            'Profil manuell geprüft',
                            profile?.checked,
                          ],
                        ] as const
                      ).map(([field, label, checked]) => (
                        <label key={field} className="flex gap-2">
                          <input
                            type="checkbox"
                            name={`${key}_${field}`}
                            defaultChecked={checked ?? false}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )
              })}
              <Submit>Vorbereitung speichern</Submit>
              <p className="text-xs text-zinc-500">
                Speichert nur diese Vorbereitung. Messungen werden separat
                gestartet. Keine Zugangsdaten eingeben.
              </p>
            </form>
          </details>
          <button
            type="button"
            onClick={download}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium"
          >
            Gespeichertes Profilpaket herunterladen
          </button>
        </>
      ) : (
        <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
          Stadt- und redaktionelle Seiten sind keine eigenen Unternehmen. Für
          Unternehmensprofile bitte links das eigene Domain-Ziel oder ein
          Partner-Microsite-Ziel auswählen. Google-Messungen für diese Seite
          bleiben verfügbar.
        </p>
      )}
      <div className="border-t border-zinc-200 pt-4">
        <h4 className="font-semibold">Google-Messungen auf Abruf</h4>
        <p className="my-2 text-sm text-zinc-600">
          Search Console: 28 finalisierte Tage bis vor drei Tagen; Partner und
          Städte nur für ihre kanonische Seite. PageSpeed: mobile
          Lighthouse-Labordaten. Fehlende Zugangsdaten werden als „nicht
          eingerichtet“ erfasst.
        </p>
        <div className="flex flex-wrap gap-3">
          {(['gsc', 'psi'] as const).map((provider) => (
            <form key={provider} action={runGoogleMeasurementAction}>
              <input type="hidden" name="target_id" value={target.id} />
              <input type="hidden" name="provider" value={provider} />
              <Submit>
                {provider === 'gsc'
                  ? 'Search Console prüfen'
                  : 'PageSpeed prüfen'}
              </Submit>
            </form>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <h4 className="font-semibold">Letzte Messbelege für dieses Ziel</h4>
        {audits.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Noch keine Google-Messung gespeichert.
          </p>
        ) : (
          audits.map((audit) => (
            <article
              key={audit.id}
              className="rounded-md border border-zinc-200 p-3 text-sm"
            >
              <p className="font-medium">
                {String(audit.evidence.source ?? 'Google')} ·{' '}
                {states[String(audit.evidence.state)] ?? 'Unbekannter Zustand'}
              </p>
              <p className="mt-1 text-zinc-500">
                Beobachtet:{' '}
                {String(audit.evidence.observedAt ?? audit.created_at)}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-[#0b75d9]">
                  Zeitraum und Messwerte ansehen
                </summary>
                <EvidenceDetails evidence={audit.evidence} />
              </details>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
