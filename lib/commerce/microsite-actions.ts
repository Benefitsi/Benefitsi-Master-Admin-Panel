import type { MicrositeCommerceAction } from '@/components/microsite/microsite-integration'

const kinds = ['food_pickup', 'table', 'appointment'] as const
const labels = {food_pickup:'Essen bestellen',table:'Tisch reservieren',appointment:'Termin buchen'}

export function micrositeCommerceActions(catalog: unknown, partnerId: string, origin: string): MicrositeCommerceAction[] {
  const value = catalog as {provider?:{partner_id?:string;food_ordering_enabled?:boolean};offerings?:Array<{kind?:string;slots?:Array<{remaining?:number;starts_at?:string}>}>} | null
  if (value?.provider?.partner_id !== partnerId || !Array.isArray(value.offerings)) return []
  return kinds.filter(kind => (kind !== 'food_pickup' || value.provider?.food_ordering_enabled === true) && value.offerings!.some(offer => offer.kind === kind && offer.slots?.some(slot => Number(slot.remaining) > 0 && Date.parse(slot.starts_at || '') > Date.now())))
    .map(kind => ({kind,label:labels[kind],href:`${origin}/buchen/${encodeURIComponent(partnerId)}?kind=${kind}`}))
}
