const DEFAULT_ZONE = "Europe/Berlin"

function formatter(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    })
  } catch {
    throw new Error("Bitte eine gültige IANA-Zeitzone angeben, zum Beispiel Europe/Berlin.")
  }
}

function localParts(value: Date, format: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(format.formatToParts(value).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

/** Format an instant for datetime-local in the partner's zone, never the browser's. */
export function formatPartnerDateTime(value?: string | null, timeZone = DEFAULT_ZONE) {
  if (!value) return ""
  const instant = new Date(value)
  if (!Number.isFinite(instant.getTime())) return value
  return localParts(instant, formatter(timeZone)).slice(0, 16)
}

/** Resolve a wall time to exactly one instant. DST gaps/overlaps require another time. */
export function partnerDateTimeToUtc(value: string | null | undefined, timeZone = DEFAULT_ZONE): string | null {
  if (!value?.trim()) return null
  const format = formatter(timeZone)
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const instant = new Date(value)
    if (!Number.isFinite(instant.getTime())) throw new Error("Bitte ein gültiges Datum mit Uhrzeit angeben.")
    return instant.toISOString()
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) throw new Error("Bitte ein gültiges Datum mit Uhrzeit angeben.")
  const wallTime = `${match[1]}T${match[2]}:${match[3] || "00"}`
  const wallEpoch = Date.parse(`${wallTime}Z`)
  if (!Number.isFinite(wallEpoch) || new Date(wallEpoch).toISOString().slice(0, 19) !== wallTime) {
    throw new Error("Bitte ein gültiges Datum mit Uhrzeit angeben.")
  }
  const offsets = new Set<number>()
  // Both sides of any local DST transition, including half-hour shifts.
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = wallEpoch + hours * 3_600_000
    offsets.add(Date.parse(`${localParts(new Date(probe), format)}Z`) - probe)
  }
  const candidates = [...offsets].map(offset => wallEpoch - offset)
    .filter(candidate => localParts(new Date(candidate), format) === wallTime)
  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0
      ? `Diese Ortszeit existiert in ${timeZone} wegen der Zeitumstellung nicht. Bitte wähle eine andere Uhrzeit.`
      : `Diese Ortszeit kommt in ${timeZone} wegen der Zeitumstellung zweimal vor. Bitte wähle eine eindeutige Uhrzeit außerhalb der Umstellung.`)
  }
  return new Date(candidates[0]).toISOString()
}
