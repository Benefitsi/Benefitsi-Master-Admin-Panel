export type CityMemoryAdminSlotStatus = "ACTIVE" | "PENDING_PLACE_RELATION"

export type CityMemoryAdminSlot = {
  id: string
  cityCode: string
  number: number
  displayName: string
  description: string
  status: CityMemoryAdminSlotStatus
  placeId?: string
  placeCanonicalSlug?: string
}

export type CityMemoryAdminConfig = {
  citySlug: string
  cityCode: string
  title: string
  description: string
  slots: CityMemoryAdminSlot[]
}

const annweilerSlots: CityMemoryAdminSlot[] = [
  {
    id: "annweiler-memory-01",
    cityCode: "ANN",
    number: 1,
    displayName: "Reichsburg Trifels",
    description: "Die markante Stauferburg über Annweiler.",
    status: "ACTIVE",
    placeId: "a17ae6fd-6e4e-4091-8e15-3e32a065e429",
    placeCanonicalSlug: "annweiler-trifels",
  },
  {
    id: "annweiler-memory-02",
    cityCode: "ANN",
    number: 2,
    displayName: "Burgruine Anebos",
    description: "Eine der drei Burgen über dem Trifelsland.",
    status: "ACTIVE",
    placeId: "3f976612-6c7d-4fed-82e7-bf4063b78ff4",
    placeCanonicalSlug: "annweiler-anebos",
  },
  {
    id: "annweiler-memory-03",
    cityCode: "ANN",
    number: 3,
    displayName: "Burgruine Scharfenberg / Münz",
    description: "Historische Burgruine mit Blick über das Trifelsland.",
    status: "ACTIVE",
    placeId: "054b50af-472a-4145-800e-0cd61c6d2577",
    placeCanonicalSlug: "annweiler-scharfenberg-muenz",
  },
  {
    id: "annweiler-memory-04",
    cityCode: "ANN",
    number: 4,
    displayName: "Asselstein",
    description: "Markanter Felsen und Naturziel über Annweiler.",
    status: "ACTIVE",
    placeId: "e8ca415c-6357-4f8d-b5e2-83f4ddd79137",
    placeCanonicalSlug: "annweiler-asselstein",
  },
  {
    id: "annweiler-memory-05",
    cityCode: "ANN",
    number: 5,
    displayName: "Rehbergturm",
    description: "Aussichtsturm mit weitem Blick über den Pfälzerwald.",
    status: "ACTIVE",
    placeId: "866ffe40-98df-4ba8-b3a0-e15686e49fd6",
    placeCanonicalSlug: "annweiler-rehbergturm",
  },
  {
    id: "annweiler-memory-06",
    cityCode: "ANN",
    number: 6,
    displayName: "Krappenfelsen",
    description: "Ruhiger Natur- und Aussichtspunkt rund um Annweiler.",
    status: "ACTIVE",
    placeId: "9ece2e23-f137-4ae0-b786-ecf34931a115",
    placeCanonicalSlug: "annweiler-krappenfelsen",
  },
  {
    id: "annweiler-memory-07",
    cityCode: "ANN",
    number: 7,
    displayName: "Gerberviertel an der Queich",
    description: "Historischer Straßenraum entlang der Queich.",
    status: "ACTIVE",
    placeId: "35b8b1b3-621b-46fe-8a07-5fe6073ad9eb",
    placeCanonicalSlug: "annweiler-gerbergasse",
  },
  {
    id: "annweiler-memory-08",
    cityCode: "ANN",
    number: 8,
    displayName: "Museum unterm Trifels",
    description: "Stadtgeschichte, Menschen und Geschichten aus Annweiler.",
    status: "ACTIVE",
    placeId: "88fc6c0a-ccb3-4342-baae-be8e828728bf",
    placeCanonicalSlug: "annweiler-museum-unterm-trifels",
  },
  {
    id: "annweiler-memory-09",
    cityCode: "ANN",
    number: 9,
    displayName: "Rathausplatz Annweiler",
    description: "Historischer Mittelpunkt der Annweilerer Altstadt.",
    status: "ACTIVE",
    placeId: "83d3624c-67c9-43a7-93dc-e20a24a0341b",
    placeCanonicalSlug: "annweiler-rathausplatz",
  },
  {
    id: "annweiler-memory-10",
    cityCode: "ANN",
    number: 10,
    displayName: "Bahnhof Annweiler am Trifels",
    description: "Das Tor zu Annweiler – bald als Memory Place verfügbar.",
    status: "PENDING_PLACE_RELATION",
    placeId: undefined,
  },
]

const cityMemoryConfigs: Record<string, CityMemoryAdminConfig> = {
  annweiler: {
    citySlug: "annweiler",
    cityCode: "ANN",
    title: "Annweiler Memory Collection",
    description: "Zehn stabile Slots für die Annweiler Memory Collection.",
    slots: annweilerSlots,
  },
}

const emptyConfig = (citySlug: string): CityMemoryAdminConfig => ({
  citySlug,
  cityCode: citySlug.slice(0, 3).toUpperCase(),
  title: "Memory Collection",
  description: "Für diese Stadt sind noch keine Memory-Slots konfiguriert.",
  slots: [],
})

export function getCityMemoryAdminConfig(citySlug: string) {
  return cityMemoryConfigs[citySlug] ?? emptyConfig(citySlug)
}

export function getCityMemoryAdminSlot(citySlug: string, slotId: string) {
  return getCityMemoryAdminConfig(citySlug).slots.find((slot) => slot.id === slotId)
}

export function isPendingCityMemorySlot(citySlug: string, slotId: string) {
  return getCityMemoryAdminSlot(citySlug, slotId)?.status === "PENDING_PLACE_RELATION"
}
