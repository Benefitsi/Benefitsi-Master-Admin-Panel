import {partnerPageContext} from '@/lib/partners/page-context'
import Link from 'next/link'
export const dynamic='force-dynamic'
export default async function PartnerSeo({searchParams}:{searchParams:Promise<{partner?:string}>}) {
 const ctx=await partnerPageContext((await searchParams).partner)
 const {data,error}=await ctx.client.rpc('get_partner_seo_monitor',{p_partner_id:ctx.partnerId})
 return <main className="mx-auto max-w-4xl space-y-6 p-6"><Link href={`/partner/billing?partner=${ctx.partnerId}`}>← Tarif & Module</Link><h1 className="text-3xl font-bold">SEO Monitor</h1>
 <p>Ein Standort, eine Microsite: technische Prüfungen und ein Monatsbericht. Höchstens fünf vereinbarte Keywords werden nur bei tatsächlich vorhandenem Messzugang ausgewertet.</p>
 <p>Einrichtung umfasst Konfiguration, autorisierte Verbindungen und Ausgangsmessung. Keine manuelle Optimierung, Rankinggarantie, bezahlten Messanbieter oder ProvenExpert-Automatisierung.</p>
 {error || !data ? <p role="alert">Messzugang und Berichte sind derzeit nicht verfügbar.</p> : <>
 <p>{data.active?'Aktiv':'Noch nicht aktiv'} · {data.source?.ready?'Messquelle eingerichtet':'Messquelle oder technische Prüfung fehlt'}</p>
 {data.active && data.source?.technical_observed_at && <section><h2 className="text-xl font-bold">Technische Prüfung</h2><p>Erfasst {data.source.technical_observed_at} · {data.source.technical_state==='partial'?'Teilweise geprüft / Hinweise vorhanden':'Prüfung abgeschlossen'}</p><ul>{(data.source.technical_findings??[]).map((f:{code:string;url:string;status?:number},i:number)=><li key={i}>{({missing_title:'Seitentitel fehlt',noindex:'Suchmaschinen-Indexierung deaktiviert',page_error:'Seite nicht erreichbar',broken_link:'Defekter Link',link_check_failed:'Linkprüfung fehlgeschlagen'} as Record<string,string>)[f.code]??'Technischer Hinweis'} · {f.url}{f.status?` (${f.status})`:''}</li>)}</ul></section>}
 <p>Die monatliche Auswertung zeigt ausschließlich die tatsächlichen Google-Search-Console-Messzeiträume. Durchschnittliche Positionen sind keine Keyword-Rankings; nicht gemessene Keywords bleiben ohne Wert.</p>
 {data.monthly_report ? <section><h2 className="text-xl font-bold">Letzter abgeschlossener Berichtsmonat</h2><p>Quelle: Google Search Console · erfasst {data.monthly_report.observed_at}</p>{(data.monthly_report.periods ?? []).map((period:{startDate:string;endDate:string;queries:{query:string;clicks:number;impressions:number;averagePosition:number}[]})=><div key={period.startDate} className="mt-4"><h3>{period.startDate} – {period.endDate}</h3><table className="w-full text-left"><thead><tr><th>Keyword</th><th>Klicks</th><th>Impressionen</th><th>Ø Position</th></tr></thead><tbody>{period.queries.map(q=><tr key={q.query}><td>{q.query}</td><td>{q.clicks}</td><td>{q.impressions}</td><td>{q.averagePosition}</td></tr>)}</tbody></table>{!period.queries.length&&<p>Für die vereinbarten Keywords liegen keine Messwerte vor.</p>}</div>)}</section>:<p>Noch kein Monatsbericht mit bestätigten Quelldaten vorhanden.</p>}
 </>}
 </main>
}
