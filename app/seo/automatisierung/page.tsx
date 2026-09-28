import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { getCollectionOverview } from '@/lib/seo/collection-store'
import { getCollectionHealth } from '@/lib/seo/collection-health'
import { readComparisonConfig } from '@/lib/seo/seo-comparison'
import { AdminShell } from '@/app/admin-shell'
import { configureCollectionSchedule, disconnectGoogleCollection, queueCollectionNow, saveCollectionRuntime, saveCollectionSettings } from './actions'
import { Observations, WebLink } from './observations'

export const dynamic = 'force-dynamic'
const noticeMessages: Record<string, string> = {
  google_setup: 'Google OAuth ist serverseitig noch nicht vollständig eingerichtet.',
  google_error: 'Die Google-Verbindung konnte nicht eingerichtet werden. Bitte erneut versuchen.',
  google_state: 'Die Google-Anmeldung ist abgelaufen oder konnte nicht zugeordnet werden. Bitte erneut verbinden.',
  google_scope: 'Die erforderliche Google-Berechtigung wurde nicht erteilt.',
  google_refresh: 'Google hat keinen dauerhaften Zugang zurückgegeben. Bitte die Verbindung erneut freigeben.',
  google_connected: 'Die Google-Verbindung wurde gespeichert.',
}
const savedMessages: Record<string, string> = {
  settings: 'Einstellungen gespeichert. Fällige Messungen werden beim nächsten Prüflauf eingeplant.',
  runtime: 'Betrieb und Monatslimit gespeichert. Bereits verbrauchte Abfragen bleiben erhalten.',
  schedule: 'Zeitplan eingerichtet. Der geschützte Worker wird alle 15 Minuten aufgerufen.',
  queued: 'Fällige Messungen wurden eingeplant und der Worker wurde angestoßen. Ergebnisse erscheinen nach Abschluss.',
  retry: 'Erneuter Versuch wurde in die Warteschlange gestellt.',
  disconnected: 'Diese Google-Verbindung wurde entfernt.',
}
const errorMessages: Record<string, string> = {
  invalid_target: 'Dieses Messziel ist nicht verfügbar.',
  property_mismatch: 'Die Search-Console-Property muss zur Webadresse dieses Messziels gehören.',
  property_required: 'Bitte eine passende Search-Console-Property eintragen.',
  invalid_gbp_location: 'Der Profilstandort muss das Format locations/123456 haben.',
  gbp_location_required: 'Bitte die Google-Profilkennung eintragen.',
  comparison_required: 'Für die Rangprüfung zuerst einen organischen Partnervergleich einrichten.',
  maps_unsupported: 'Automatische Maps-Rangmessungen sind derzeit nicht verfügbar.',
  comparison_mismatch: 'Der Partnervergleich gehört nicht zu diesem Messziel.',
  invalid_limit: 'Bitte ein ganzzahliges Monatslimit zwischen 0 und 4.500 eingeben.',
  free_confirmation_required: 'Ein positives Limit erfordert die Bestätigung des kostenlosen Tarifs.',
  missing_cron_secret: 'CRON_SECRET muss serverseitig eingerichtet sein.',
  retry_unavailable: 'Dieser Lauf kann nicht erneut gestartet werden.',
  storage: 'Speichern derzeit nicht möglich. Bitte erneut versuchen.',
}
const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('de-DE', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin'}).format(new Date(value))
  : 'Noch keine Daten'
const field = 'mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-[#061829] focus:border-[#0b75d9] focus:outline-none'
const button = 'rounded-md bg-[#0b75d9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0867c1] disabled:cursor-not-allowed disabled:opacity-50'
const secondary = 'rounded-md border border-[#b8dcff] px-4 py-2 text-sm font-medium text-[#0b75d9] hover:bg-[#f3f8ff] disabled:cursor-not-allowed disabled:opacity-50'
function Check({name, label, defaultChecked, detail}: {name: string; label: string; defaultChecked?: boolean; detail?: string}) {
  return <label className="flex items-start gap-3 py-1.5 text-sm"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4 accent-[#0b75d9]"/><span><span className="font-medium text-[#061829]">{label}</span>{detail && <span className="block text-zinc-600">{detail}</span>}</span></label>
}
function GoogleConnection({provider, name, connectedAt, ready, targetId}: {provider: 'gsc'|'gbp'; name: string; connectedAt: string|null; ready: boolean; targetId: string}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 py-3 first:border-0 first:pt-0 last:pb-0">
    <div><p className="font-medium">{name}</p><p className="text-sm text-zinc-600">{connectedAt ? `Verbunden am ${date(connectedAt)}` : ready ? 'Noch nicht verbunden' : 'OAuth-Einrichtung fehlt'}</p></div>
    <div className="flex flex-wrap gap-2">{ready && <form action="/api/seo/google/connect" method="post"><input type="hidden" name="provider" value={provider}/><button className={secondary}>{connectedAt ? 'Neu verbinden' : 'Verbinden'}</button></form>}
      {connectedAt && <form action={disconnectGoogleCollection}><input type="hidden" name="provider" value={provider}/><input type="hidden" name="target_id" value={targetId}/><button className={secondary}>Verbindung entfernen</button></form>}</div>
  </div>
}
export default async function CollectionAutomationPage({searchParams}: {searchParams: Promise<{target?: string; notice?: string; saved?: string; error?: string}>}) {
  const {adminSession} = await requireAdmin()
  const params = await searchParams
  let overview: Awaited<ReturnType<typeof getCollectionOverview>> | null = null
  try { overview = await getCollectionOverview(params.target) } catch { /* Fixed, non-sensitive read error below. */ }
  const name = adminSession.profile?.display_name || adminSession.user.email || 'Admin'
  if (!overview) return <AdminShell title="Automatisierung & Wartung" subtitle="SEO-Messungen und Betriebszustand" adminName={name}>
    <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Betriebsdaten können gerade nicht geladen werden. Bitte Datenbankverbindung und Berechtigungen prüfen und die Seite erneut öffnen.</p>
  </AdminShell>
  const {health, targets, targetCount, settings, selected, history, providers} = overview
  const current = settings.find(item => item.target_id === selected?.id)
  const issues = getCollectionHealth(health)
  const comparison = selected ? readComparisonConfig(selected.provider_config.comparison) : null
  const organicComparison = comparison?.channel === 'organic'
  const comparisonHref = selected ? `/seo/partnervergleich?target=${encodeURIComponent(selected.id)}` : '/seo/partnervergleich'
  const selectedId = selected?.id ?? ''
  const targetById = new Map(targets.map(item => [item.id, item]))
  const status = params.notice && noticeMessages[params.notice]
  const actionMessage = params.error ? errorMessages[params.error] : params.saved ? savedMessages[params.saved] : null
  return <AdminShell title="Automatisierung & Wartung" subtitle="SEO-Messungen und Betriebszustand" adminName={name}>
    <div className="min-w-0 space-y-6 text-[#061829]">
      <nav aria-label="SEO-Navigation" className="flex flex-wrap items-center gap-2 text-sm"><Link href="/seo" className="text-[#0b75d9] hover:underline">← SEO &amp; Sichtbarkeit</Link><span className="text-zinc-400">/</span><Link href={comparisonHref} className="text-[#0b75d9] hover:underline">Partnervergleich</Link></nav>
      {status && <p role="status" className="rounded-md border border-[#b8dcff] bg-[#f3f8ff] px-4 py-3 text-sm">{status}</p>}
      {actionMessage && <p role={params.error ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${params.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-[#b8dcff] bg-[#f3f8ff]'}`}>{actionMessage}</p>}
      <section aria-labelledby="betrieb" className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="betrieb" className="text-lg font-semibold">Betrieb</h2><p className="mt-1 text-sm text-zinc-600">Zeitplan alle 15 Minuten · letzter abgeschlossener Worker-Lauf {date(health.runtime.last_tick_finished_at)}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-medium ${health.runtime.enabled && health.scheduler?.active ? 'border-[#b8dcff] bg-[#f3f8ff] text-[#0b75d9]' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{!health.runtime.enabled ? 'Angehalten' : health.scheduler?.active ? 'Zeitplan aktiv' : 'Zeitplan fehlt'}</span></div>
        <dl className="mt-4 grid gap-3 border-y border-zinc-200 py-3 text-sm sm:grid-cols-3"><div><dt className="text-zinc-600">Wartend / laufend</dt><dd className="font-semibold">{health.queue.queued} / {health.queue.running}</dd></div><div><dt className="text-zinc-600">Ältester Auftrag</dt><dd className="font-semibold">{date(health.queue.oldestQueuedAt)}</dd></div><div><dt className="text-zinc-600">Organische Suchabfragen · Monat UTC</dt><dd className="font-semibold">{health.used} / {health.runtime.monthly_request_limit}</dd></div></dl>
        <div className="mt-4 flex flex-wrap gap-2"><form action={configureCollectionSchedule}><input type="hidden" name="target_id" value={selectedId}/><button className={secondary}>Zeitplan einrichten / reparieren</button></form><form action={queueCollectionNow}><input type="hidden" name="target_id" value={selectedId}/><button className={button}>Fällige Messungen anstoßen</button></form></div>
        <p className="mt-2 text-xs text-zinc-500">Der Start stellt Aufträge in die Warteschlange. Ergebnisse erscheinen erst nach Abschluss. Vor dem ersten Lauf muss der Zeitplan mit dem serverseitigen CRON_SECRET eingerichtet sein.</p>
      </section>
      <section aria-labelledby="issues"><h2 id="issues" className="text-lg font-semibold">Handlungsbedarf</h2>{issues.length ? <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white px-4">{issues.map((issue, index) => { const target = issue.targetId ? targetById.get(issue.targetId) : null; return <li key={`${issue.code}-${issue.targetId ?? index}`} className="py-3 text-sm"><span className="font-medium">{issue.message}</span>{target && <span className="block break-all text-zinc-600">{target.canonical_url} · <Link className="text-[#0b75d9] underline" href={`${'/seo/automatisierung?target='}${encodeURIComponent(target.id)}`}>Ziel öffnen</Link></span>}</li>})}</ul> : <p className="mt-2 text-sm text-zinc-600">Aktuell sind keine Probleme aus den gespeicherten Betriebsdaten erkennbar.</p>}</section>
      <section aria-labelledby="target" className="space-y-4"><div><h2 id="target" className="text-lg font-semibold">Messziel</h2><p className="text-sm text-zinc-600">{targetCount} vorhandene Ziele · Auswahl bis 500 Ziele</p></div>
        {selected ? <><form method="get" className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm font-medium">Ziel auswählen<select name="target" defaultValue={selected.id} className={field}>{targets.map(target => <option key={target.id} value={target.id}>{target.canonical_url} · {target.target_type}</option>)}</select></label><button className={secondary}>Anzeigen</button></form>
          <p className="text-sm">Webadresse: <WebLink value={selected.canonical_url}/> · <Link href={comparisonHref} className="text-[#0b75d9] underline">Ausgangsstand im Partnervergleich prüfen</Link></p>
          <form action={saveCollectionSettings} className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5"><input type="hidden" name="target_id" value={selected.id}/><h3 className="font-semibold">Quellen und Rhythmus</h3><div className="mt-3 grid gap-x-8 sm:grid-cols-2"><div><Check name="enabled" label="Dieses Ziel automatisch prüfen" defaultChecked={current?.enabled} detail="Nur aktivierte Quellen werden eingeplant."/><Check name="crawl_enabled" label="Webseitenprüfung · wöchentlich" defaultChecked={current?.crawl_enabled ?? true} detail="Seitentitel, Noindex, Fehler und Links bis zu den festgelegten Prüfgrenzen."/><Check name="gsc_enabled" label="Search Console · täglich" defaultChecked={current?.gsc_enabled} detail="Finale, getrennte 28-Tage-Zeiträume; Durchschnittsposition ist kein Keyword-Rang."/></div><div><Check name="gbp_enabled" label="Google-Unternehmensprofil · täglich" defaultChecked={current?.gbp_enabled} detail="Tagesmetriken mit Abdeckung; Anruf-Klicks sind keine abgeschlossenen Anrufe."/><Check name="psi_enabled" label="PageSpeed · wöchentlich" defaultChecked={current?.psi_enabled} detail={providers.psi ? 'Mobiler Lighthouse-Labortest; API-Schlüssel ist serverseitig vorhanden.' : 'Optional; serverseitiger API-Schlüssel fehlt noch.'}/><Check name="rank_enabled" label="Organische Rankings · wöchentlich" defaultChecked={current?.rank_enabled} detail={organicComparison ? 'Nutzt den vorhandenen organischen Partnervergleich.' : 'Benötigt einen organischen Partnervergleich; Maps-Automatik ist nicht verfügbar.'}/></div></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Search-Console-Property<input name="gsc_property" defaultValue={current?.gsc_property ?? ''} placeholder="https://example.de/ oder sc-domain:example.de" className={field}/></label><label className="text-sm font-medium">Google-Profilstandort<input name="gbp_location" defaultValue={current?.gbp_location ?? ''} placeholder="locations/123456789" className={field}/></label></div>
            <p className="mt-3 text-xs text-zinc-500">Alle Eingaben werden serverseitig geprüft. Das Pausieren des alten SEO-Zielstatus steuert diese Einstellungen nicht. Ein Ausgangsstand wird niemals automatisch festgeschrieben.</p><button className={`${button} mt-4`}>Einstellungen speichern</button></form>
        </> : <p className="rounded-md border border-zinc-200 bg-white p-4 text-sm">Noch kein vorhandenes Messziel. Bestehende Ziele und Partnervergleiche werden in SEO &amp; Sichtbarkeit eingerichtet.</p>}</section>
      <section aria-labelledby="connections" className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5"><h2 id="connections" className="text-lg font-semibold">Quellen und Zugänge</h2><p className="mt-1 text-sm text-zinc-600">Google OAuth: {providers.oauthReady ? 'serverseitig vorbereitet' : 'nicht eingerichtet'} · Bright Data: {providers.bright ? 'Zugang vorhanden' : 'Zugang fehlt'} · PageSpeed: {providers.psi ? 'API-Schlüssel vorhanden' : 'API-Schlüssel fehlt'}</p>
        <div className="mt-4"><GoogleConnection provider="gsc" name="Google Search Console · Lesezugriff" connectedAt={providers.gsc} ready={providers.oauthReady} targetId={selectedId}/><GoogleConnection provider="gbp" name="Google-Unternehmensprofil · nur lesende Nutzung" connectedAt={providers.gbp} ready={providers.oauthReady} targetId={selectedId}/></div>
        {!providers.oauthReady && <p className="mt-3 rounded-md bg-[#f3f8ff] p-3 text-sm">Google Cloud-Projekt und OAuth-Client einrichten, die Google-APIs freischalten, serverseitig SEO_GOOGLE_CLIENT_ID, SEO_GOOGLE_CLIENT_SECRET und SEO_TOKEN_ENCRYPTION_KEY setzen und diese Callback-URL registrieren: <code className="break-all">https://admin.benefitsi.de/api/seo/google/callback</code>.</p>}
        <p className="mt-3 text-sm text-zinc-600">Google verlangt für das Unternehmensprofil <code>business.manage</code>; diese Anwendung liest die Daten nur. Search Console verwendet Lesezugriff. <a className="text-[#0b75d9] underline" href="https://developers.google.com/webmaster-tools/v1/how-tos/authorizing" target="_blank" rel="noopener noreferrer">Search-Console-Voraussetzungen</a> · <a className="text-[#0b75d9] underline" href="https://developers.google.com/my-business/content/prereqs" target="_blank" rel="noopener noreferrer">Profil-Voraussetzungen</a>.</p>
      </section>
      <section aria-labelledby="budget" className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5"><h2 id="budget" className="text-lg font-semibold">Kostenlose Suchabfragen begrenzen</h2><p className="mt-1 text-sm text-zinc-600">Bright Data Zugang und kostenloser Tarif müssen separat manuell eingerichtet und bestätigt werden. Bei Limit 0 bleiben organische Abfragen gesperrt. Es gibt keinen bezahlten Fallback, keine automatische Erhöhung und keinen Zähler-Reset.</p><form action={saveCollectionRuntime} className="mt-4 space-y-3"><input type="hidden" name="target_id" value={selectedId}/><Check name="enabled" label="Automatischen Betrieb aktivieren" defaultChecked={health.runtime.enabled}/><label className="block max-w-xs text-sm font-medium">Maximale Anfragen pro Monat (UTC), höchstens 4.500<input name="monthly_request_limit" type="number" min="0" max="4500" step="1" defaultValue={health.runtime.monthly_request_limit} className={field}/></label><Check name="free_tier_confirmed" label="Kostenlosen Bright Data Tarif ausdrücklich bestätigt" defaultChecked={health.runtime.free_tier_confirmed}/><button className={button}>Betrieb und Limit speichern</button></form></section>
      <section aria-labelledby="history" className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5"><h2 id="history" className="text-lg font-semibold">Letzte Messläufe</h2><p className="mb-4 text-sm text-zinc-600">Bis zu 20 Läufe für das ausgewählte Ziel · automatische vorübergehende Wiederholungen laufen im Worker.</p>{selected ? <Observations history={history} targetId={selected.id}/> : <p className="text-sm text-zinc-600">Noch keine Daten</p>}</section>
    </div>
  </AdminShell>
}
