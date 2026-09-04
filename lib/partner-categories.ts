export const partnerTypeOptions = [
  { value: "Food & Drink", label: "Food & Drink" },
  { value: "Services", label: "Services" },
  { value: "Wellness", label: "Wellness" },
  { value: "Activities", label: "Activities" },
] as const

type KnownPartnerType = "Food & Drink" | "Services" | "Wellness" | "Activities"

export const partnerCategoriesByType: Record<KnownPartnerType, readonly string[]> = {
  "Food & Drink": [
    "Doner Kebab",
    "Pizza",
    "Restaurant",
    "Bowl",
    "Falafel",
    "Chinese",
    "Snack Bar",
    "Soup",
    "Cafe",
    "Grill",
    "Burger",
    "Thai",
    "Sushi",
    "Asian",
    "Indian",
    "Ice Cream",
    "Breakfast",
    "Greek",
    "Tarte Flambee",
    "Bar",
    "Winery",
    "Bistro",
    "Pastry Shop",
    "Bakery",
    "Shisha",
    "Juice Bar",
    "Tea House",
    "Catering",
    "Butcher",
    "Cake Shop",
  ],
  Services: ["Hotel", "Car Wash", "Parking Garage", "Taxi"],
  Wellness: [
    "Hairdresser",
    "Barber",
    "Massage",
    "Spa",
    "Nail Salon",
    "Beauty Salon",
  ],
  Activities: [
    "Swimming Pool",
    "Zoo",
    "Cinema",
    "Leisure Center",
    "Climbing Gym",
    "Laser Tag",
    "Trampoline Park",
    "Play Park",
    "Escape Room",
    "Mini Golf",
    "Go-Karting",
    "Bowling",
    "CrossFit",
    "Gym",
    "Castle",
    "Attraction",
    "Adventure",
    "Experiences",
  ],
} as const

const canonicalCategorySet = new Set<string>(
  Object.values(partnerCategoriesByType).flat(),
)

const categoryAliasEntries: Array<[string, string]> = [
  ["doner", "Doner Kebab"],
  ["doner kebab", "Doner Kebab"],
  ["döner", "Doner Kebab"],
  ["doener", "Doner Kebab"],
  ["shawarma", "Doner Kebab"],
  ["imbiss", "Snack Bar"],
  ["snack bar", "Snack Bar"],
  ["suppe", "Soup"],
  ["suppen", "Soup"],
  ["soups", "Soup"],
  ["asia", "Asian"],
  ["asiatisch", "Asian"],
  ["inder", "Indian"],
  ["indisch", "Indian"],
  ["eis", "Ice Cream"],
  ["ice cream", "Ice Cream"],
  ["frühstück", "Breakfast"],
  ["fruehstueck", "Breakfast"],
  ["grieche", "Greek"],
  ["griechisch", "Greek"],
  ["flammkuchen", "Tarte Flambee"],
  ["weingut", "Winery"],
  ["bäckerei", "Bakery"],
  ["baeckerei", "Bakery"],
  ["saftladen", "Juice Bar"],
  ["teehaus", "Tea House"],
  ["metzgerei", "Butcher"],
  ["butcher shop", "Butcher"],
  ["konditorei", "Cake Shop"],
  ["friseur", "Hairdresser"],
  ["schwimmbad", "Swimming Pool"],
  ["kino", "Cinema"],
  ["freizeitcenter", "Leisure Center"],
  ["nagelstudio", "Nail Salon"],
  ["kosmetik", "Beauty Salon"],
  ["kletterhalle", "Climbing Gym"],
  ["trampolin", "Trampoline Park"],
  ["spielpark", "Play Park"],
  ["minigolf", "Mini Golf"],
  ["kart", "Go-Karting"],
  ["waschanlage", "Car Wash"],
  ["parkhaus", "Parking Garage"],
  ["burg", "Castle"],
  ["erlebnisse", "Experiences"],
  ["bowls", "Bowl"],
  ["burgers", "Burger"],
  ["café", "Cafe"],
]

const canonicalCategoryByAlias = new Map(
  categoryAliasEntries.map(([alias, canonical]) => [alias.toLowerCase(), canonical]),
)

for (const category of canonicalCategorySet) {
  canonicalCategoryByAlias.set(category.toLowerCase(), category)
}

export const allPartnerCategories: string[] = Array.from(canonicalCategorySet)

export const allPartnerCategoryOptions = allPartnerCategories.map((category) => ({
  value: category,
  label: category,
}))

function normalizePartnerTypeForCategories(value?: string | null) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return "Food & Drink"
  }

  const normalized = trimmed.toLowerCase()

  if (normalized === "restaurant" || normalized === "restuarant") {
    return "Food & Drink"
  }

  return trimmed
}

export function getPartnerCategoriesForType(partnerType?: string | null): string[] {
  const normalizedType = normalizePartnerTypeForCategories(partnerType)

  if (normalizedType in partnerCategoriesByType) {
    return [
      ...partnerCategoriesByType[normalizedType as KnownPartnerType],
    ]
  }

  return allPartnerCategories
}

export function isKnownPartnerType(partnerType?: string | null) {
  const normalizedType = normalizePartnerTypeForCategories(partnerType)
  return normalizedType in partnerCategoriesByType
}

export function normalizePartnerCategory(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  return canonicalCategoryByAlias.get(trimmed.toLowerCase()) ?? trimmed
}

export function normalizePartnerCategories(
  values?: Array<string | null | undefined> | null,
) {
  const deduped: string[] = []
  const seen = new Set<string>()

  for (const raw of values ?? []) {
    const normalized = normalizePartnerCategory(raw)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
  }

  return deduped
}

export function normalizePartnerCategoriesForType(
  partnerType: string | null | undefined,
  values?: Array<string | null | undefined> | null,
) {
  const normalized = normalizePartnerCategories(values)

  if (!isKnownPartnerType(partnerType)) {
    return normalized
  }

  const allowed = new Set<string>(getPartnerCategoriesForType(partnerType))
  return normalized.filter((value) => allowed.has(value))
}

export function partnerCategoryOptionsForType(partnerType?: string | null) {
  return getPartnerCategoriesForType(partnerType).map((category) => ({
    value: category,
    label: category,
  }))
}

export function isPartnerCategoryAllowedForType(
  partnerType: string | null | undefined,
  value: string | null | undefined,
) {
  const normalized = normalizePartnerCategory(value)
  if (!normalized) return false
  if (!isKnownPartnerType(partnerType)) return true

  return getPartnerCategoriesForType(partnerType).includes(normalized)
}
