import Link from 'next/link'
import { AIEO_STAGES, type AieoMeasurementResult } from '@/lib/analytics/aieo-measurement'

export function AieoMeasurementPanel({ result }: { result: AieoMeasurementResult }) {
  if (result.state === 'forbidden') return null
  const unavailable = {
    setup_required: 'Die AIEO-Messung ist noch nicht eingerichtet. Es werden keine Ersatzwerte angezeigt.',
    unavailable: 'Die Messwerte konnten nicht vollständig geladen werden. Bitte erneut versuchen.',
    invalid_scope: 'Bitte höchstens 90 Tage und nur Stadt und Datenumgebung auswählen. Partner-, Kanal- und Tariffilter werden hier nicht unterstützt.',
  }
  return <section id="aieo-measurement" className="rounded-2xl border border-[#061829]/10 bg-white p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-bold text-[#061829]">KI-Verweise und App-Nutzung</h2><Link href="/seo/aieo" className="text-sm font-semibold text-[#0b75d9]">Offizielle KI-Sichtbarkeit &amp; Import</Link></div>
    {result.state !== 'ready' ? <p role="status" className="mt-3 text-sm text-[#526170]">{unavailable[result.state]}</p> : <>
      <p className="mt-2 text-sm text-[#526170]">{result.scope.cityId ? 'Ausgewählte Stadt' : 'Alle Städte und die Hauptwebsite'} · {result.scope.environment} · bestehender Datumsfilter. Nur mit Zustimmung beobachtete Nutzung.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th scope="col" className="py-2">Stufe</th><th scope="col" className="py-2">Ereignisse</th><th scope="col" className="py-2">Beobachtete Kennungen</th><th scope="col" className="py-2">Davon KI-Verweise</th></tr></thead><tbody>
        {result.data.stages.map(row => <tr className="border-b border-[#061829]/5" key={row.key}><th scope="row" className="py-3 font-medium">{AIEO_STAGES[row.key]}</th><td>{row.events.toLocaleString('de-DE')}</td><td>{row.actors.toLocaleString('de-DE')}</td><td>{row.aiReferralEvents.toLocaleString('de-DE')}</td></tr>)}
      </tbody></table></div>
      <p className="mt-4 text-sm font-semibold text-[#061829]">Serverbestätigte Besuche: {result.data.confirmedVisits.toLocaleString('de-DE')} · Einlösungen: {result.data.confirmedRedemptions.toLocaleString('de-DE')}</p>
      <p className="mt-2 text-sm leading-6 text-[#526170]">Der Übergabeversuch bestätigt keine App-Öffnung. Ein angezeigtes App-Ziel bestätigt keine Einlösung. Kennungen sind keine Personen; Web und App werden nicht zusammengeführt. Die bestehenden Aktivierungszahlen und bestätigten Serverereignisse haben eigene Grundgesamtheiten. Deshalb wird keine gemeinsame Conversion-Rate berechnet.</p>
      <p className="mt-2 text-xs leading-5 text-[#526170]">Quelle: interne Gateway-Beobachtungen und bestätigte Serverereignisse. KI-Verweise beruhen auf bekannten Referrer-Domains oder dem ChatGPT-Quellparameter; fehlende Referrer bleiben unerkannt. Null bedeutet keine gespeicherte Beobachtung, nicht keinen Traffic. {result.data.coverage !== 'consented_observations' ? 'Der Zeitraum liegt ganz oder teilweise außerhalb der 400-tägigen Aufbewahrung.' : 'Historische Zeiträume vor Einführung der neuen Ereignisse sind nicht nachträglich messbar.'}</p>
    </>}
  </section>
}
