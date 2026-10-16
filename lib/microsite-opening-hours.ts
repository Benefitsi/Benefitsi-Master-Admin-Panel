/** Public schedule only. Weekdays follow ISO 8601: Monday=1, Sunday=7. */
export type OpeningInterval = {
  weekday: number | null
  opens_at: string | null
  closes_at: string | null
  is_closed: boolean | null
}
export type OpeningException = {
  holiday_date: string | null
  opens_at?: string | null
  closes_at?: string | null
  is_closed?: boolean | null
  repeats_yearly?: boolean | null
  label?: string | null
}
export type OpeningStatus = { state: 'open' | 'closed' | 'unknown'; nextChange: string | null }
export const OPENING_TIME_ZONE = 'Europe/Berlin'
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: OPENING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function wall(instant: number) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) }
}
function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}
function minute(value: string | null | undefined) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(value)) return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
}
// Resolve both folds using Intl's real zone offsets. A nonexistent clock time
// has no trustworthy boundary, so that operating day remains unknown.
function instant(date: string, minutes: number, edge: 'start' | 'end') {
  const target = Date.parse(`${date}T00:00:00Z`) + minutes * 60000
  const offsets = new Set<number>()
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = target + delta
    const local = wall(sample)
    offsets.add(Date.parse(`${local.date}T00:00:00Z`) + local.minute * 60000 - sample)
  }
  const matches = [...offsets].map(offset => target - offset).filter(value => {
    const local = wall(value)
    return local.date === date && local.minute === minutes
  })
  return matches.length ? (edge === 'start' ? Math.min(...matches) : Math.max(...matches)) : null
}
export function openingExceptionsForDate(exceptions: OpeningException[], date: string) {
  const exact = exceptions.filter(row => row.holiday_date === date && !row.repeats_yearly)
  return exact.length ? exact : exceptions.filter(row => row.repeats_yearly && row.holiday_date?.slice(5) === date.slice(5))
}

export function micrositeOpeningStatus(hours: OpeningInterval[], exceptions: OpeningException[] | null | undefined, now = new Date()): OpeningStatus {
  const unknown: OpeningStatus = { state: 'unknown', nextChange: null }
  if (!exceptions || !Number.isFinite(now.getTime())) return unknown
  const validDate = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value)
  if (exceptions.some(row => !validDate(row.holiday_date))) return unknown
  const today = wall(now.getTime()).date
  const spans: Array<[number, number]> = []
  const known = new Map<string, boolean>()
  const dates = new Set(Array.from({ length: 10 }, (_, index) => shift(today, index - 1)))
  // An otherwise closed weekly schedule may still have a future one-off opening.
  for (const exception of exceptions) {
    const date = exception.holiday_date!
    const candidates = exception.repeats_yearly ? [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1].map(year => `${year}${date.slice(4)}`) : [date]
    for (const candidate of candidates) if (validDate(candidate) && candidate >= today) dates.add(candidate)
  }
  for (const date of dates) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
    const special = openingExceptionsForDate(exceptions, date)
    const rows = special.length ? special : hours.filter(row => row.weekday === weekday)
    let valid = rows.length > 0
    const closed = rows.filter(row => row.is_closed === true)
    if (closed.length && closed.length !== rows.length) valid = false
    const daySpans: Array<[number, number]> = []
    for (const row of rows.filter(row => row.is_closed !== true)) {
      const startMinute = minute(row.opens_at), endMinute = minute(row.closes_at)
      if (startMinute === null || endMinute === null || (startMinute === endMinute && startMinute !== 0)) { valid = false; continue }
      const endDate = endMinute <= startMinute ? shift(date, 1) : date
      const start = instant(date, startMinute, 'start')
      let end = instant(endDate, endMinute, 'end')
      // A dated exception governs its entire calendar day, including a tail
      // from yesterday. Its own explicit intervals are processed separately.
      if (endDate !== date && openingExceptionsForDate(exceptions, endDate).length) end = instant(endDate, 0, 'start')
      if (start === null || end === null || end <= start) { valid = false; continue }
      daySpans.push([start, end])
    }
    known.set(date, valid)
    if (valid) spans.push(...daySpans)
  }
  if (!known.get(today)) {
    // Yesterday's explicit overnight interval remains usable on an otherwise
    // unspecified day; contradictory rows for today never become green.
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7
    if (hours.some(row => row.weekday === weekday) || openingExceptionsForDate(exceptions, today).length) return unknown
  }
  const merged: Array<[number, number]> = []
  for (const span of spans.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1)
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1])
    else merged.push([...span])
  }
  const current = merged.find(([start, end]) => start <= now.getTime() && now.getTime() < end)
  if (current) return { state: 'open', nextChange: wall(current[1]).date >= shift(today, 8) ? null : new Date(current[1]).toISOString() }
  if (!known.get(today)) return unknown
  const next = merged.find(([start]) => start > now.getTime())
  return { state: 'closed', nextChange: next ? new Date(next[0]).toISOString() : null }
}

export function openingStatusLabel(status: OpeningStatus, language: 'de' | 'en' = 'de') {
  const english = language === 'en'
  if (status.state === 'unknown') return english ? 'Opening hours unconfirmed' : 'Öffnungszeiten unklar'
  const label = status.state === 'open' ? (english ? 'Open now' : 'Jetzt geöffnet') : (english ? 'Closed now' : 'Jetzt geschlossen')
  if (!status.nextChange) return label
  const time = new Intl.DateTimeFormat(english ? 'en-GB' : 'de-DE', { timeZone: OPENING_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(status.nextChange))
  return `${label} · ${status.state === 'open' ? (english ? 'until' : 'bis') : (english ? 'opens' : 'öffnet')} ${time}`
}
