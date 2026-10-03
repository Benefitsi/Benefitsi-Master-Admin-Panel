export const calendarPeriodOptions = [
  { value: "days", label: "Tag", calendar: "Kalendertag", plural: "Tage" },
  { value: "weeks", label: "Woche", calendar: "Kalenderwoche", plural: "Wochen" },
  { value: "months", label: "Monat", calendar: "Kalendermonat", plural: "Monate" },
  { value: "quarters", label: "Quartal", calendar: "Kalenderquartal", plural: "Quartale" },
] as const

const calendarKeys = ["streak_mode", "required_visits_per_period", "period_unit", "required_consecutive_periods"] as const
export function legacyStreakInterval(metadata: Record<string, unknown>, expiryDays?: number | null) {
  const explicit = Number(metadata.streak_interval_value), cadence = Number(metadata.cadence_value)
  const value = explicit > 0 ? explicit : cadence > 0 ? cadence : expiryDays || 1
  const rawUnit = String(metadata.streak_interval_unit || metadata.cadence_unit || "days").toLowerCase()
  const unit = rawUnit === "week" || rawUnit === "weeks" ? "weeks" : rawUnit === "month" || rawUnit === "months" ? "months" : "days"
  return { value: Math.max(1, value), unit }
}
function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647
}
function numberFromForm(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === "string" && value.trim() ? Number(value) : null
}

/** A missing selector denotes a legacy client; preserve its stored semantics. */
export function buildStreakMetadata(form: FormData, prefix: string, previous: Record<string, unknown>) {
  const metadata = { ...previous }
  if (!form.has(`${prefix}streak_mode`)) return metadata
  const mode = form.get(`${prefix}streak_mode`)
  for (const key of calendarKeys) delete metadata[key]
  if (mode === "calendar_frequency") {
    metadata.streak_mode = mode
    metadata.required_visits_per_period = numberFromForm(form, `${prefix}required_visits_per_period`)
    metadata.required_consecutive_periods = numberFromForm(form, `${prefix}required_consecutive_periods`)
    metadata.period_unit = form.get(`${prefix}period_unit`)
  } else if (mode === "legacy_gap") {
    metadata.streak_interval_value = numberFromForm(form, `${prefix}streak_interval_value`)
    metadata.streak_interval_unit = form.get(`${prefix}streak_interval_unit`)
  } else {
    metadata.streak_mode = mode
  }
  return metadata
}

export function streakFieldErrors(metadata: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!metadata.streak_mode) return errors
  if (metadata.streak_mode !== "calendar_frequency") return { streak_mode: "Bitte eine gültige Serienregel auswählen." }
  if (!positiveInteger(metadata.required_visits_per_period)) errors.required_visits_per_period = "Bitte eine ganze Mindestanzahl ab 1 eingeben."
  if (!positiveInteger(metadata.required_consecutive_periods)) errors.required_consecutive_periods = "Bitte eine ganze Serienlänge ab 1 eingeben."
  if (!calendarPeriodOptions.some(option => option.value === metadata.period_unit)) errors.period_unit = "Bitte Tag, Woche, Monat oder Quartal auswählen."
  return errors
}

export function describeCalendarStreak(metadata: Record<string, unknown>) {
  if (metadata.streak_mode !== "calendar_frequency" || Object.keys(streakFieldErrors(metadata)).length) return null
  const period = calendarPeriodOptions.find(option => option.value === metadata.period_unit)!
  const visits = metadata.required_visits_per_period as number
  const periods = metadata.required_consecutive_periods as number
  return `Mindestens ${visits} qualifizierte${visits === 1 ? "r Kauf" : " Käufe"} pro ${period.calendar} über ${periods} aufeinanderfolgende ${periods === 1 ? period.label : period.plural}`
}
