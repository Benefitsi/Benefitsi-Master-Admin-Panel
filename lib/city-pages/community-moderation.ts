export type MeetupApprovalInput = {
  hostUserId: string | null
  startsAt: string | null
  endsAt: string | null
  meetingPoint: string | null
  lifecycleStatus?: string
}

function berlinDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"}).format(date)
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** UI preflight only; the authenticated database RPC remains authoritative. */
export function meetupApprovalBlockers(input: MeetupApprovalInput, now = new Date()): string[] {
  const blockers: string[] = []
  if (!input.hostUserId || !uuidPattern.test(input.hostUserId)) blockers.push("Ein verifiziertes Gastgeberkonto fehlt. Eine Kontakt-E-Mail ersetzt kein Benefitsi-Konto.")
  const start = Date.parse(input.startsAt ?? "")
  const end = input.endsAt ? Date.parse(input.endsAt) : null
  if (!Number.isFinite(start)) blockers.push("Ein gültiger strukturierter Beginn fehlt.")
  else if ((end !== null && end < now.getTime()) || (end === null && berlinDateKey(new Date(start)) < berlinDateKey(now))) blockers.push("Der Termin ist bereits vergangen. Bitte einen neuen Termin vom Gastgeber einreichen lassen.")
  if (input.endsAt && (!Number.isFinite(end) || end! <= start)) blockers.push("Das Ende muss nach dem Beginn liegen.")
  if (!input.meetingPoint?.trim()) blockers.push("Ein öffentlicher Treffpunkt fehlt.")
  if (["CANCELLED", "COMPLETED", "ENDED"].includes(input.lifecycleStatus ?? "")) blockers.push("Abgesagte oder abgeschlossene Treffen können nicht freigegeben werden.")
  return blockers
}

export function pendingNativeMeetups<T extends { id: string; moderationStatus: string }>(meetups: T[], linkedIds: string[]): T[] {
  const linked = new Set(linkedIds)
  return meetups.filter(meetup => ["PENDING", "FLAGGED"].includes(meetup.moderationStatus) && !linked.has(meetup.id))
}
