'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readPartnerTaskSettings } from '@/lib/partners/tasks'
import { PartnerTaskSettings } from '@/components/partner/partner-task-settings'
import type { PartnerTaskSettingsRead } from '@/lib/partners/tasks'

type Snapshot = { partnerId: string; initial?: PartnerTaskSettingsRead; error?: boolean }
export function PartnerTaskSettingsLoader({ partnerId, dealRevision = '', confirmationOnly = false }: { partnerId: string; dealRevision?: string; confirmationOnly?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [attempt, setAttempt] = useState(0)
  const actor = useRef<string | null>(null)
  const current = snapshot?.partnerId === partnerId ? snapshot : null
  useEffect(() => {
    let active = true
    const client = createClient()
    void readPartnerTaskSettings(client, partnerId, confirmationOnly).then(initial => {
      if (active) { actor.current = initial.actorId; setSnapshot({ partnerId, initial }) }
    }).catch(() => { if (active) setSnapshot({ partnerId, error: true }) })
    const subscription = client.auth?.onAuthStateChange?.((event, session) => {
      if (event !== 'INITIAL_SESSION' && (event === 'SIGNED_OUT' || session?.user.id !== actor.current)) {
        if (active) { setSnapshot(null); setAttempt(value => value + 1) }
      }
    })?.data.subscription
    return () => { active = false; subscription?.unsubscribe() }
  }, [partnerId, dealRevision, confirmationOnly, attempt])
  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  if (current?.initial) return <PartnerTaskSettings partnerId={partnerId} initial={current.initial} confirmationOnly={confirmationOnly} />
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-busy={!current}><h2 className="text-xl font-bold">Aufgaben &amp; Belohnungen</h2>{current?.error ? <div role="alert" className="mt-3 text-sm leading-6"><p>Die Aufgaben konnten nicht geladen werden. Bitte erneut versuchen.</p><button type="button" className="mt-3 min-h-11 rounded-xl border border-slate-200 px-4 font-semibold text-[#0874d1]" onClick={() => { setSnapshot(null); setAttempt(value => value + 1) }}>Erneut laden</button></div> : <p role="status" className="mt-3 text-sm text-slate-600">Aufgaben werden geladen …</p>}</section>
}
