import { AdminDate } from "@/components/admin-format"
import type { ReactNode } from "react"
import {
  classifyBaseline,
  rankLabel,
  type ComparisonConfig,
  type RankBatch,
  type RankComparison,
} from '@/lib/seo/seo-comparison'
import {
  freezeComparisonAction,
  importComparisonAction,
  addComparisonEventAction,
} from './actions'
import { Submit } from './create-form'
import { inputClass } from './styles'

const panel = 'rounded-md border border-zinc-200 bg-white p-5 shadow-sm'
const baselineLabels = {
  before_partner: 'Vor der Partnerschaft',
  before_package: 'Vor dem SEO-Paket',
  since_measurement: 'Ab Messbeginn · kein belegter Vorher-Stand',
}
function date(value: string | null) {
  return value ? <AdminDate value={value} options={{ dateStyle: "medium", timeZone: "UTC" }} /> : "Noch nicht dokumentiert"
}
function Hidden({
  targetId,
  updatedAt,
}: {
  targetId: string
  updatedAt: string
}) {
  return (
    <>
      <input type="hidden" name="target_id" value={targetId} />
      <input type="hidden" name="updated_at" value={updatedAt} />
    </>
  )
}
export function ComparisonReport({
  targetId,
  targetStatus,
  updatedAt,
  partnerName,
  config,
  batches,
  events,
  asOf,
  today,
  report,
}: {
  targetId: string
  targetStatus: string
  updatedAt: string
  partnerName: string
  config: ComparisonConfig
  batches: RankBatch[]
  events: { id: string; note: string; occurredOn: string; recordedAt: string }[]
  asOf: string
  today: string
  report: RankComparison
}) {
  const baseline = config.baseline
  const earliest = [...batches]
    .filter((b) => b.results.some((r) => r.state !== 'unknown'))
    .sort(
      (a, b) =>
        a.observedOn.localeCompare(b.observedOn) ||
        a.recordedAt.localeCompare(b.recordedAt),
    )[0]
  const current = report.current
  const latest = batches[0]
  const stale =
    current &&
    Date.parse(today) - Date.parse(current.observedOn) > 30 * 86400000
  const timeline = [
    ...events,
    ...(config.partnerSince
      ? [
          {
            id: 'partnership',
            occurredOn: config.partnerSince,
            note: 'Partnerschaft begonnen',
          },
        ]
      : []),
    ...(config.packageStartedOn
      ? [
          {
            id: 'package',
            occurredOn: config.packageStartedOn,
            note: 'SEO-Paket begonnen',
          },
        ]
      : []),
  ].sort(
    (a, b) =>
      b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id),
  )
  return (
    <>
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0b75d9]">
              {config.channel === 'maps'
                ? 'Google Maps'
                : 'Google-Suche · Organisch'}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{<span data-admin-i18n-ignore="true">{partnerName}</span>}</h2>
            <a
              href={config.subjectUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block break-all text-sm text-[#0b75d9] hover:underline"
            >
              {config.subjectUrl}
            </a>
          </div>
          <a
            href={`/seo/partnervergleich/export?target=${encodeURIComponent(targetId)}&asof=${asOf}`}
            className="rounded-md border border-[#118cff] px-4 py-2 text-sm font-semibold text-[#0b75d9] hover:bg-[#f3f8ff]"
          >
            Vergleich als CSV
          </a>
        </div>
        <p className="mt-4 text-sm text-zinc-600">
          {config.keywords.length} Keywords · {<span data-admin-i18n-ignore="true">{config.location}</span>} ·{' '}
          {config.device === 'mobile' ? 'Mobil' : 'Desktop'} · {config.locale}
          {config.channel === 'maps'
            ? ` · Suchpunkt ${config.latitude}, ${config.longitude}`
            : ''}
        </p>
        {targetStatus !== 'active' && (
          <p className="mt-3 rounded-md bg-[#f3f8ff] p-3 text-sm text-[#061829]">
            Automatische Messung pausiert. Anbieter und Zugang müssen zuerst
            eingerichtet werden. Belegte Messstände können bereits importiert
            werden.
          </p>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Milestone title="Partner seit" value={date(config.partnerSince)} />
          <Milestone
            title="SEO-Paket seit"
            value={date(config.packageStartedOn)}
          />
          <Milestone
            title="Fester Ausgangsstand"
            value={
              baseline
                ? date(baseline.observedOn)
                : 'Noch keine Ausgangsmessung'
            }
          />
        </div>
        <p className="mt-4 text-xs leading-5 text-zinc-500">
          Messbedingungen und Keyword-Set bleiben für diesen Vergleich fest. Pro
          Messziel wird derzeit ein fester Ort und ein Gerät unterstützt.
          Bestehende Webseite, Benefitsi-Partnerseite und Maps-Profil haben
          jeweils ein eigenes Messziel. Suchpositionen der Website und des
          Maps-Profils werden nicht zusammengerechnet.
        </p>
      </section>
      {!baseline && (
        <section className="rounded-md border border-[#b8dcff] bg-[#f3f8ff] p-5">
          <h3 className="font-semibold">Ausgangsmessung festschreiben</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-700">
            {earliest
              ? <>Die früheste belegte Messung vom {date(earliest.observedOn)} wird dauerhaft als Ausgangsstand gespeichert. Spätere Importe ersetzen sie nicht.</>
              : 'Noch keine belegte Position vorhanden. Ein vollständiger Ranking-Export oder passende Daten eines eingerichteten Ranktrackers bilden die Grundlage. Fehlende Rankings werden nicht geschätzt.'}
          </p>
          <form action={freezeComparisonAction} className="mt-4">
            <Hidden targetId={targetId} updatedAt={updatedAt} />
            <Submit disabled={!earliest}>Ausgangsmessung festschreiben</Submit>
          </form>
        </section>
      )}
      <section className={panel}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Vorher / Nachher</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {baseline
                ? baselineLabels[classifyBaseline(config, baseline)]
                : 'Ausgangsstand fehlt'}
            </p>
          </div>
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="target" value={targetId} />
            <label className="text-xs text-zinc-600">
              Vergleich bis
              <input
                type="date"
                name="asof"
                max={today}
                defaultValue={asOf}
                className={inputClass}
              />
            </label>
            <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
              Anzeigen
            </button>
          </form>
        </div>
        {baseline && !current && (
          <p className="mt-4 rounded-md bg-[#f3f8ff] p-3 text-sm leading-6 text-[#061829]">
            Noch keine spätere, vergleichbare Messung
            {config.packageStartedOn ? ' nach Beginn des SEO-Pakets' : ''}.
            Anbieter und Methode müssen zur Ausgangsmessung passen.
          </p>
        )}
        {stale && (
          <p className="mt-4 text-sm text-amber-800">
            Der letzte vergleichbare Stand ist älter als 30 Tage.
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Metric label="Verbessert" value={current ? report.improved : null} />
          <Metric
            label="Verschlechtert"
            value={current ? report.declined : null}
          />
          <Metric
            label="Unverändert"
            value={current ? report.unchanged : null}
          />
          <Metric label="Nicht vergleichbar" value={report.unavailable} />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500">
              <tr>
                <th className="py-3 pr-3">Keyword</th>
                <th className="px-3 py-3">
                  Ausgangsstand
                  <br />
                  {baseline ? date(baseline.observedOn) : '—'}
                </th>
                <th className="px-3 py-3">
                  Vergleichsstand
                  <br />
                  {current ? date(current.observedOn) : '—'}
                </th>
                <th className="px-3 py-3">Veränderung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {report.rows.map((row) => (
                <tr key={row.keyword}>
                  <td className="py-3 pr-3 font-medium">{<span data-admin-i18n-ignore="true">{row.keyword}</span>}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {rankLabel(row.before, baseline?.depth ?? null)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {rankLabel(row.after, current?.depth ?? null)}
                  </td>
                  <td
                    className={`px-3 py-3 font-medium ${row.change === 'up' || row.change === 'entered' ? 'text-[#0b75d9]' : row.change === 'down' || row.change === 'left' ? 'text-rose-700' : 'text-zinc-500'}`}
                  >
                    {row.delta !== null
                      ? row.delta > 0
                        ? `↑ ${row.delta} Plätze`
                        : row.delta < 0
                          ? `↓ ${Math.abs(row.delta)} Plätze`
                          : 'Unverändert'
                      : row.change === 'entered'
                        ? `Neu in Top ${current?.depth}`
                        : row.change === 'left'
                          ? `Nicht mehr in Top ${current?.depth}`
                          : row.change === 'outside'
                            ? 'Weiter außerhalb'
                            : 'Nicht vergleichbar'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {baseline && (
          <p className="mt-4 text-xs leading-5 text-zinc-600">
            Quelle: {baseline.provider} · {baseline.method} ·{' '}
            {baseline.source === 'import'
              ? 'Belegter manueller Import'
              : 'Ranktracker'}
            {baseline.depth ? ` · Top ${baseline.depth}` : ''}. Ausgangsbeleg:{' '}
            {baseline.reference}
            {current
              ? ` · Vergleichsbeleg: ${current.reference} (${current.source === 'import' ? 'Import' : 'Tracker'}${current.depth ? `, Top ${current.depth}` : ', Suchtiefe nicht übermittelt'})`
              : ''}
            .
          </p>
        )}
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          {report.paired} von {config.keywords.length} Keywords haben an beiden
          Zeitpunkten eine konkrete Position. Außerhalb der Trefferliste
          liegende Positionen werden nur bei gleicher Suchtiefe verglichen.
          „Nicht gefunden“ ist kein letzter Platz; „nicht gemessen“ ist kein
          Nullwert. Veränderungen zeigen die Entwicklung und belegen für sich
          allein keine ausschließliche Wirkung von Benefitsi.
        </p>
      </section>
      <section className={panel}>
        <h3 className="text-lg font-semibold">Messverlauf</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Passende gespeicherte Ranktracker-Daten erscheinen hier automatisch.
          Neue externe Ziele bleiben bis zur Einrichtung und Freigabe des
          Messanbieters pausiert. Ein Google-Unternehmensprofil allein liefert
          keine Keyword-Rangmessung.
        </p>
        {batches.length === 0 ? (
          <p className="mt-4 rounded-md bg-zinc-50 p-4 text-sm text-zinc-500">
            Noch keine belastbare Rangmessung für diese Suchbedingungen. Für die
            automatische Erfassung muss ein Ranking-Anbieter verbunden werden.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs text-zinc-500">
                <tr>
                  <th className="py-2">Messtag</th>
                  <th>Quelle / Methode</th>
                  <th>Erfasst</th>
                  <th>Beleg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {batches.slice(0, 30).map((b) => (
                  <tr key={b.id}>
                    <td className="py-3 pr-3">{date(b.observedOn)}</td>
                    <td className="pr-3">
                      {b.provider}
                      <span className="block text-xs text-zinc-500">
                        {b.method} ·{' '}
                        {b.source === 'import' ? 'Import' : 'Tracker'}
                      </span>
                    </td>
                    <td className="pr-3">
                      {b.results.filter((r) => r.state !== 'unknown').length}/
                      {config.keywords.length}
                    </td>
                    <td className="max-w-xs break-words text-xs text-zinc-500">
                      {b.reference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {batches.length > 30 && (
              <p className="mt-3 text-xs text-zinc-500">
                Die 30 neuesten von {batches.length} Messständen. Der Vergleich
                berücksichtigt die vollständige gespeicherte Historie.
              </p>
            )}
          </div>
        )}
        <details className="mt-5 border-t border-zinc-200 pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#0b75d9]">
            Belegten Messstand erfassen oder historischen Export übernehmen
          </summary>
          <form action={importComparisonAction} className="mt-4 space-y-4">
            <Hidden targetId={targetId} updatedAt={updatedAt} />
            <p className="text-sm leading-6 text-zinc-600">
              Nur Google-Keyword-Rangmessungen für genau dieses Ziel, diesen Ort
              und dieses Gerät. Durchschnittspositionen aus Search Console
              gehören in die separate Google-Messung.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Messtag
                <input
                  type="date"
                  name="observed_on"
                  max={today}
                  defaultValue={today}
                  required
                  className={inputClass}
                />
              </label>
              <label className="text-sm">
                Messanbieter
                <input
                  name="provider"
                  defaultValue={baseline?.provider ?? latest?.provider ?? ''}
                  required
                  maxLength={100}
                  placeholder="Name des Ranktrackers"
                  className={inputClass}
                />
              </label>
              <label className="text-sm">
                Messmethode / Version
                <input
                  name="method"
                  defaultValue={baseline?.method ?? latest?.method ?? ''}
                  required
                  maxLength={100}
                  placeholder="Methodenkennung aus dem Report"
                  className={inputClass}
                />
              </label>
              <label className="text-sm">
                Geprüfte Suchtiefe
                <input
                  name="depth"
                  type="number"
                  min={10}
                  max={1000}
                  defaultValue={baseline?.depth ?? 100}
                  required
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block text-sm">
              Originalbeleg / Report-Referenz
              <input
                name="reference"
                required
                maxLength={1000}
                placeholder="Dateiname oder öffentliche Report-Adresse"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              Messwerte einfügen
              <textarea
                name="rows"
                required
                rows={Math.min(10, config.keywords.length + 1)}
                defaultValue={config.keywords.map((k) => `${k};?;`).join('\n')}
                className={`${inputClass} font-mono text-xs`}
              />
              <span className="mt-2 block text-xs leading-5 text-zinc-500">
                Ohne Kopfzeile: Keyword;Position;Treffer-URL. Beispiel:
                Suchbegriff;12;{config.subjectUrl}. Kein Treffer innerhalb Top
                100: Suchbegriff;&gt;100;. Fehlende Messung: Suchbegriff;?;.
                Jedes Keyword genau einmal.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm leading-6">
              <input
                name="confirmed"
                type="checkbox"
                required
                className="mt-1 accent-[#118cff]"
              />
              <span>
                Ich habe den Originalbeleg, das Messziel und die
                übereinstimmenden Suchbedingungen geprüft.
              </span>
            </label>
            <Submit>Messstand speichern</Submit>
          </form>
        </details>
      </section>
      <section className={panel}>
        <h3 className="text-lg font-semibold">SEO-Paket &amp; Maßnahmen</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Erledigte Maßnahmen mit Datum dokumentieren, zum Beispiel Profil
          korrigiert, Partnerseite veröffentlicht oder Website-Inhalte
          verbessert.
        </p>
        <ol className="mt-4 space-y-3 border-l-2 border-[#b8dcff] pl-4 text-sm">
          {timeline.map((e) => (
            <li key={e.id}>
              <strong>{date(e.occurredOn)}</strong> · {e.id === "partnership" || e.id === "package" ? e.note : <span data-admin-i18n-ignore="true">{e.note}</span>}
            </li>
          ))}
        </ol>
        <form action={addComparisonEventAction} className="mt-5 space-y-3">
          <Hidden targetId={targetId} updatedAt={updatedAt} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Art
              <select name="kind" className={inputClass}>
                <option value="note">Erledigte Maßnahme</option>
                {!config.partnerSince && (
                  <option value="partnership">
                    Tatsächlichen Beginn der Partnerschaft festhalten
                  </option>
                )}
                {!config.packageStartedOn && (
                  <option value="package">
                    Tatsächlichen Beginn des SEO-Pakets festhalten
                  </option>
                )}
              </select>
            </label>
            <label className="text-sm">
              Datum
              <input
                name="occurred_on"
                type="date"
                max={today}
                defaultValue={today}
                required
                className={inputClass}
              />
            </label>
          </div>
          <label className="block text-sm">
            Maßnahme / Ergebnis
            <textarea
              name="note"
              rows={2}
              maxLength={1500}
              placeholder="Was wurde tatsächlich umgesetzt?"
              className={inputClass}
            />
          </label>
          <Submit>Im Verlauf dokumentieren</Submit>
        </form>
      </section>
    </>
  )
}
function Milestone({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-[#f3f8ff] p-3">
      <p className="text-xs text-[#0b75d9]">{title}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  )
}
function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
    </div>
  )
}
