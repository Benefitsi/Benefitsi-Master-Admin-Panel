export type ContentValidationIssue = {
  code: string
  field: string
  severity: "error" | "warning"
  message: string
}

export type ContentValidationResult = {
  errors: ContentValidationIssue[]
  warnings: ContentValidationIssue[]
}

type Values = Record<string, unknown>

function isRecord(value: unknown): value is Values {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
}

function hasNonNegativeAmount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

/**
 * Structured place tariffs are the public source of truth when present. A
 * label-only row is not enough for a paid place; at least one public amount
 * must be available. Free child rows may exist alongside the paid tariffs.
 */
export function hasStructuredPlacePricing(value: unknown) {
  if (!Array.isArray(value)) return false
  return value.some((entry) => {
    if (!isRecord(entry)) return false
    return hasText(entry.label) && hasNonNegativeAmount(entry.amount)
  })
}

export function structuredPlacePricingCount(value: unknown) {
  if (!Array.isArray(value)) return 0
  return value.filter((entry) => isRecord(entry) && hasText(entry.label)).length
}

/**
 * Event pricing is a JSON object rather than a tariff array. Keep this
 * resolver aligned with the public CityEvent model so price_label is only a
 * short override, never a second mandatory price database.
 */
export function hasStructuredEventPricing(value: unknown) {
  if (!isRecord(value)) return false

  const type = typeof value.type === "string" ? value.type : ""
  if (["FIXED", "FROM", "DONATION"].includes(type) && hasText(value.label)) {
    return true
  }

  if (type === "TIERS" && Array.isArray(value.tiers)) {
    return value.tiers.some(
      (tier) =>
        isRecord(tier) &&
        hasText(tier.label) &&
        hasNonNegativeAmount(tier.amount),
    )
  }

  return false
}

export function hasPublicPricing(
  label: unknown,
  structuredPricing: unknown,
  contentType: "places" | "events",
) {
  return hasText(label) ||
    (contentType === "places"
      ? hasStructuredPlacePricing(structuredPricing)
      : hasStructuredEventPricing(structuredPricing))
}

function changedAny(changedFields: ReadonlySet<string>, fields: string[]) {
  return fields.some((field) => changedFields.has(field))
}

function addIssue(
  result: ContentValidationResult,
  issue: Omit<ContentValidationIssue, "severity">,
  blocking: boolean,
) {
  const withSeverity = { ...issue, severity: blocking ? "error" : "warning" } as ContentValidationIssue
  if (blocking) result.errors.push(withSeverity)
  else result.warnings.push(withSeverity)
}

function dateValue(value: unknown) {
  if (!hasText(value)) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function timeValue(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function dateOnlyValue(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function emailValue(value: unknown) {
  return !hasText(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
}

function recurrenceIsValid(values: Values) {
  const frequency = typeof values.recurrence_frequency === "string"
    ? values.recurrence_frequency
    : ""
  if (!frequency) return true

  const weekdays = Array.isArray(values.recurrence_weekdays)
    ? values.recurrence_weekdays
    : []
  const interval = values.recurrence_interval_count
  const monthDay = values.recurrence_month_day
  const startTime = values.recurrence_start_time
  const endTime = values.recurrence_end_time
  const startsOn = values.recurrence_starts_on
  const endsOn = values.recurrence_ends_on
  const displayText = values.recurrence_display_text
  const sourceUrl = values.source_url

  if (
    !["weekly", "monthly"].includes(frequency) ||
    !Number.isInteger(interval) ||
    Number(interval) < 1 ||
    !timeValue(startTime) ||
    !timeValue(endTime) ||
    String(endTime) <= String(startTime) ||
    !dateOnlyValue(startsOn) ||
    !dateOnlyValue(endsOn) ||
    String(endsOn) < String(startsOn) ||
    !hasText(displayText) ||
    !hasText(sourceUrl) ||
    (frequency === "weekly" &&
      (weekdays.length === 0 ||
        weekdays.some((value) => !Number.isInteger(value) || value < 1 || value > 7))) ||
    (frequency === "monthly" &&
      (weekdays.length > 0 || !Number.isInteger(monthDay) || Number(monthDay) < 1 || Number(monthDay) > 31))
  ) {
    return false
  }

  const exceptionDates = Array.isArray(values.recurrence_exception_dates)
    ? values.recurrence_exception_dates
    : []
  return exceptionDates.every(
    (date) =>
      dateOnlyValue(date) &&
      String(date) >= String(startsOn) &&
      String(date) <= String(endsOn),
  )
}

/**
 * Cross-field rules are intentionally dirty-field aware. Existing content
 * gaps become warnings during an ordinary edit; new content or a change to a
 * dependent field still receives a blocking error.
 */
export function validateCityContentCrossFields({
  contentType,
  currentValues,
  nextValues,
  changedFields,
  isNew,
}: {
  contentType: string
  currentValues: Values
  nextValues: Values
  changedFields: ReadonlySet<string>
  isNew: boolean
}): ContentValidationResult {
  const result: ContentValidationResult = { errors: [], warnings: [] }

  if (contentType === "places") {
    const paid = nextValues.admission_type === "paid"
    const hasPricing = hasPublicPricing(
      nextValues.admission_label,
      nextValues.pricing,
      "places",
    )
    if (paid && !hasPricing) {
      addIssue(
        result,
        {
          code: "place_admission_validation",
          field: "admission_label",
          message: "Bei einem kostenpflichtigen Ort fehlt eine öffentliche Eintrittsinformation.",
        },
        isNew ||
          changedAny(changedFields, ["admission_type", "admission_label", "pricing"]),
      )
    }

    if (!emailValue(nextValues.contact_email)) {
      addIssue(
        result,
        {
          code: "place_contact_validation",
          field: "contact_email",
          message: "Bitte eine gültige Kontakt-E-Mail-Adresse eingeben.",
        },
        isNew || changedFields.has("contact_email"),
      )
    }
  }

  if (contentType === "events") {
    const paid = nextValues.price_type === "paid"
    const hasPricing = hasPublicPricing(
      nextValues.price_label,
      nextValues.pricing,
      "events",
    )
    if (paid && !hasPricing) {
      addIssue(
        result,
        {
          code: "event_price_validation",
          field: "price_label",
          message: "Bei einem kostenpflichtigen Termin fehlt eine öffentliche Preisangabe.",
        },
        isNew || changedAny(changedFields, ["price_type", "price_label", "pricing"]),
      )
    }

    const ticketing = isRecord(nextValues.ticketing) ? nextValues.ticketing : null
    const ticketed = ticketing && ["TICKETS", "REGISTRATION"].includes(String(ticketing.mode))
    const hasTicketUrl = hasText(nextValues.ticket_url) || (ticketing ? hasText(ticketing.url) : false)
    if (ticketed && !hasTicketUrl) {
      addIssue(
        result,
        {
          code: "event_ticket_validation",
          field: "ticket_url",
          message: "Bei einem ticket- oder registrierungspflichtigen Termin fehlt ein Ticket- oder Registrierungslink.",
        },
        isNew || changedAny(changedFields, ["ticketing", "ticket_url"]),
      )
    }

    const start = dateValue(nextValues.start_date)
    const end = dateValue(nextValues.end_date)
    const expires = dateValue(nextValues.expires_at)
    const datesValid = Boolean(
      start &&
        end &&
        expires &&
        end >= start &&
        expires >= end,
    )
    if (!datesValid) {
      addIssue(
        result,
        {
          code: "date_order",
          field: "start_date",
          message: "Beginn, Ende und Ablaufdatum des Termins sind nicht konsistent.",
        },
        isNew || changedAny(changedFields, ["start_date", "end_date", "expires_at"]),
      )
    }

    if (!emailValue(nextValues.organizer_email)) {
      addIssue(
        result,
        {
          code: "event_contact_validation",
          field: "organizer_email",
          message: "Bitte eine gültige Veranstalter-E-Mail-Adresse eingeben.",
        },
        isNew || changedFields.has("organizer_email"),
      )
    }

    const recurrenceFields = [
      "recurrence_frequency",
      "recurrence_interval_count",
      "recurrence_weekdays",
      "recurrence_month_day",
      "recurrence_start_time",
      "recurrence_end_time",
      "recurrence_starts_on",
      "recurrence_ends_on",
      "recurrence_display_text",
      "recurrence_exception_dates",
      "source_url",
    ]
    if (!recurrenceIsValid(nextValues)) {
      addIssue(
        result,
        {
          code: "recurrence_validation",
          field: "recurrence_frequency",
          message: "Die Terminserie ist unvollständig oder widersprüchlich.",
        },
        isNew || changedAny(changedFields, recurrenceFields),
      )
    }
  }

  // Keep the current snapshot in the function contract. This makes the
  // distinction between legacy debt and a newly introduced invalid value
  // explicit for callers and future validation rules.
  void currentValues
  return result
}
