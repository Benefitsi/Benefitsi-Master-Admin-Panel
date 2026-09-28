'use client'

import { useFormStatus } from 'react-dom'
import { setPartnerOrdering } from './actions'

function Switch({ enabled, partnerName }: { enabled: boolean; partnerName: string }) {
  const { pending } = useFormStatus()
  return <button type="submit" role="switch" aria-checked={enabled}
    aria-label={`Online-Bestellungen für ${partnerName}`} disabled={pending} aria-busy={pending}
    className="inline-flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60">
    <span aria-hidden="true" className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${enabled ? 'bg-[#087cd9]' : 'bg-slate-300'}`}>
      <span className={`size-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : ''}`} />
    </span>
    <span>{pending ? 'Wird gespeichert …' : enabled ? 'An' : 'Aus'}</span>
  </button>
}

export function OrderingSwitch({ providerId, partnerId, partnerName, enabled }: {
  providerId: string; partnerId: string; partnerName: string; enabled: boolean;
}) {
  return <form action={setPartnerOrdering}>
    <input type="hidden" name="provider_id" value={providerId} />
    <input type="hidden" name="partner_id" value={partnerId} />
    <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
    <Switch enabled={enabled} partnerName={partnerName} />
  </form>
}
