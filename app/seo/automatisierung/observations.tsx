import type { StoredObservation } from '@/lib/seo/collection-store'
import { collectionLabels, collectionStateLabels, type CollectionKind } from '@/lib/seo/collection-config'
import { retryCollectionRun } from './actions'

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('de-DE').format(value) : 'Noch keine Daten'
const text = (value: unknown) => typeof value === 'string' && value ? value : 'Noch keine Daten'
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const date = (value: unknown) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return 'Noch keine Daten'
  return new Intl.DateTimeFormat('de-DE', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'}).format(new Date(value))
}
export function WebLink({value}: {value: unknown}) {
  if (typeof value !== 'string') return <span>Noch keine Daten</span>
  let safeHref: string | null = null
  try {
    const url = new URL(value)
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) safeHref = url.href
  } catch { /* Display the text without a link. */ }
  return safeHref ? <a className="break-all text-[#0b75d9] underline" href={safeHref} target="_blank" rel="noopener noreferrer">{value}</a> : <span>{value}</span>
}
const findingLabels: Record<string, string> = {
  missing_title: 'Seitentitel fehlt', noindex: 'Noindex beobachtet', broken_link: 'Defekter Link',
  page_error: 'Seitenfehler', link_check_failed: 'Linkprüfung fehlgeschlagen',
}
function Website({data}: {data: Record<string, unknown>}) {
  const pages = Array.isArray(data.pages) ? data.pages : null
  const findings = Array.isArray(data.findings) ? data.findings : null
  return <div className="space-y-2">
    <p>{pages ? number(pages.length) : 'Noch keine Daten'} Seiten, {number(data.linksChecked)} Links geprüft. Noindex ist eine Beobachtung, keine automatische Änderung.</p>
    {findings === null ? <p>Befunde: Noch keine Daten</p> : findings.length ? <ul className="list-disc space-y-1 pl-5">{findings.map((raw, index) => { const row = record(raw); return <li key={index}>{findingLabels[String(row.code)] ?? 'Befund'}: <WebLink value={row.url}/>{typeof row.status === 'number' ? ` · HTTP ${row.status}` : ''}</li> })}</ul> : <p>Keine Befunde erfasst.</p>}
  </div>
}
function Gsc({data}: {data: Record<string, unknown>}) {
  const periods = list(data.periods)
  if (!periods.length) return <p>Noch keine Daten</p>
  return <div className="space-y-3">{periods.map((raw, index) => {
    const period = record(raw), totals = record(period.totals), queries = list(period.queries)
    return <div key={index} className="border-l-2 border-[#b8dcff] pl-3">
      <p className="font-medium">{text(period.startDate)}–{text(period.endDate)} · 28 Tage</p>
      <p>Klicks {number(totals.clicks)} · Impressionen {number(totals.impressions)} · CTR {typeof totals.ctr === 'number' ? `${(totals.ctr * 100).toLocaleString('de-DE', {maximumFractionDigits: 1})} %` : 'Noch keine Daten'} · Durchschnittsposition {number(totals.averagePosition)} (kein Keyword-Rang)</p>
      {queries.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-[#0b75d9]">Top-Suchanfragen · Stichprobe bis 100</summary><ul className="mt-1 list-disc pl-5">{queries.slice(0, 100).map((item, rowIndex) => {const query = record(item); return <li key={rowIndex}>{text(query.query)} · {number(query.clicks)} Klicks · Durchschnittsposition {number(query.averagePosition)}</li>})}</ul></details>}
    </div>
  })}<p className="text-xs text-zinc-500">Anonymisierte Suchanfragen können in der Stichprobe fehlen. Die beiden Zeiträume bleiben getrennt.</p></div>
}
const gbpLabels: Record<string, string> = {
  businessImpressionsDesktopMaps: 'Maps-Impressionen Desktop', businessImpressionsMobileMaps: 'Maps-Impressionen Mobil',
  businessImpressionsDesktopSearch: 'Suche-Impressionen Desktop', businessImpressionsMobileSearch: 'Suche-Impressionen Mobil',
  websiteClicks: 'Website-Klicks', callClicks: 'Klicks auf Anrufen', directionRequests: 'Routenanfragen',
}
function Gbp({data}: {data: Record<string, unknown>}) {
  const periods = list(data.periods)
  if (!periods.length) return <p>Noch keine Daten</p>
  return <div className="space-y-3">{periods.map((raw, index) => {
    const period = record(raw), metrics = record(period.metrics), coverage = record(period.coverage)
    return <div key={index} className="border-l-2 border-[#b8dcff] pl-3">
      <p className="font-medium">{text(period.startDate)}–{text(period.endDate)} · 28 Tage</p>
      <ul className="mt-1 grid gap-x-5 sm:grid-cols-2">{Object.entries(gbpLabels).map(([key, label]) => {
        const observed = record(coverage[key]), days = typeof observed.observedDays === 'number' && Number.isInteger(observed.observedDays) && observed.observedDays >= 0 && observed.observedDays <= 28 ? observed.observedDays : null
        return <li key={key}>{label}: {number(metrics[key])} · {days === null ? 'Abdeckung: Noch keine Daten' : `${days}/28 Tage`}{days === null ? '' : observed.complete === false ? ' (Teilsumme)' : observed.complete === true ? '' : ' (Abdeckung unklar)'}</li>
      })}</ul>
    </div>
  })}<p className="text-xs text-zinc-500">Anruf-Klicks sind keine abgeschlossenen Anrufe. Teilsummen sind keine vollständigen 28-Tage-Werte.</p></div>
}
const psiLabels: Record<string, string> = {performance: 'Leistung', accessibility: 'Barrierefreiheit', 'best-practices': 'Best Practices', seo: 'SEO'}
const metricLabels: Record<string, string> = {lcpMs: 'LCP', fcpMs: 'FCP', tbtMs: 'TBT', cls: 'CLS', speedIndexMs: 'Speed Index'}
function Psi({data}: {data: Record<string, unknown>}) {
  if (!Object.keys(data).length) return <p>Noch keine Daten</p>
  const categories = record(data.categories), metrics = record(data.metrics)
  return <div><p>Mobile Labormessung · <WebLink value={data.finalUrl}/></p><p>{Object.entries(psiLabels).map(([key, label]) => `${label}: ${number(categories[key])}`).join(' · ')}</p><p>{Object.entries(metricLabels).map(([key, label]) => `${label}: ${number(metrics[key])}${key === 'cls' || metrics[key] == null ? '' : ' ms'}`).join(' · ')}</p></div>
}
function Rank({data}: {data: Record<string, unknown>}) {
  const results = list(data.results)
  if (!results.length) return <p>Noch keine Daten</p>
  return <div><p>{number(data.known)} von {number(data.total)} Keywords mit auswertbarem Zustand · organische Top 10</p>
    <ul className="mt-1 list-disc pl-5">{results.map((raw, index) => {const row = record(raw); return <li key={index}>{text(row.keyword)}: {row.state === 'ranked' ? `Platz ${number(row.position)}` : row.state === 'outside' ? 'außerhalb Top 10' : 'unbekannt'}{row.state === 'ranked' && row.rankingUrl ? <> · <WebLink value={row.rankingUrl}/></> : null}</li>})}</ul>
    <p className="mt-1 text-xs text-zinc-500">Eine Veränderung kann erst mit einem ausdrücklich festgeschriebenen Ausgangsstand bewertet werden.</p>
  </div>
}
export function Observations({history, targetId}: {history: StoredObservation[]; targetId: string}) {
  if (!history.length) return <p className="text-sm text-zinc-600">Noch keine Messläufe für dieses Ziel.</p>
  return <ol className="divide-y divide-zinc-200">{history.map(run => <li key={run.id} className="py-4 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="font-semibold text-[#061829]">{collectionLabels[run.kind as CollectionKind] ?? run.kind} · {collectionStateLabels[run.state] ?? collectionStateLabels[run.status] ?? 'Prüfung erforderlich'}</p>
        <p className="text-xs text-zinc-500">Beobachtet {date(run.observed_at)} · Angelegt {date(run.created_at)} · Quelle {text(run.source)} · Methode {text(run.method)} · Versuch {run.attempts}/3</p></div>
      {(run.status === 'failed' || run.status === 'blocked') && run.attempts < 3 && <form action={retryCollectionRun}><input type="hidden" name="target_id" value={targetId}/><input type="hidden" name="run_id" value={run.id}/><button className="rounded-md border border-[#b8dcff] px-3 py-1 text-sm text-[#0b75d9] hover:bg-[#f3f8ff]">Erneut versuchen</button></form>}
    </div>
    <div className="mt-2 text-sm leading-6 text-zinc-700">{run.data ? run.kind === 'crawl' ? <Website data={record(run.data)}/> : run.kind === 'gsc' ? <Gsc data={record(run.data)}/> : run.kind === 'gbp' ? <Gbp data={record(run.data)}/> : run.kind === 'psi' ? <Psi data={record(run.data)}/> : run.kind === 'rank' ? <Rank data={record(run.data)}/> : <p>Noch keine Daten</p> : <p>Noch keine Daten</p>}</div>
  </li>)}</ol>
}
