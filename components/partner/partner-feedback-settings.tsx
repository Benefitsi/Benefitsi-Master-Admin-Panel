'use client'

import { startTransition, useActionState, useId, useState } from 'react'
import { ArrowRight, Gift, MessageSquareHeart, ShieldCheck } from 'lucide-react'
import { updateFeedbackReward, type FeedbackSettingsResult } from '@/app/partner/feedback-actions'
import type { FeedbackSettingsRead } from '@/lib/partners/feedback'
import { useAdminLanguage } from '@/app/admin-language'

export function PartnerFeedbackSettings({ partnerId, initial }: {
  partnerId: string
  initial: FeedbackSettingsRead
}) {
  const { language } = useAdminLanguage()
  const controlId = useId()
  const settings = initial.settings
  const [enabled, setEnabled] = useState(settings?.enabled ?? false)
  const [dealId, setDealId] = useState(settings?.deal_id ?? '')
  const [result, action, pending] = useActionState(async (previous: FeedbackSettingsResult, form: FormData) => {
    const saved = await updateFeedbackReward(previous, form)
    if (saved.ok && saved.settings) {
      setEnabled(saved.settings.enabled)
      setDealId(saved.settings.deal_id ?? '')
    }
    return saved
  }, { ok: false, message: '' })
  const deals = settings?.available_deals ?? []
  const selected = deals.find(deal => deal.id === dealId)
  const validDays = settings?.reward_valid_days ?? 30

  return <section aria-labelledby={`${controlId}-heading`} className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <header className="flex items-start gap-4 border-b border-slate-100 px-5 py-6 sm:px-7">
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#0874d1]"><MessageSquareHeart size={25} /></span>
      <div className="min-w-0 flex-1">
        <h2 id={`${controlId}-heading`} className="text-xl font-bold tracking-tight">Feedback belohnen</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Bedanke dich für einen ausgefüllten Fragebogen mit einem persönlichen, einmalig einlösbaren Vorteil für den nächsten Besuch.</p>
      </div>
      <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 sm:block">Optional</span>
    </header>
    {!initial.available || !settings ? <p className="px-5 py-6 text-sm text-slate-600 sm:px-7">{initial.reason === 'feedback_pro_required' ? 'Besuchsfeedback ist nur mit Pro und passendem Verwaltungsrecht verfügbar.' : 'Feedback-Belohnungen sind für diesen Betrieb noch nicht verfügbar.'}</p> :
      <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[1.1fr_1fr]">
        <form onSubmit={event => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          startTransition(() => action(form))
        }} className="min-w-0 space-y-5">
          <input type="hidden" name="partner_id" value={partnerId} />
          <label htmlFor={`${controlId}-enabled`} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
            <input id={`${controlId}-enabled`} name="enabled" type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={pending || (!enabled && deals.length === 0)} className="size-5 shrink-0 accent-[#0874d1]" />
            <span className="text-sm font-semibold">Belohnung nach vollständigem Feedback freischalten</span>
          </label>
          <div>
            <label htmlFor={`${controlId}-deal`} className="mb-2 block text-sm font-semibold">Welchen Vorteil möchtest du verschenken?</label>
            <select id={`${controlId}-deal`} name="deal_id" value={dealId} onChange={event => setDealId(event.target.value)} disabled={!enabled || pending} required={enabled} aria-describedby={`${controlId}-help`} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500">
              <option value="">Vorteil auswählen</option>
              {dealId && !selected && <option value={dealId}>Bisheriger Vorteil ist nicht mehr verfügbar</option>}
              {deals.map(deal => <option key={deal.id} value={deal.id} data-admin-i18n-ignore="true">{deal.title}</option>)}
            </select>
            <p id={`${controlId}-help`} className="mt-2 text-xs leading-5 text-slate-500">Geeignet sind aktive Rabatte oder Gratisartikel für alle Gäste ohne zusätzliche Besuchs-, Zeit- oder Stempelvoraussetzungen, Mindestbestellwert, Kontingent oder Rabattobergrenze. Die angezeigten Einlösebedingungen gelten weiterhin.</p>
            {!deals.length && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Lege zuerst einen geeigneten aktiven Vorteil an. Danach kannst du ihn hier als Belohnung auswählen.</p>}
          </div>
          <p className="flex items-start gap-2 text-sm leading-6 text-slate-600"><ShieldCheck aria-hidden="true" size={19} className="mt-0.5 shrink-0 text-slate-500" />Die Belohnung ist unabhängig von der Bewertung. Antworten werden zusammengefasst ausgewertet; einzelne Gäste und Freitexte erscheinen nicht in deiner Auswertung.</p>
          {result.message && <p role={result.ok ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm ${result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{result.message}</p>}
          <button type="submit" disabled={pending || (enabled && !selected)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0874d1] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#065da8] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{pending ? 'Wird gespeichert …' : 'Einstellung speichern'}<ArrowRight aria-hidden="true" size={17} /></button>
        </form>
        <aside aria-label="Vorschau für deine Gäste" className="min-w-0 rounded-2xl border border-sky-100 bg-[#f4f9ff] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">So sehen es deine Gäste</p>
          <div className="mt-4 flex items-center gap-3"><Gift aria-hidden="true" size={25} className="shrink-0 text-[#0874d1]" /><h3 className="text-lg font-bold">Ein Dankeschön für dein Feedback</h3></div>
          {enabled && selected ? <>
            <p data-admin-i18n-ignore="true" className="mt-4 text-xl font-bold text-[#061829]">{selected.title}</p>
            {selected.description && <p data-admin-i18n-ignore="true" className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{selected.description}</p>}
            {selected.terms && <div className="mt-4 border-t border-sky-100 pt-4"><p className="text-xs font-semibold text-slate-700">Einlösebedingungen</p><p data-admin-i18n-ignore="true" className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{selected.terms}</p></div>}
            <p data-admin-i18n-ignore="true" className="mt-4 text-xs leading-5 text-slate-500">{language === 'en'
              ? `Unlocked once after submission, valid for up to ${validDays} days${selected.expires_at ? `, no later than ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin' }).format(new Date(selected.expires_at))}` : ''}. Rewards already displayed remain promised.`
              : `Nach dem Absenden einmalig freigeschaltet, bis zu ${validDays} Tage gültig${selected.expires_at ? `, spätestens bis ${new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin' }).format(new Date(selected.expires_at))}` : ''}. Bereits angezeigte Belohnungen bleiben zugesagt.`}</p>
          </> : <p className="mt-4 text-sm leading-6 text-slate-600">{enabled ? 'Wähle einen Vorteil, um die Vorschau zu sehen.' : 'Der Fragebogen bleibt freiwillig. Aktuell ist keine Belohnung verknüpft.'}</p>}
        </aside>
      </div>}
  </section>
}
