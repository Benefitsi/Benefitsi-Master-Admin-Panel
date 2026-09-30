import type { PriceOffer } from '@/lib/partners/entitlements';
import { partnerBillingAction } from '@/app/partner/billing/actions';
type Readiness = {
    enabled: boolean;
    reason: string;
    terms: Record<string, string> | null;
    founder_eligible: boolean;
    founder_admitted: boolean;
    founder_ready?: boolean;
    module_readiness?: Record<string, boolean>;
};
const labels: Record<string, string> = { founder: 'Pro Founder', founder_annual: 'Pro Founder (Jahreszahlung)', standard: 'Pro', commerce: 'Bestellungen & Termine', seo: 'SEO & Reichweite' };
const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n / 100);
export function PartnerBillingControls({ partner, offers, readiness, currentOffers, pendingOffers = [], canBuyAddons = false, error }: {
    partner: string;
    offers: PriceOffer[];
    readiness: Readiness | null;
    currentOffers: string[];
    pendingOffers?: string[];
    canBuyAddons?: boolean;
    error: boolean;
}) {
    if (!readiness || (!readiness.enabled && currentOffers.length === 0))
        return <section className="rounded-xl border p-5"><h2 className="font-semibold">Abrechnung noch nicht verfügbar</h2><p>Vor dem Start müssen Abrechnung, verbindliche Vertragsbedingungen und das Rechnungsportal freigegeben werden. Dein aktueller Tarif bleibt bestehen.</p></section>;
    const terms = readiness.terms!;
    return <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">Abrechnung verwalten</h2>
 { !readiness.enabled && <p>Neue Abschlüsse sind bis zur Freigabe der Vertragsbedingungen gesperrt. Bestehende Verträge kannst du weiterhin verwalten.</p> }
 {error && <p role="alert">Die Änderung konnte nicht bestätigt werden. Bitte lade den aktuellen Status neu oder versuche es erneut.</p>}
 <form action={partnerBillingAction}><input type="hidden" name="partner_id" value={partner}/><button name="operation" value="portal" className="underline">Rechnungen und Zahlungsmethode</button></form>
 {currentOffers.filter(offer => !pendingOffers.includes(offer)).map(offer => <form action={partnerBillingAction} key={offer}><input type="hidden" name="partner_id" value={partner}/><input type="hidden" name="offer" value={offer}/><button name="operation" value="cancel" className="underline">{labels[offer] || 'Zusatzmodul'} {offer.startsWith('founder') ? 'zum nächsten vertraglichen Termin' : 'zum Periodenende'} kündigen</button></form>)}
 <form action={partnerBillingAction}><input type="hidden" name="partner_id" value={partner}/><button name="operation" value="recover" className="underline">Abrechnungsstatus prüfen / offenen Auftrag fortsetzen</button></form>
 <p>Bei Kündigung von Pro enden auch die Zusatzmodule spätestens mit Pro. Bereits bezahlte Leistungen und Bestellungen bleiben erhalten. Wähle vor Ablauf die Angebote und Teammitglieder für dein Free-Kontingent; neue Aktivierungen oberhalb des Limits werden gesperrt.</p>
 {(readiness.enabled ? offers : []).filter(o => !currentOffers.includes(o.offer_code) && (o.addon_code ? canBuyAddons && readiness.module_readiness?.[o.addon_code] === true : !currentOffers.some(code => offers.some(item => item.offer_code === code && !item.addon_code) || ['founder', 'founder_annual', 'standard'].includes(code))) && (!['founder', 'founder_annual'].includes(o.offer_code) || readiness.founder_ready === true && readiness.founder_eligible && !readiness.founder_admitted)).map(o => <form key={`${o.offer_code}:${o.version}`} action={partnerBillingAction} className="space-y-2 border-t pt-4">
 <input type="hidden" name="partner_id" value={partner}/><input type="hidden" name="offer" value={o.offer_code}/><input type="hidden" name="version" value={o.version}/><input type="hidden" name="terms_version" value={terms.version}/>
 <p>{labels[o.offer_code] || 'Zusatzmodul'} · {money(o.unit_amount)} {o.billing_interval === 'year' ? 'jährlich im Voraus' : 'monatlich'} zzgl. MwSt.{o.setup_amount > 0 ? ` · Einrichtung ${money(o.setup_amount)} zzgl. MwSt.` : ''}</p>
 {['founder', 'founder_annual'].includes(o.offer_code) && <p>Die ersten sechs Kalendermonate gratis ab bestätigter Aktivierung des Founder-Abos; während der Gratisphase monatlich kündbar zum nächsten Stichtag, spätestens zum Ende der Gratisphase ohne erste Zahlung. Erst danach beginnt bei Fortsetzung die bezahlte Mindestlaufzeit von zwölf Monaten. Erste Zahlung erst nach der Gratisphase: {money(o.unit_amount)} {o.billing_interval === 'year' ? 'jährlich im Voraus; danach Verlängerung um jeweils ein Jahr.' : 'monatlich; danach monatlich kündbar.'} Jeweils zzgl. MwSt. Zwei KI-Imports pro Monat auch bei Jahreszahlung. Preisänderungen: {(terms as unknown as {founder?: {price_change:string}}).founder?.price_change}.</p>}
 {o.addon_code && <p>Zusatzmodule sind separat kostenpflichtig und erhalten keinen Founder-Testzeitraum. Während des Founder-Zeitraums erfolgt die erste anteilige Zahlung sofort bis zum nächsten monatlichen Stichtag; Betrag und Termin zeigt Checkout vor der Bestätigung.</p>}
 {!['founder', 'founder_annual'].includes(o.offer_code) && <p>Erste Zahlung: {terms.first_payment}. Kündigung: {terms.cancellation}. Mindestlaufzeit: {terms.minimum_term}. Preisänderungen: {terms.price_change}.</p>}
 <label className="block"><input type="checkbox" name="agreement" value="accepted" required/> Ich akzeptiere die <a className="underline" href={terms.document_url} target="_blank" rel="noreferrer">Vertragsbedingungen, Version {terms.version}</a>, für dieses Angebot.</label>
 <button name="operation" value="checkout" className="rounded border px-4 py-2">Kostenpflichtiges Angebot prüfen</button>
 </form>)}
 </section>;
}
