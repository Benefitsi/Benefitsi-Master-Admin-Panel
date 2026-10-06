export function normalizePartnerTypeValue(value?: string | null) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return 'Food & Drink'
  }

  const normalized = trimmed.toLowerCase()

  return normalized === 'restaurant' || normalized === 'restuarant'
    ? 'Food & Drink'
    : trimmed
}

export function partnerTypeSupportsMenu(value?: string | null) {
  return normalizePartnerTypeValue(value) === 'Food & Drink'
}
