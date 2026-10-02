import type { SupabaseClient } from '@supabase/supabase-js'
import { readDealDropUsage } from '@/lib/partners/entitlements'
export async function PartnerDropUsage({ client, partnerId }: { client: SupabaseClient; partnerId: string }) {
  try {
    const usage = await readDealDropUsage(client, partnerId)
    const date = (value: string) => new Intl.DateTimeFormat('de-DE', {timeZone:'Europe/Berlin', dateStyle:'medium', timeStyle:'short'}).format(new Date(value))
    return <section className="mb-5 rounded-xl border bg-white p-5" aria-label="Deal-Drop-Verbrauch">
      <h2 className="font-bold">Deal Drops · Kalendermonat Europe/Berlin</h2>
      <p>{usage.limit === null ? `${usage.used} veröffentlicht · ohne Monatslimit (vorläufig, konfigurierbar)` : `${usage.used} von ${usage.limit} genutzt`}</p>
      <p>{usage.next_available_at ? `Nächste Veröffentlichung möglich ab ${date(usage.next_available_at)}` : 'Veröffentlichung aktuell möglich.'} Neuer Monat ab {date(usage.resets_at)}.</p>
      <p>Entwürfe zählen nicht. Die aktive Veröffentlichung zählt sofort, auch bei späterem Gültigkeitsbeginn. Pausieren oder Löschen erstattet keinen Platz. Normale Angebote und Happy Hour bleiben unbegrenzt.</p>
    </section>
  } catch {
    return <p role="alert">Drop-Verbrauch konnte nicht geladen werden. Bitte erneut laden; die Veröffentlichung wird serverseitig geprüft.</p>
  }
}
