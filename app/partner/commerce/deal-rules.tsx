import { saveCommerceDealRule } from './deal-actions'
import { PendingSubmitButton } from '@/components/pending-submit-button'

type Row=Record<string,unknown>
const label=(v:unknown)=>typeof v==='string'?v:''
const kind:Record<string,string>={'2for1':'2 für 1',item:'Gratisartikel',fixed:'Fester Rabatt',percent:'Prozentualer Rabatt'}

export function CommerceDealRules({providerId,testMode,available,deals,rules,menu}:{providerId:string;testMode:boolean;available:boolean;deals:Row[];rules:Row[];menu:Row[]}) {
  return <section id="deals" className="scroll-mt-6 rounded-2xl border border-amber-200 bg-white p-5">
    <h2 className="text-xl font-bold">Deals für Bestellungen · Testbetrieb</h2>
    <p className="mt-2 text-sm text-slate-700">Kunden wählen einen Deal freiwillig beim Bezahlen aus. Testbestellungen prüfen den Rabatt; ein echter Benefitsi-Vorteil wird dabei nicht eingelöst oder verbraucht.</p>
    {!testMode?<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Deal-Rabatte sind für Livebestellungen noch nicht freigeschaltet.</p>:!available?<p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Deal-Einstellungen sind derzeit nicht verfügbar. Es werden keine Deals für Bestellungen aktiviert.</p>:!deals.length?<p className="mt-3 text-sm text-slate-500">Keine aktiven, direkt wählbaren Deals mit unterstütztem Rabatt vorhanden.</p>:<div className="mt-4 space-y-4">{deals.map(deal=>{
      const id=label(deal.id)
      const rule=rules.find(r=>r.deal_id===id)
      const mapped=Array.isArray(rule?.menu_item_ids)?rule.menu_item_ids as string[]:[]
      const discountType=label(deal.discount_type)
      const title=label(deal.public_title)||label(deal.reward_item)||label(deal.customer_description)||label(deal.type)
      return <form key={id} action={saveCommerceDealRule} className="rounded-xl border border-slate-200 p-4">
        <input type="hidden" name="provider_id" value={providerId}/><input type="hidden" name="deal_id" value={id}/>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 data-admin-i18n-ignore={Boolean(deal.public_title || deal.reward_item || deal.customer_description)} className="font-semibold">{title}</h3><p className="text-xs text-slate-500">{kind[discountType]||discountType}</p>{label(deal.customer_description)&&<p data-admin-i18n-ignore="true" className="mt-1 text-sm text-slate-700">{label(deal.customer_description)}</p>}{label(deal.terms)&&<p className="mt-1 text-xs text-slate-500">Bedingungen: <span data-admin-i18n-ignore="true">{label(deal.terms)}</span></p>}</div><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="enabled" value="true" defaultChecked={rule?.enabled===true}/> Für Testbestellungen aktivieren</label></div>
        <fieldset className="mt-3"><legend className="text-sm font-semibold">Gültige Speisekartenartikel</legend><p className="text-xs text-slate-500">Für 2-für-1 und Gratisartikel mindestens einen Artikel ausdrücklich auswählen. Ohne Auswahl gilt ein fester oder prozentualer Rabatt für alle Artikel.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{menu.filter(item=>item.active===true).map(item=><label key={label(item.id)} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><input type="checkbox" name="menu_item_ids" value={label(item.id)} defaultChecked={mapped.includes(label(item.id))}/><span data-admin-i18n-ignore="true">{label(item.title)}</span></label>)}</div>{!menu.some(item=>item.active===true)&&<p className="mt-2 text-sm text-slate-500">Noch keine verfügbaren Speisekartenartikel.</p>}</fieldset>
        <PendingSubmitButton className="mt-4 rounded-xl bg-[#087cd9] px-4 py-2 text-sm font-bold text-white" pendingLabel="Wird gespeichert …">Deal-Einstellung speichern</PendingSubmitButton>
      </form>
    })}</div>}
  </section>
}
