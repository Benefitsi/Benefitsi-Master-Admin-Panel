"use client"

import { useState } from "react"
import { calendarPeriodOptions, describeCalendarStreak, legacyStreakInterval } from "../lib/streak-config"

export function StreakRuleFields({ metadata, prefix, legacy, expiryDays, triggerValue, onTriggerChange, required, errors = {} }: {
  metadata: Record<string, unknown>
  prefix: string
  legacy: boolean
  expiryDays?: number | null
  triggerValue: string
  onTriggerChange: (value: string) => void
  required: boolean
  errors?: Record<string, string>
}) {
  const [mode, setMode] = useState(legacy ? "legacy_gap" : "calendar_frequency")
  const [visits, setVisits] = useState(String(metadata.required_visits_per_period ?? 1))
  const [unit, setUnit] = useState(String(metadata.period_unit ?? "weeks"))
  const [periods, setPeriods] = useState(String(metadata.required_consecutive_periods ?? 3))
  const interval = legacyStreakInterval(metadata, expiryDays)
  const [gap, setGap] = useState(String(interval.value))
  const [gapUnit, setGapUnit] = useState(interval.unit)
  const inputClasses = "h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
  const numeric = (label: string, name: string, value: string, set: (value: string) => void) => (
    <label className="block min-w-0 space-y-1.5 text-sm">
      <span className="font-medium text-zinc-700">{label}{required ? " *" : ""}</span>
      <input type="number" name={`${prefix}${name}`} min={1} step="1" required={required} value={value} onChange={event => set(event.target.value)} aria-invalid={Boolean(errors[name]) || undefined} className={inputClasses} />
      {errors[name] ? <span className="block text-xs font-medium text-rose-700">{errors[name]}</span> : null}
    </label>
  )
  const description = describeCalendarStreak({ streak_mode: mode, required_visits_per_period: Number(visits), period_unit: unit, required_consecutive_periods: Number(periods) })
  return (
    <fieldset className="space-y-3 md:col-span-2 2xl:col-span-3">
      <legend className="mb-2 text-sm font-semibold text-zinc-800">Besuchsserie</legend>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-zinc-700">Serienregel</span>
        <select name={`${prefix}streak_mode`} value={mode} onChange={event => setMode(event.target.value)} className={inputClasses}>
          <option value="calendar_frequency">Serie erfüllter Kalenderzeiträume</option>
          <option value="legacy_gap">Bisheriger Besuchsrhythmus</option>
        </select>
      </label>
      {mode === "calendar_frequency" ? <>
        <input type="hidden" name={`${prefix}trigger_value`} value={periods} />
        <div className="grid gap-3 sm:grid-cols-3">
          {numeric("Mindestkäufe je Zeitraum", "required_visits_per_period", visits, setVisits)}
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700">Kalenderzeitraum{required ? " *" : ""}</span>
            <select name={`${prefix}period_unit`} value={unit} onChange={event => setUnit(event.target.value)} required={required} aria-invalid={Boolean(errors.period_unit) || undefined} className={inputClasses}>
              {calendarPeriodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {errors.period_unit ? <span className="block text-xs text-rose-700">{errors.period_unit}</span> : null}
          </label>
          {numeric("Aufeinanderfolgende Zeiträume", "required_consecutive_periods", periods, setPeriods)}
        </div>
        {description ? <p className="text-sm text-zinc-700">{description}. Belohnung einmal nach Abschluss der gesamten Serie.</p> : null}
        <p className="text-xs leading-5 text-zinc-500">Ein qualifizierter Kauf zählt je QR-Scan, unabhängig von der Artikelzahl. Wochen beginnen am Montag; es gilt die eingestellte Zeitzone. Ein unvollständiger Zeitraum unterbricht die Serie. Ein neuer Serienlauf kann im nächsten Kalenderzeitraum beginnen.</p>
      </> : <>
        <div className="grid gap-3 sm:grid-cols-3">
          {numeric("Besuchstage bis zur Belohnung", "trigger_value", triggerValue, onTriggerChange)}
          {numeric("Höchster Abstand zwischen Besuchen", "streak_interval_value", gap, setGap)}
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700">Einheit des Besuchsabstands</span>
            <select name={`${prefix}streak_interval_unit`} value={gapUnit} onChange={event => setGapUnit(event.target.value)} className={inputClasses}>
              {calendarPeriodOptions.filter(option => option.value !== "quarters").map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs leading-5 text-zinc-500">Bestehende Regel: Pro lokalem Besuchstag zählt höchstens ein Fortschritt. Der Abstand ist die längste erlaubte Pause zwischen Besuchen.</p>
      </>}
    </fieldset>
  )
}
