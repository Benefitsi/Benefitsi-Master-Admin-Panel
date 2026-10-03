import manifest from '@/lib/partners/benefits-v1.json'
export type BenefitPlan = { plan_code: string; features: Record<string, boolean>; limits: Record<string, number | null>; deal_drop_limit_provisional?: boolean }
export const partnerBenefitManifest = manifest
export function benefitRows(plan: BenefitPlan) {
  return manifest.groups.map(group => ({ id: group.id, title: group.title, items: group.items.map(item => {
    const entry = item as { id:string;label:string;scope:string;feature?:string;limit?:string;note?:string;free_label?:string }
    let label = entry.label
    const feature = entry.feature ? plan.features[entry.feature] : undefined
    if (entry.feature && typeof feature !== 'boolean') return {id:entry.id,label:`${label}: Tarifumfang derzeit nicht verfügbar`,note:entry.note}
    if ((entry.scope==='pro' && plan.plan_code!=='pro') || feature===false) return {id:entry.id,label:entry.free_label ?? `${label}: nicht enthalten`}
    if (entry.limit) {
      const value=plan.limits[entry.limit]
      if (entry.limit==='deal_drops_monthly' && value===null && typeof plan.deal_drop_limit_provisional==='boolean') label = plan.deal_drop_limit_provisional ? 'Deal Drops: vorläufig ohne Monatslimit; endgültiger Umfang noch offen' : 'Deal Drops ohne Monatslimit'
      else if (typeof value!=='number'||!Number.isInteger(value)||value<0) label = entry.limit==='deal_drops_monthly' ? 'Deal-Drop-Kontingent derzeit nicht verfügbar' : `${label}: Tarifumfang derzeit nicht verfügbar`
      else if (entry.limit==='deal_drops_monthly') label = value===0 ? 'Keine Deal-Drop-Veröffentlichungen im aktuellen Tarif' : `${value} Deal ${value===1?'Drop':'Drops'} pro Kalendermonat und Standort (Europe/Berlin)`
      else if (entry.limit==='team_members') label=`${value} Teammitglieder einschließlich Inhaber`
      else if (entry.limit==='analytics_days') label=`${value} Tage Auswertungszeitraum`
      else if (entry.limit==='menu_ai_imports_monthly') label=value===0?'KI-Menüimport nicht enthalten':`${value} KI-Menüimporte pro Abo-Monat`
    }
    return {id:entry.id,label,note:entry.note}
  }) }))
}
