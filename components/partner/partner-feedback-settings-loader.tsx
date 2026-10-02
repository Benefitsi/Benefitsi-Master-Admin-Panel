'use client'

import { useEffect, useState } from 'react'
import { Gift } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { readFeedbackSettings, type FeedbackSettingsRead } from '@/lib/partners/feedback'
import { PartnerFeedbackSettings } from '@/components/partner/partner-feedback-settings'

type Snapshot = { partnerId: string } & (
  | { initial: FeedbackSettingsRead; error?: never }
  | { error: true; initial?: never }
)

export function PartnerFeedbackSettingsLoader({ partnerId, dealRevision = '' }: {
  partnerId: string
  dealRevision?: string
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [attempt, setAttempt] = useState(0)
  const current = snapshot?.partnerId === partnerId ? snapshot : null

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const initial = await readFeedbackSettings(createClient(), partnerId)
        if (active) setSnapshot({ partnerId, initial })
      } catch {
        if (active) setSnapshot({ partnerId, error: true })
      }
    }
    void load()
    return () => { active = false }
  }, [partnerId, dealRevision, attempt])

  if (current && !current.error) {
    return <PartnerFeedbackSettings key={partnerId} partnerId={partnerId} initial={current.initial} />
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-busy={!current}>
    <div className="flex items-center gap-3 text-[#061829]">
      <Gift aria-hidden="true" size={23} className="shrink-0 text-[#0874d1]" />
      <h2 className="text-lg font-bold">Feedback belohnen</h2>
    </div>
    {current?.error ? <div role="alert" className="mt-4 text-sm leading-6 text-slate-600">
      <p>Die Feedback-Einstellungen konnten nicht geladen werden. Bitte erneut versuchen.</p>
      <button type="button" className="mt-3 min-h-11 rounded-xl border border-slate-200 px-4 font-semibold text-[#0874d1] hover:bg-sky-50" onClick={() => {
        setSnapshot(null)
        setAttempt(value => value + 1)
      }}>Erneut laden</button>
    </div> : <p role="status" className="mt-4 text-sm leading-6 text-slate-500">Feedback-Einstellungen werden geladen …</p>}
  </section>
}
