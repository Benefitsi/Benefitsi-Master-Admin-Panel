"use client"

import { useEffect, useState } from 'react'
import { micrositeOpeningStatus, openingStatusLabel, type OpeningInterval, type OpeningException } from '@/lib/microsite-opening-hours'
import { MicrositeLink } from './microsite-integration'

type Schedule = { opening_status_unavailable?: boolean; opening_hours: OpeningInterval[]; holidays?: OpeningException[] | null }

export function MicrositeOpeningStatus({ partner, language = 'de' }: { partner: Schedule; language?: 'de' | 'en' }) {
  // Server and first client render agree; no cached status can claim "open".
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const timer = window.setInterval(update, 1000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  const status = now ? micrositeOpeningStatus(partner.opening_hours, partner.opening_status_unavailable ? null : partner.holidays, now) : { state: 'unknown' as const, nextChange: null }
  return <MicrositeLink href="#oeffnungszeiten" className="inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline" data-opening-state={status.state}>
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${status.state === 'open' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
    <span>{openingStatusLabel(status, language)}</span>
  </MicrositeLink>
}

export function MicrositeOpeningHours({ partner, language = 'de' }: { partner: Schedule; language?: 'de' | 'en' }) {
  const english = language === 'en'
  const days = english ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] : ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
  const describe = (row: { is_closed?: boolean | null; opens_at?: string | null; closes_at?: string | null }) => row.is_closed === true ? (english ? 'Closed' : 'Geschlossen') : row.opens_at && row.closes_at ? row.opens_at.slice(0, 5) === '00:00' && row.closes_at.slice(0, 5) === '00:00' ? '24 h' : `${row.opens_at.slice(0, 5)}–${row.closes_at.slice(0, 5)}${row.closes_at < row.opens_at ? (english ? ' (next day)' : ' (Folgetag)') : ''}` : (english ? 'Please confirm' : 'Bitte erfragen')
  return <div id="oeffnungszeiten" className="scroll-mt-24">
    <h3 className="mb-2 font-bold">{english ? 'Opening hours' : 'Öffnungszeiten'}</h3>
    <dl className="space-y-1 text-sm">{days.map((day, index) => {
      const rows = partner.opening_hours.filter(row => row.weekday === index + 1)
      return <div key={day} className="flex flex-wrap justify-between gap-x-4"><dt>{day}</dt><dd>{rows.length ? rows.map(describe).join(', ') : (english ? 'Please confirm' : 'Bitte erfragen')}</dd></div>
    })}</dl>
    {partner.holidays?.length ? <><h4 className="mb-1 mt-3 font-bold">{english ? 'Special hours' : 'Sonderöffnungszeiten'}</h4><ul className="space-y-1 text-sm">{partner.holidays.map((row, index) => <li key={index}>{row.holiday_date}{row.repeats_yearly ? (english ? ' (yearly)' : ' (jährlich)') : ''}{row.label ? ` · ${row.label}` : ''}: {describe(row)}</li>)}</ul></> : null}
    {(partner.holidays == null || partner.opening_status_unavailable) ? <p className="mt-2 text-sm">{english ? 'Special hours could not be confirmed. Please contact the venue.' : 'Sonderzeiten konnten nicht bestätigt werden. Bitte den Betrieb kontaktieren.'}</p> : null}
    <p className="mt-2 text-xs opacity-75">{english ? 'All times Europe/Berlin.' : 'Alle Zeiten Europe/Berlin.'}</p>
  </div>
}
