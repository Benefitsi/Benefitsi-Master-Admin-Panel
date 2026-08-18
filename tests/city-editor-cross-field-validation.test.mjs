import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  hasPublicPricing,
  validateCityContentCrossFields,
} from "../lib/city-pages/content-validation.ts"

const contentAction = new URL(
  "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/actions.ts",
  import.meta.url,
)
const editorPage = new URL(
  "../app/city-pages/[citySlug]/content/[contentType]/[contentId]/page.tsx",
  import.meta.url,
)

function placeValidation({
  current = {},
  next = current,
  changed = [],
  isNew = false,
} = {}) {
  return validateCityContentCrossFields({
    contentType: "places",
    currentValues: current,
    nextValues: next,
    changedFields: new Set(changed),
    isNew,
  })
}

test("existing paid place with missing pricing allows unrelated title edits", () => {
  const result = placeValidation({
    current: { admission_type: "paid", admission_label: null, pricing: [] },
    next: { admission_type: "paid", admission_label: null, pricing: [], name: "Neuer Titel" },
    changed: ["name"],
  })
  assert.deepEqual(result.errors, [])
  assert.equal(result.warnings[0]?.code, "place_admission_validation")
})

test("existing paid place with missing pricing allows unrelated description edits", () => {
  const result = placeValidation({
    current: { admission_type: "paid", admission_label: null, pricing: [] },
    next: { admission_type: "paid", admission_label: null, pricing: [], description: "Neue Beschreibung" },
    changed: ["description"],
  })
  assert.deepEqual(result.errors, [])
  assert.equal(result.warnings.length, 1)
})

test("new paid place without pricing is blocked", () => {
  const result = placeValidation({
    next: { admission_type: "paid", admission_label: null, pricing: [] },
    changed: ["admission_type"],
    isNew: true,
  })
  assert.equal(result.errors[0]?.code, "place_admission_validation")
  assert.deepEqual(result.warnings, [])
})

test("existing place changing free to paid without pricing is blocked", () => {
  const result = placeValidation({
    current: { admission_type: "free", admission_label: null, pricing: [] },
    next: { admission_type: "paid", admission_label: null, pricing: [] },
    changed: ["admission_type"],
  })
  assert.equal(result.errors[0]?.code, "place_admission_validation")
})

test("structured tariff data satisfies paid-place validation without duplicating a label", () => {
  const pricing = [
    { label: "Erwachsene", amount: 6, currency: "EUR" },
    { label: "Kinder bis einschließlich 5 Jahre", category: "CHILD_FREE", currency: "EUR" },
  ]
  const result = placeValidation({
    current: { admission_type: "paid", admission_label: null, pricing },
    next: { admission_type: "paid", admission_label: null, pricing, name: "Titel" },
    changed: ["name"],
  })
  assert.equal(hasPublicPricing(null, pricing, "places"), true)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.warnings, [])
})

test("missing pricing never changes paid into free or zero", () => {
  const next = { admission_type: "paid", admission_label: null, pricing: [] }
  const result = placeValidation({
    current: next,
    next,
    changed: ["name"],
  })
  assert.equal(next.admission_type, "paid")
  assert.equal(next.admission_label, null)
  assert.equal(result.warnings[0]?.severity, "warning")
})

test("changed dependent pricing fields remain blocking", () => {
  const result = placeValidation({
    current: { admission_type: "paid", admission_label: null, pricing: [] },
    next: { admission_type: "paid", admission_label: "", pricing: [] },
    changed: ["admission_label"],
  })
  assert.equal(result.errors[0]?.code, "place_admission_validation")
  assert.deepEqual(result.warnings, [])
})

test("existing invalid recurrence is a warning until recurrence fields are edited", () => {
  const values = {
    start_date: "2026-08-14T10:00:00.000Z",
    end_date: "2026-08-14T11:00:00.000Z",
    expires_at: "2026-08-15T00:00:00.000Z",
    recurrence_frequency: "weekly",
    recurrence_interval_count: null,
    recurrence_weekdays: [],
    recurrence_start_time: "",
    recurrence_end_time: "",
    recurrence_starts_on: "",
    recurrence_ends_on: "",
    recurrence_display_text: "",
    recurrence_exception_dates: [],
    source_url: null,
  }
  const warning = validateCityContentCrossFields({
    contentType: "events",
    currentValues: values,
    nextValues: { ...values, title: "Neue Überschrift" },
    changedFields: new Set(["title"]),
    isNew: false,
  })
  assert.equal(warning.errors.length, 0)
  assert.equal(warning.warnings.some((issue) => issue.code === "recurrence_validation"), true)

  const blocking = validateCityContentCrossFields({
    contentType: "events",
    currentValues: values,
    nextValues: values,
    changedFields: new Set(["recurrence_frequency"]),
    isNew: false,
  })
  assert.equal(blocking.errors.some((issue) => issue.code === "recurrence_validation"), true)
})

test("server action and editor expose the shared warning architecture", async () => {
  const [action, page] = await Promise.all([
    readFile(contentAction, "utf8"),
    readFile(editorPage, "utf8"),
  ])
  assert.match(action, /validateCityContentCrossFields/)
  assert.match(action, /changedFields/)
  assert.match(action, /crossFieldValidation\.warnings/)
  assert.match(page, /ContentQualityPanel/)
  assert.match(page, /Speichern bleibt möglich/)
})
