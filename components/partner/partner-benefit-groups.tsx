import {benefitRows, partnerBenefitManifest, type BenefitPlan} from '@/lib/partners/benefits'
export function PartnerBenefitGroups({plan, compact=false}: {plan:BenefitPlan;compact?:boolean}) {
  return <div data-benefit-version={partnerBenefitManifest.benefit_version} className={compact?'space-y-5':'grid gap-6 md:grid-cols-2'}>
    {benefitRows(plan).map(group=><section key={group.id}><h4 className="font-bold text-[#061829]">{group.title}</h4><ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">{group.items.map(item=><li key={item.id}><span>{item.label}</span>{item.note&&<small className="block text-slate-500">{item.note}</small>}</li>)}</ul></section>)}
    {!compact&&<p className="text-sm leading-6 text-slate-500 md:col-span-2">{partnerBenefitManifest.notes.join(' ')}</p>}
  </div>
}
