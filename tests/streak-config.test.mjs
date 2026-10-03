import assert from "node:assert/strict"
import test from "node:test"
import { buildStreakMetadata, streakFieldErrors, describeCalendarStreak, legacyStreakInterval } from "../lib/streak-config.ts"

const calendar = { streak_mode: "calendar_frequency", required_visits_per_period: 2, period_unit: "weeks", required_consecutive_periods: 4 }
test("calendar streak stores visits, calendar unit and series length as separate dimensions", () => {
  const form = new FormData()
  Object.entries(calendar).forEach(([key, value]) => form.set(key, String(value)))
  const metadata = buildStreakMetadata(form, "", { custom_partner_rule: "keep", streak_interval_value: 2, streak_interval_unit: "weeks" })
  assert.deepEqual(metadata, { custom_partner_rule: "keep", streak_interval_value: 2, streak_interval_unit: "weeks", ...calendar })
  assert.deepEqual(streakFieldErrors(metadata), {})
  assert.match(describeCalendarStreak(metadata), /2.*pro Kalenderwoche.*4.*aufeinanderfolgende Wochen/)
})
test("older forms and existing gap-based streaks are never silently reinterpreted", () => {
  const original = { streak_interval_value: 2, streak_interval_unit: "weeks" }
  assert.deepEqual(buildStreakMetadata(new FormData(), "", original), original)
  assert.deepEqual(streakFieldErrors(original), {})
  assert.equal(describeCalendarStreak(original), null)
  const form = new FormData()
  form.set("streak_mode", "legacy_gap")
  form.set("streak_interval_value", "1")
  form.set("streak_interval_unit", "months")
  assert.deepEqual(buildStreakMetadata(form, "", { ...calendar, other: "keep" }), { streak_interval_value: 1, streak_interval_unit: "months", other: "keep" })
})
test("calendar rule rejects missing, fractional and invalid values at the relevant fields", () => {
  for (const [field, value] of [["required_visits_per_period", 0], ["required_consecutive_periods", -1], ["required_visits_per_period", 1.5], ["period_unit", "years"], ["required_consecutive_periods", null]]) {
    assert.ok(streakFieldErrors({ ...calendar, [field]: value })[field], field)
  }
  for (const period_unit of ["days", "weeks", "months", "quarters"]) assert.deepEqual(streakFieldErrors({ ...calendar, period_unit }), {})
})
test("prefixed embedded forms retain their own streak rule and reject decimals instead of truncating", () => {
  const form = new FormData()
  Object.entries(calendar).forEach(([key, value]) => form.set(`deal_1_${key}`, String(value)))
  form.set("deal_1_required_visits_per_period", "2.5")
  const metadata = buildStreakMetadata(form, "deal_1_", {})
  assert.equal(metadata.required_visits_per_period, 2.5)
  assert.ok(streakFieldErrors(metadata).required_visits_per_period)
})
test("legacy defaults and cadence aliases preserve the backend maximum gap", () => {
  assert.deepEqual(legacyStreakInterval({}), { value: 1, unit: "days" })
  assert.deepEqual(legacyStreakInterval({}, 7), { value: 7, unit: "days" })
  assert.deepEqual(legacyStreakInterval({ cadence_value: 2, cadence_unit: "week" }), { value: 2, unit: "weeks" })
  assert.deepEqual(legacyStreakInterval({ streak_interval_value: 3, streak_interval_unit: "months", cadence_value: 2, cadence_unit: "weeks" }, 7), { value: 3, unit: "months" })
})
