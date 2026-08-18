/**
 * Parse numeric values coming from an HTML form without coupling persistence
 * to the browser's locale. HTML number inputs normally submit a dot, while a
 * locale-aware text submission can contain a comma (and, in pasted values,
 * grouping separators).
 */
export function parseLocalizedDecimal(raw: string): number | undefined {
  const normalized = raw.trim().replace(/\s+/g, "")
  if (!normalized) return undefined

  const commaIndex = normalized.lastIndexOf(",")
  const dotIndex = normalized.lastIndexOf(".")
  let canonical = normalized

  if (commaIndex >= 0 && dotIndex >= 0) {
    canonical = commaIndex > dotIndex
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "")
  } else {
    canonical = normalized.replace(",", ".")
  }

  const value = Number(canonical)
  return Number.isFinite(value) ? value : undefined
}

/** Returns null for an intentionally empty field and undefined for invalid/out-of-range input. */
export function parseBoundedDecimalInput(
  raw: string,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (!raw.trim()) return null
  const value = parseLocalizedDecimal(raw)
  return value !== undefined && value >= minimum && value <= maximum
    ? value
    : undefined
}
