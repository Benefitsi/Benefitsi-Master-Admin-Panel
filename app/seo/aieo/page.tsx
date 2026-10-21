import Link from 'next/link'
import { AdminShell } from '@/app/admin-shell'
import { requireAdmin } from '@/lib/admin'
import { AI_REPORT_PROVIDERS, normalizeAiReportRows, type AiReportRow } from '@/lib/seo/ai-report-import'
import { importAiReport } from './actions'
export const dynamic = 'force-dynamic'
const field = 'mt-1 w-full rounded-lg border border-[#061829]/20 bg-white px-3 py-2'
const messages: Record<string,string> = {
  saved: 'Berichtswert mit Quelle und Zeitraum gespeichert.', duplicate: 'Dieser Export wurde bereits erfasst. Er wird nicht doppelt gespeichert.',
  invalid: 'Bitte Quelle, Messziel, Zeitraum, ganzen Messwert und Exportdatum prüfen und den Originalbeleg bestätigen.',
  unavailable: 'Der Bericht konnte nicht gespeichert werden. Bitte Einrichtung oder Zugriff prüfen.',
}
export default async function AiReportsPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { supabase, adminSession } = await requireAdmin()
  const params = await searchParams
  const [targets, reports] = await Promise.all([
    supabase.from('seo_targets').select('id,canonical_url').eq('status','active').order('canonical_url').limit(200).abortSignal(AbortSignal.timeout(8000)),
    supabase.from('seo_ai_report_imports').select('id,target_id,provider,report_scope,scope_url,period_start,period_end,report_timezone,metric_value,exported_at,imported_at').order('exported_at',{ascending:false}).limit(50).abortSignal(AbortSignal.timeout(8000)),
  ])
  let rows: AiReportRow[] | null = null
  try { if (!reports.error) rows = normalizeAiReportRows(reports.data) } catch { /* Missing/invalid evidence never becomes a zero. */ }
  const available = !targets.error && Array.isArray(targets.data) && rows !== null
  return <AdminShell title="Offizielle KI-Sichtbarkeit" subtitle="Datierte Berichtswerte aus Search Console und Bing Webmaster Tools" adminName={adminSession.profile?.display_name || adminSession.user.email || 'Admin'}>
    <section className="space-y-5 rounded-2xl border border-[#061829]/10 bg-white p-5 text-[#061829]">
      <div className="flex flex-wrap gap-4 text-sm font-semibold"><Link href="/analytics#aieo-measurement">Nutzung und Einlösungen</Link><Link href="/seo">SEO-Übersicht</Link></div>
      <p className="text-sm leading-6">Google Search generative AI liefert KI-Impressionen, Bing AI Performance Zitate. Diese Angaben messen Sichtbarkeit und sind keine Websitebesuche oder Einlösungen. Markennennungen aus festen Frageproben werden separat dokumentiert. Dieser Bereich enthält ausschließlich offizielle Berichtswerte; es besteht hier kein automatischer API-Abruf. Trage ausschließlich den Gesamtwert eines echten Berichts ohne Länder-, Geräte- oder Themenfilter ein.</p>
      <div className="flex flex-wrap gap-4 text-sm underline">{Object.values(AI_REPORT_PROVIDERS).map(provider => <a key={provider.label} href={provider.url} target="_blank" rel="noreferrer">{provider.label} öffnen</a>)}</div>
      {params.state && messages[params.state] && <p role="status" className="rounded-lg bg-[#f3f8ff] p-3 text-sm">{messages[params.state]}</p>}
      {!available ? <p role="status">Die Berichtswerte sind nicht verfügbar. Bitte Datenbankeinrichtung und Zugriffsrechte prüfen. Es werden keine Nullwerte angenommen.</p> : <>
        <form action={importAiReport} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">SEO-Messziel<select className={field} name="target_id" required defaultValue=""><option value="" disabled>Vorhandenes Messziel wählen</option>{targets.data?.map(target => <option value={target.id} key={target.id}>{target.canonical_url}</option>)}</select></label>
          <label className="text-sm">Originalbericht<select className={field} name="provider" required><option value="google_search_generative_ai">Google · KI-Impressionen</option><option value="bing_ai_performance">Bing · Zitate</option></select></label>
          <label className="text-sm">Berichtsumfang<select className={field} name="report_scope"><option value="page">Exakte Seite des Messziels</option><option value="property">Gesamte Property (nur benefitsi.de als Messziel)</option></select></label>
          <label className="text-sm">Zeitzone laut Bericht<select className={field} name="report_timezone" defaultValue="provider_unspecified"><option value="provider_unspecified">Im Bericht nicht angegeben</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="UTC">UTC</option><option value="Europe/Berlin">Europe/Berlin</option></select></label>
          <label className="text-sm">Zeitraum von<input className={field} name="period_start" type="date" required /></label>
          <label className="text-sm">Zeitraum bis einschließlich (max. 93 Tage)<input className={field} name="period_end" type="date" required /></label>
          <label className="text-sm">Original-Gesamtwert<input className={field} name="metric_value" type="text" inputMode="numeric" pattern="[0-9]+" required placeholder="Nur gemessene ganze Zahl; 0 nur laut Bericht" /></label>
          <label className="text-sm">Export erstellt (UTC)<input className={field} name="exported_at" type="datetime-local" required /></label>
          <label className="flex items-start gap-2 text-sm md:col-span-2"><input className="mt-1" type="checkbox" name="evidence_confirmed" required />Ich habe den Originalbericht geprüft: Quelle, exakte Seite bzw. Property, Zeitraum und ungefilterter Gesamtwert stimmen überein. Fehlende Daten wurden nicht durch 0 ersetzt.</label>
          <button className="w-fit rounded-lg bg-[#061829] px-4 py-2 text-sm font-bold text-white" type="submit">Berichtswert speichern</button>
        </form>
        <h2 className="text-lg font-bold">Neueste 50 Importe</h2>
        {rows?.length === 0 ? <p className="text-sm">Noch kein offizieller Berichtswert importiert. KI-Sichtbarkeit ist damit unbekannt.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Quelle / Umfang</th><th className="p-2">Zeitraum / Zeitzone</th><th className="p-2">Originalwert</th><th className="p-2">Export (UTC)</th></tr></thead><tbody>{rows?.map(row => <tr key={row.id} className="border-t"><td className="p-2">{AI_REPORT_PROVIDERS[row.provider].label}<br /><span className="break-all text-xs">{row.scope_url} · {row.report_scope === 'page' ? 'Seite' : 'Property'}</span></td><td className="p-2">{row.period_start} – {row.period_end}<br /><span className="text-xs">{row.report_timezone === 'provider_unspecified' ? 'Zeitzone nicht angegeben' : row.report_timezone}</span></td><td className="p-2">{row.metric_value.toLocaleString('de-DE')} {AI_REPORT_PROVIDERS[row.provider].metric}</td><td className="p-2">{row.exported_at.replace('T',' ').replace('.000Z','')}</td></tr>)}</tbody></table></div>}
        <p className="text-xs leading-5 text-[#526170]">Einzelne Belege werden nicht addiert: Zeiträume können sich überschneiden. Unterschiedliche Quellen, Zeitzonen und Berichtsumfänge sind nicht direkt vergleichbar. Importe belegen den manuell geprüften Export; sie bestätigen keine laufende Providerverbindung.</p>
      </>}
    </section>
  </AdminShell>
}
