'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readPartnerTaskSettings } from '@/lib/partners/tasks'
import { PartnerTaskSettings } from '@/components/partner/partner-task-settings'
import type { PartnerTaskSettingsRead } from '@/lib/partners/tasks'

type Snapshot = { partnerId: string; requestKey: string; initial?: PartnerTaskSettingsRead; error?: boolean }
export function PartnerTaskSettingsLoader({ partnerId, dealRevision = '', confirmationOnly = false }: { partnerId: string; dealRevision?: string; confirmationOnly?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [attempt, setAttempt] = useState(0)
  const actor = useRef<string | null>(null)
  const requestKey = JSON.stringify([partnerId, dealRevision, confirmationOnly, attempt])
  const current = snapshot?.partnerId === partnerId ? snapshot : null
  useEffect(() => {
    let active = true
    const client = createClient()
    void readPartnerTaskSettings(client, partnerId, confirmationOnly).then(initial => {
      if (active) { actor.current = initial.actorId; setSnapshot({ partnerId, requestKey, initial }) }
    }).catch(() => {
      if (active) setSnapshot(previous => ({ partnerId, requestKey, initial: previous?.partnerId === partnerId ? previous.initial : undefined, error: true }))
    })
    const subscription = client.auth?.onAuthStateChange?.((event, session) => {
      if (event !== 'INITIAL_SESSION' && (event === 'SIGNED_OUT' || session?.user.id !== actor.current)) {
        if (active) { active = false; actor.current = session?.user.id ?? null; setSnapshot(null); setAttempt(value => value + 1) }
      }
    })?.data.subscription
    return () => { active = false; subscription?.unsubscribe() }
  }, [partnerId, confirmationOnly, requestKey])
  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  const refreshing = current?.requestKey !== requestKey
  const error = current?.error ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6"><p>Die Aufgaben konnten nicht geladen werden. Dein Entwurf bleibt erhalten. Bitte erneut laden und die Gästevorschau vor dem Speichern neu prüfen.</p><button type="button" disabled={refreshing} className="mt-3 min-h-11 rounded-xl border border-slate-200 px-4 font-semibold text-[#0874d1] disabled:text-slate-400" onClick={() => setAttempt(value => value + 1)}>Erneut laden</button></div> : null
  if (current?.initial) return <div className="space-y-4" aria-busy={refreshing}>{error}<PartnerTaskSettings partnerId={partnerId} initial={current.initial} confirmationOnly={confirmationOnly} eligibilityKey={requestKey} eligibilityReady={!refreshing && !current.error} /></div>
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-busy={refreshing}><h2 className="text-xl font-bold">Aufgaben &amp; Belohnungen</h2>{error ?? <p role="status" className="mt-3 text-sm text-slate-600">Aufgaben werden geladen …</p>}</section>
}
