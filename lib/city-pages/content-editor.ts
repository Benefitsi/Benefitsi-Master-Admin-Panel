import "server-only"

import type { CityContentType } from "@/lib/city-operations/contracts"
import { createAdminClient } from "@/lib/supabase/admin"

export type EditorOption = {
  value: string
  label: string
}

export type EditorField = {
  name: string
  label: string
  kind:
    | "text"
    | "textarea"
    | "select"
    | "url"
    | "number"
    | "datetime"
    | "date"
    | "time"
    | "tags"
    | "weekdays"
    | "opening_hours"
    | "checkbox"
    | "partner"
    | "deal"
  required?: boolean
  helper?: string
  placeholder?: string
  options?: EditorOption[]
  min?: number
  max?: number
  step?: number
  rows?: number
  maxLength?: number
  storage?: "content" | "schedule"
}

export type ContentEditorDefinition = {
  contentType: CityContentType
  table: string
  singular: string
  plural: string
  description: string
  titleField: string
  fields: EditorField[]
}

const sourceFields = (expiresRequired = false): EditorField[] => [
  {
    name: "source_url",
    label: "Quelle",
    kind: "url",
    helper: "Öffentliche Originalquelle für die spätere Agent-Prüfung.",
    placeholder: "https://…",
  },
  {
    name: "expires_at",
    label: "Prüf- oder Ablaufdatum",
    kind: "datetime",
    required: expiresRequired,
    helper: "Danach muss der Inhalt erneut verifiziert werden.",
  },
]

const imageFields: EditorField[] = [
  {
    name: "image_url",
    label: "Bild-URL",
    kind: "url",
    placeholder: "https://…",
  },
  {
    name: "image_credit_label",
    label: "Bildnachweis",
    kind: "text",
    maxLength: 240,
  },
  {
    name: "image_credit_url",
    label: "Link zum Bildnachweis",
    kind: "url",
  },
  {
    name: "image_license",
    label: "Bildlizenz",
    kind: "text",
    maxLength: 160,
  },
  {
    name: "image_license_url",
    label: "Link zur Lizenz",
    kind: "url",
  },
]

export const cityContentEditorDefinitions: Record<
  CityContentType,
  ContentEditorDefinition
> = {
  events: {
    contentType: "events",
    table: "city_events",
    singular: "Veranstaltung",
    plural: "Veranstaltungen",
    description: "Termine, Märkte, Kultur, Familienangebote und lokale Aktionen.",
    titleField: "title",
    fields: [
      {
        name: "title",
        label: "Titel",
        kind: "text",
        required: true,
        maxLength: 180,
      },
      {
        name: "description",
        label: "Beschreibung",
        kind: "textarea",
        required: true,
        rows: 7,
        maxLength: 6000,
      },
      {
        name: "category",
        label: "Kategorie",
        kind: "select",
        required: true,
        options: [
          { value: "family", label: "Familie" },
          { value: "culture", label: "Kultur" },
          { value: "market", label: "Markt" },
          { value: "partner", label: "Partner" },
          { value: "outdoor", label: "Outdoor" },
        ],
      },
      {
        name: "start_date",
        label: "Beginn",
        kind: "datetime",
        required: true,
      },
      {
        name: "end_date",
        label: "Ende",
        kind: "datetime",
        required: true,
      },
      {
        name: "location_name",
        label: "Veranstaltungsort",
        kind: "text",
        required: true,
        maxLength: 240,
      },
      {
        name: "partner_id",
        label: "Zugeordneter Partner",
        kind: "partner",
      },
      {
        name: "source_name",
        label: "Quellenbezeichnung",
        kind: "text",
        maxLength: 240,
      },
      {
        name: "organizer_name",
        label: "Veranstalter",
        kind: "text",
        maxLength: 240,
      },
      {
        name: "organizer_url",
        label: "Veranstalter-Website",
        kind: "url",
      },
      {
        name: "organizer_phone",
        label: "Veranstalter-Telefon",
        kind: "text",
        maxLength: 80,
      },
      {
        name: "organizer_email",
        label: "Veranstalter-E-Mail",
        kind: "text",
        maxLength: 240,
      },
      {
        name: "target_groups",
        label: "Zielgruppen",
        kind: "tags",
        helper:
          "Zum Beispiel Familien, Kinder, Senioren oder Besucher. Mit Komma oder neuer Zeile trennen.",
      },
      {
        name: "price_type",
        label: "Preisstatus",
        kind: "select",
        required: true,
        options: [
          { value: "unknown", label: "Noch nicht verifiziert" },
          { value: "free", label: "Kostenlos" },
          { value: "paid", label: "Kostenpflichtig" },
        ],
      },
      {
        name: "price_label",
        label: "Öffentliche Preisangabe",
        kind: "text",
        maxLength: 500,
        placeholder: "Kostenlos oder Erwachsene 12 €, Kinder 6 €",
      },
      {
        name: "ticket_url",
        label: "Ticket- oder Buchungslink",
        kind: "url",
      },
      {
        name: "accessibility_features",
        label: "Barrierefreiheitsmerkmale",
        kind: "tags",
        helper:
          "Nur verifizierte Merkmale, zum Beispiel stufenlos, rollstuhlgerechtes WC oder Höranlage.",
      },
      {
        name: "arrival_info",
        label: "Anreise",
        kind: "textarea",
        rows: 3,
        maxLength: 1600,
      },
      {
        name: "parking_info",
        label: "Parken",
        kind: "textarea",
        rows: 3,
        maxLength: 1600,
      },
      {
        name: "bad_weather_info",
        label: "Hinweis bei schlechtem Wetter",
        kind: "textarea",
        rows: 3,
        maxLength: 1600,
      },
      {
        name: "is_indoor",
        label: "Findet drinnen statt",
        kind: "checkbox",
      },
      {
        name: "recurrence_frequency",
        label: "Terminserie",
        kind: "select",
        storage: "schedule",
        helper:
          "Für Wochenmärkte und andere wiederkehrende Termine. Ohne Auswahl bleibt es ein Einzeltermin.",
        options: [
          { value: "", label: "Einzeltermin" },
          { value: "weekly", label: "Wöchentlich" },
          { value: "monthly", label: "Monatlich" },
        ],
      },
      {
        name: "recurrence_interval_count",
        label: "Wiederholung alle",
        kind: "number",
        storage: "schedule",
        min: 1,
        max: 52,
        step: 1,
        helper: "1 bedeutet jede Woche bzw. jeden Monat.",
      },
      {
        name: "recurrence_weekdays",
        label: "Wochentage",
        kind: "weekdays",
        storage: "schedule",
        options: [
          { value: "1", label: "Montag" },
          { value: "2", label: "Dienstag" },
          { value: "3", label: "Mittwoch" },
          { value: "4", label: "Donnerstag" },
          { value: "5", label: "Freitag" },
          { value: "6", label: "Samstag" },
          { value: "7", label: "Sonntag" },
        ],
        helper: "Nur bei wöchentlichen Serien auswählen.",
      },
      {
        name: "recurrence_month_day",
        label: "Tag im Monat",
        kind: "number",
        storage: "schedule",
        min: 1,
        max: 31,
        step: 1,
        helper: "Nur bei monatlichen Serien angeben.",
      },
      {
        name: "recurrence_start_time",
        label: "Serienbeginn",
        kind: "time",
        storage: "schedule",
      },
      {
        name: "recurrence_end_time",
        label: "Serienende",
        kind: "time",
        storage: "schedule",
      },
      {
        name: "recurrence_starts_on",
        label: "Serie gültig ab",
        kind: "date",
        storage: "schedule",
      },
      {
        name: "recurrence_ends_on",
        label: "Serie gültig bis",
        kind: "date",
        storage: "schedule",
        helper:
          "Ein endlicher Zeitraum zwingt zur erneuten Prüfung und verhindert veraltete Dauertermine.",
      },
      {
        name: "recurrence_display_text",
        label: "Öffentliche Rhythmusangabe",
        kind: "text",
        storage: "schedule",
        maxLength: 240,
        placeholder: "Jeden Freitag, in der Regel 08:00–12:00 Uhr",
      },
      {
        name: "recurrence_exception_dates",
        label: "Ausnahmetermine",
        kind: "tags",
        storage: "schedule",
        helper: "Datum im Format JJJJ-MM-TT, mit Komma oder neuer Zeile trennen.",
      },
      ...imageFields,
      ...sourceFields(true),
    ],
  },
  places: {
    contentType: "places",
    table: "city_places",
    singular: "Ort",
    plural: "Orte & Sehenswürdigkeiten",
    description: "Sehenswürdigkeiten, Ausflüge, Aktivitäten und wichtige lokale Orte.",
    titleField: "name",
    fields: [
      {
        name: "name",
        label: "Name",
        kind: "text",
        required: true,
        maxLength: 180,
      },
      {
        name: "description",
        label: "Ausführliche Beschreibung",
        kind: "textarea",
        required: true,
        rows: 8,
        maxLength: 8000,
      },
      {
        name: "category",
        label: "Kategorie",
        kind: "select",
        required: true,
        options: [
          { value: "sight", label: "Sehenswürdigkeit" },
          { value: "excursion", label: "Ausflugsziel" },
          { value: "activity", label: "Aktivität" },
          { value: "family", label: "Familie" },
          { value: "sports", label: "Sport" },
        ],
      },
      {
        name: "access",
        label: "Zugänglichkeit",
        kind: "select",
        required: true,
        options: [
          { value: "public", label: "Öffentlich" },
          { value: "tourism", label: "Touristisches Angebot" },
        ],
      },
      { name: "address", label: "Adresse", kind: "text", maxLength: 300 },
      {
        name: "latitude",
        label: "Breitengrad",
        kind: "number",
        min: -90,
        max: 90,
        step: 0.000001,
      },
      {
        name: "longitude",
        label: "Längengrad",
        kind: "number",
        min: -180,
        max: 180,
        step: 0.000001,
      },
      {
        name: "tags",
        label: "Tags",
        kind: "tags",
        helper: "Mit Komma oder neuer Zeile trennen.",
      },
      {
        name: "opening_hours",
        label: "Regelmäßige Öffnungszeiten",
        kind: "opening_hours",
        helper:
          "Leere Tage bleiben unverifiziert. Geschlossene Tage ausdrücklich markieren; saisonale Abweichungen im Hinweis erklären.",
      },
      {
        name: "opening_hours_note",
        label: "Saison- und Feiertagshinweis",
        kind: "textarea",
        rows: 3,
        maxLength: 1600,
      },
      {
        name: "admission_type",
        label: "Eintrittsstatus",
        kind: "select",
        required: true,
        options: [
          { value: "unknown", label: "Noch nicht verifiziert" },
          { value: "free", label: "Kostenlos" },
          { value: "paid", label: "Kostenpflichtig" },
        ],
      },
      {
        name: "admission_label",
        label: "Öffentliche Eintrittsangabe",
        kind: "text",
        maxLength: 500,
        placeholder: "Kostenlos oder Erwachsene 6 €, ermäßigt 3 €",
      },
      {
        name: "website_url",
        label: "Offizielle Website",
        kind: "url",
      },
      {
        name: "contact_phone",
        label: "Kontakt-Telefon",
        kind: "text",
        maxLength: 80,
      },
      {
        name: "contact_email",
        label: "Kontakt-E-Mail",
        kind: "text",
        maxLength: 240,
      },
      {
        name: "recommended_duration_minutes",
        label: "Empfohlene Aufenthaltsdauer in Minuten",
        kind: "number",
        min: 1,
        max: 1440,
        step: 5,
      },
      {
        name: "accessibility_features",
        label: "Barrierefreiheitsmerkmale",
        kind: "tags",
        helper: "Nur geprüfte, konkret benennbare Merkmale erfassen.",
      },
      {
        name: "arrival_info",
        label: "Anreise",
        kind: "textarea",
        rows: 3,
        maxLength: 1600,
      },
      {
        name: "parking_info",
        label: "Parken",
        kind: "textarea",
        rows: 3,
        maxLength: 1600,
      },
      {
        name: "weather_info",
        label: "Wetter- und Saisonhinweis",
        kind: "textarea",
        rows: 3,
        maxLength: 1600,
      },
      ...imageFields,
      ...sourceFields(),
    ],
  },
  playgrounds: {
    contentType: "playgrounds",
    table: "city_playgrounds",
    singular: "Spielplatz",
    plural: "Spielplätze",
    description: "Spielorte mit Ausstattung, Altersgruppen, Lage und aktueller Quelle.",
    titleField: "name",
    fields: [
      {
        name: "name",
        label: "Name",
        kind: "text",
        required: true,
        maxLength: 180,
      },
      {
        name: "description",
        label: "Beschreibung",
        kind: "textarea",
        rows: 6,
        maxLength: 5000,
      },
      {
        name: "location",
        label: "Lage / Adresse",
        kind: "text",
        required: true,
        maxLength: 300,
      },
      {
        name: "latitude",
        label: "Breitengrad",
        kind: "number",
        min: -90,
        max: 90,
        step: 0.000001,
      },
      {
        name: "longitude",
        label: "Längengrad",
        kind: "number",
        min: -180,
        max: 180,
        step: 0.000001,
      },
      {
        name: "equipment_tags",
        label: "Ausstattung",
        kind: "tags",
        placeholder: "Rutsche, Schaukel, Sandkasten",
      },
      {
        name: "age_tags",
        label: "Altersgruppen",
        kind: "tags",
        placeholder: "Kleinkinder, 6–12 Jahre",
      },
      ...sourceFields(),
    ],
  },
  clubs: {
    contentType: "clubs",
    table: "city_clubs",
    singular: "Verein",
    plural: "Vereine & Initiativen",
    description: "Lokale Vereine, Initiativen, Kontaktmöglichkeiten und Mitmachangebote.",
    titleField: "name",
    fields: [
      {
        name: "name",
        label: "Name",
        kind: "text",
        required: true,
        maxLength: 180,
      },
      {
        name: "category",
        label: "Kategorie",
        kind: "select",
        required: true,
        options: [
          { value: "sport", label: "Sport" },
          { value: "music", label: "Musik" },
          { value: "culture", label: "Kultur" },
          { value: "youth", label: "Jugend" },
          { value: "social", label: "Soziales" },
        ],
      },
      {
        name: "description",
        label: "Beschreibung",
        kind: "textarea",
        required: true,
        rows: 7,
        maxLength: 6000,
      },
      { name: "website", label: "Webseite", kind: "url" },
      {
        name: "contact",
        label: "Kontakt",
        kind: "textarea",
        rows: 3,
        maxLength: 1000,
      },
      { name: "tags", label: "Tags", kind: "tags" },
      ...sourceFields(),
    ],
  },
  routes: {
    contentType: "routes",
    table: "city_routes",
    singular: "Route",
    plural: "Routen",
    description: "Wanderungen, Radtouren und Spaziergänge mit belastbaren Eckdaten.",
    titleField: "title",
    fields: [
      {
        name: "title",
        label: "Titel",
        kind: "text",
        required: true,
        maxLength: 180,
      },
      {
        name: "type",
        label: "Routentyp",
        kind: "select",
        required: true,
        options: [
          { value: "hiking", label: "Wandern" },
          { value: "cycling", label: "Radfahren" },
          { value: "walking", label: "Spaziergang" },
        ],
      },
      {
        name: "distance_km",
        label: "Distanz in km",
        kind: "number",
        min: 0,
        max: 999,
        step: 0.1,
      },
      {
        name: "duration_minutes",
        label: "Dauer in Minuten",
        kind: "number",
        min: 1,
        max: 10000,
        step: 1,
      },
      {
        name: "difficulty",
        label: "Schwierigkeit",
        kind: "select",
        options: [
          { value: "", label: "Nicht angegeben" },
          { value: "leicht", label: "Leicht" },
          { value: "mittel", label: "Mittel" },
          { value: "anspruchsvoll", label: "Anspruchsvoll" },
        ],
      },
      {
        name: "start_location",
        label: "Startpunkt",
        kind: "text",
        maxLength: 300,
      },
      {
        name: "end_location",
        label: "Endpunkt",
        kind: "text",
        maxLength: 300,
      },
      { name: "region", label: "Region", kind: "text", maxLength: 180 },
      {
        name: "description",
        label: "Routenbeschreibung",
        kind: "textarea",
        required: true,
        rows: 8,
        maxLength: 8000,
      },
      { name: "tags", label: "Tags", kind: "tags" },
      ...sourceFields(),
    ],
  },
  guides: {
    contentType: "guides",
    table: "city_guides",
    singular: "Guide",
    plural: "Themenguides",
    description: "Thematische Einstiegsseiten für Suchmaschinen und konkrete Besuchsanlässe.",
    titleField: "title",
    fields: [
      {
        name: "slug",
        label: "URL-Slug",
        kind: "text",
        required: true,
        helper: "Kleinbuchstaben, Zahlen und Bindestriche.",
        maxLength: 160,
      },
      {
        name: "title",
        label: "Titel",
        kind: "text",
        required: true,
        maxLength: 180,
      },
      {
        name: "description",
        label: "Kurzbeschreibung",
        kind: "textarea",
        required: true,
        rows: 4,
        maxLength: 3000,
      },
      {
        name: "category",
        label: "Kategorie",
        kind: "select",
        required: true,
        options: [
          "partners",
          "food",
          "activities",
          "clubs",
          "sports",
          "family",
          "playgrounds",
          "sights",
          "excursions",
          "routes",
          "events",
          "benefits",
          "guides",
        ].map((value) => ({ value, label: value })),
      },
      {
        name: "intro",
        label: "Einleitung",
        kind: "textarea",
        rows: 7,
        maxLength: 7000,
      },
      {
        name: "tips",
        label: "Tipps",
        kind: "tags",
        helper: "Je Tipp eine neue Zeile.",
      },
      {
        name: "related_tags",
        label: "Verknüpfte Tags",
        kind: "tags",
      },
      {
        name: "available",
        label: "Guide nach Freigabe sichtbar schalten",
        kind: "checkbox",
      },
      ...sourceFields(),
    ],
  },
  challenges: {
    contentType: "challenges",
    table: "city_challenges",
    singular: "Challenge",
    plural: "Challenges",
    description: "Lokale Aufgaben, Schritte und Belohnungen für wiederkehrende Nutzung.",
    titleField: "title",
    fields: [
      {
        name: "title",
        label: "Titel",
        kind: "text",
        required: true,
        maxLength: 180,
      },
      {
        name: "description",
        label: "Beschreibung",
        kind: "textarea",
        required: true,
        rows: 6,
        maxLength: 5000,
      },
      {
        name: "steps",
        label: "Schritte",
        kind: "tags",
        required: true,
        helper: "Je Schritt eine neue Zeile.",
      },
      {
        name: "reward",
        label: "Belohnung",
        kind: "text",
        required: true,
        maxLength: 500,
      },
      {
        name: "sponsored_by",
        label: "Sponsor",
        kind: "text",
        maxLength: 240,
      },
      ...sourceFields(),
    ],
  },
  benefits: {
    contentType: "benefits",
    table: "city_partner_benefits",
    singular: "Vorteil",
    plural: "Partner-Vorteile",
    description: "Lokale Vorteile mit Partner- und optionaler Vorteils-Zuordnung.",
    titleField: "title",
    fields: [
      {
        name: "partner_id",
        label: "Partner",
        kind: "partner",
        required: true,
      },
      { name: "deal_id", label: "Zugeordneter Vorteil", kind: "deal" },
      {
        name: "title",
        label: "Titel",
        kind: "text",
        required: true,
        maxLength: 180,
      },
      {
        name: "description",
        label: "Beschreibung",
        kind: "textarea",
        required: true,
        rows: 6,
        maxLength: 5000,
      },
      {
        name: "type",
        label: "Vorteilstyp",
        kind: "select",
        required: true,
        options: [
          { value: "stamp_card", label: "Stempelkarte" },
          { value: "welcome", label: "Willkommensdeal" },
          { value: "deal_drop", label: "Deal Drop" },
          { value: "family", label: "Familie" },
          { value: "leisure", label: "Freizeit" },
        ],
      },
      ...sourceFields(),
    ],
  },
}

type JsonRow = Record<string, unknown>

export async function loadCityContentEditor(
  citySlug: string,
  contentType: CityContentType,
  contentId: string,
) {
  const admin = createAdminClient()
  const definition = cityContentEditorDefinitions[contentType]
  const cityResult = await admin
    .from("cities")
    .select("id,name,slug")
    .eq("slug", citySlug)
    .maybeSingle()

  if (cityResult.error) {
    throw new Error(`Stadt konnte nicht geladen werden: ${cityResult.error.message}`)
  }
  if (!cityResult.data) return { city: null, record: null, definition }

  if (contentId === "new") {
    return {
      city: cityResult.data as { id: string; name: string; slug: string },
      record: null,
      definition,
    }
  }

  const recordResult = await admin
    .from(definition.table)
    .select("*")
    .eq("id", contentId)
    .eq("city_id", cityResult.data.id)
    .maybeSingle()

  if (recordResult.error) {
    throw new Error(
      `Stadtinhalt konnte nicht geladen werden: ${recordResult.error.message}`,
    )
  }

  let record = (recordResult.data as JsonRow | null) ?? null
  if (record && contentType === "events") {
    const scheduleResult = await admin
      .from("city_event_schedules")
      .select("*")
      .eq("event_id", contentId)
      .maybeSingle()

    if (scheduleResult.error) {
      throw new Error(
        `Terminserie konnte nicht geladen werden: ${scheduleResult.error.message}`,
      )
    }

    if (scheduleResult.data) {
      const schedule = scheduleResult.data as JsonRow
      record = {
        ...record,
        recurrence_frequency: schedule.frequency,
        recurrence_interval_count: schedule.interval_count,
        recurrence_weekdays: schedule.weekdays,
        recurrence_month_day: schedule.month_day,
        recurrence_start_time: schedule.start_time,
        recurrence_end_time: schedule.end_time,
        recurrence_starts_on: schedule.starts_on,
        recurrence_ends_on: schedule.ends_on,
        recurrence_display_text: schedule.display_text,
        recurrence_exception_dates: schedule.exception_dates,
      }
    }
  }

  return {
    city: cityResult.data as { id: string; name: string; slug: string },
    record,
    definition,
  }
}
