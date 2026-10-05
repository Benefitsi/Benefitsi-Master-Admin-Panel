import Link from "next/link"
import { requireAdmin } from "@/lib/admin"
import { normalizePartnerCategory } from "@/lib/partner-categories"
import { loadVisitLevelPartners } from "@/lib/partner-visit-level-data"
import {
  getVisitLevelCategories, summarizeCategoryFrequencies, levelRanges,
  hasConfiguredFrequency, visitFrequencies, visitFrequencyLabels,
  visitLevelsHref, visitRangeLabel, type VisitLevelPartner, type VisitFrequency,
} from "@/lib/partner-visit-levels"
import { AdminShell } from "../../admin-shell"

export const dynamic = "force-dynamic"
type Search = Record<string, string | string[] | undefined>
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default async function VisitLevelsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, adminSession } = await requireAdmin()
  const query = await searchParams
  let partners: VisitLevelPartner[] = []
  let loadFailed = false
  try { partners = await loadVisitLevelPartners(supabase) } catch { loadFailed = true }
  const categories = getVisitLevelCategories(partners)
  const requestedCategory = first(query.category)
  const category = requestedCategory === undefined ? categories[0] ?? "" : normalizePartnerCategory(requestedCategory) ?? ""
  if (!categories.includes(category)) categories.push(category)
  const requestedFrequency = first(query.frequency)
  const frequencies = visitFrequencies.includes(requestedFrequency as VisitFrequency)
    ? [requestedFrequency as VisitFrequency] : visitFrequencies
  const groups = summarizeCategoryFrequencies(partners, category)
  const partnerCount = groups.reduce((total, group) => total + group.partners.length, 0)
  const adminName = adminSession.profile?.display_name || adminSession.user.email || "Admin"

  return <AdminShell title="Besuchslevel" subtitle="Partner · Kategorien und Besuchsbereiche" adminName={adminName}>
    <div className="space-y-5">
      <Link href="/partners" className="text-sm font-semibold text-teal-700 hover:underline">← Partnerverwaltung</Link>
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Besuche bei genau diesem Partner</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Bronze IV gilt ab 0 Besuchen, Bronze III ab dem ersten Besuch. Die Frequenz wird am einzelnen Partner gespeichert.
          Eine automatische Zuordnung nach Kategorie ist derzeit nicht hinterlegt. Eine niedrige Frequenz benötigt weniger Besuche für höhere Level.
        </p>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          Neuer Regelstand: Bronze IV bei 0 Besuchen. App-Version 1.4.14 (Build 173) wurde zu TestFlight übermittelt.
          Für externe Tester ist die Freigabe durch Apple erforderlich.
          Ältere installierte App-Versionen können bei 0 Besuchen weiterhin „Noch kein Level“ anzeigen. Alle höheren Grenzen bleiben unverändert.
        </p>
        <form action="/partners/visit-levels" method="get" className="mt-5 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-medium">Kategorie
            <select name="category" defaultValue={category} key={category} className="min-h-10 max-w-full rounded-md border border-zinc-300 bg-white px-3">
              {categories.map(value => <option key={value} value={value}>{value || "Ohne Kategorie"}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Frequenz anzeigen
            <select name="frequency" defaultValue={frequencies.length === 1 ? frequencies[0] : "all"} key={frequencies.join()} className="min-h-10 rounded-md border border-zinc-300 bg-white px-3">
              <option value="all">Alle drei Staffelungen</option>
              {visitFrequencies.map(value => <option key={value} value={value}>{visitFrequencyLabels[value]}</option>)}
            </select>
          </label>
          <button className="min-h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Anzeigen</button>
          <Link href={visitLevelsHref(category, frequencies.length === 1 ? frequencies[0] : undefined)} className="py-2 text-sm text-teal-700 underline">Direktlink zur Auswahl</Link>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">{category || "Ohne Kategorie"}</h2>
        {loadFailed ? <p role="alert" className="mt-2 text-sm text-amber-800">
          Die Partnerkonfigurationen konnten nicht geladen werden. Die Tabelle zeigt nur die Staffelungen; eine Aussage zur aktuell verwendeten Frequenz ist nicht möglich. Bitte lade die Seite erneut.
        </p> : partnerCount === 0 ? <p className="mt-2 text-sm text-zinc-600">
          Für diese Kategorie ist aktuell keine Partnerkonfiguration vorhanden. Die Tabelle dient als Vergleich; es ist kein Kategorie-Standard festgelegt.
        </p> : <p className="mt-2 text-sm text-zinc-600">
          {partnerCount} Partner in dieser Kategorie (einschließlich inaktiver Partner). {groups.length > 1 ? "Es bestehen unterschiedliche Partnerkonfigurationen." : "Die angezeigte Konfiguration gilt für diese Partner und ist kein Kategorie-Standard."}
        </p>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Besuchsbereiche von Bronze IV bis Diamant für {category || "Partner ohne Kategorie"}</caption>
            <thead><tr className="border-b border-zinc-200">
              <th scope="col" className="px-3 py-3">Level</th>
              {frequencies.map(frequency => <th scope="col" key={frequency} className="px-3 py-3">
                {visitFrequencyLabels[frequency]}<span className="mt-1 block text-xs font-normal text-zinc-500">
                  {loadFailed ? "Konfiguration unbekannt" : `${groups.find(group => group.frequency === frequency)?.partners.length ?? 0} Partner · wirksame Frequenz`}
                </span>
              </th>)}
            </tr></thead>
            <tbody>{levelRanges("high").map((level, index) => <tr key={level.code} className="border-b border-zinc-100 last:border-0 even:bg-zinc-50">
              <th scope="row" className="whitespace-nowrap px-3 py-3 font-medium">{level.germanName}</th>
              {frequencies.map(frequency => {
                const range = levelRanges(frequency)[index]
                return <td key={frequency} className="whitespace-nowrap px-3 py-3 tabular-nums">{visitRangeLabel(range.minimumVisits, range.maximumVisits)} {range.minimumVisits === 1 && range.maximumVisits === 1 ? "Besuch" : "Besuche"}</td>
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      {!loadFailed && groups.length > 0 ? <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Tatsächliche Partnerkonfigurationen</h2>
        <p className="mt-2 text-sm text-zinc-600">Fehlende oder unbekannte Frequenzwerte verwenden in der App „hoch“. Sie werden hier als Fallback gekennzeichnet.</p>
        <div className="mt-4 space-y-3">{groups.map(group => <details key={group.frequency} className="rounded-lg border border-zinc-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{visitFrequencyLabels[group.frequency]} · {group.partners.length} Partner{group.fallbackCount ? ` · ${group.fallbackCount} mit Fallback` : ""}</summary>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{group.partners.map(partner => <li key={partner.id}>
            <Link href={`/partners?partner=${encodeURIComponent(partner.id)}`} className="text-teal-700 hover:underline">{partner.name || "Unbenannter Partner"}</Link>
            {!hasConfiguredFrequency(partner.level_frequency) ? <span className="ml-2 text-amber-800">{partner.level_frequency?.trim() ? `Unbekannter Wert: ${partner.level_frequency}` : "Keine Frequenz hinterlegt"} → hoch</span> : null}
          </li>)}</ul>
        </details>)}</div>
      </section> : null}
    </div>
  </AdminShell>
}
