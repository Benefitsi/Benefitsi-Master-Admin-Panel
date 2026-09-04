import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  buildBenDescriptionPrompt,
  parseBenDescriptionResponse,
} from "../lib/partner-description.ts"
import {
  MAX_PARTNER_SOCIALS,
  partnerSocialPlatformOptions,
} from "../lib/partner-config.ts"
import { partnerUpdateWasApplied } from "../lib/partner-save.ts"

const actionsUrl = new URL("../app/partner-actions.ts", import.meta.url)
const adminUrl = new URL("../app/partner-admin.tsx", import.meta.url)
const shellUrl = new URL("../app/admin-shell.tsx", import.meta.url)

test("an update is only considered applied when Supabase returns the partner row", () => {
  assert.equal(partnerUpdateWasApplied([{ id: "partner-1" }]), true)
  assert.equal(partnerUpdateWasApplied([]), false)
  assert.equal(partnerUpdateWasApplied(null), false)
})

test("Ben description prompts are scoped to public partner facts and German output", () => {
  const prompt = buildBenDescriptionPrompt({
    name: "Café Morgenrot",
    type: "Food & Drink",
    city: "Annweiler am Trifels",
    categories: ["Café", "Frühstück"],
    address: "Hauptstraße 4",
    currentDescription: "",
  })

  assert.match(prompt, /Ben/)
  assert.match(prompt, /deutsch/i)
  assert.match(prompt, /Café Morgenrot/)
  assert.match(prompt, /keine Fakten erfinden/i)
  assert.match(prompt, /JSON/i)
})

test("Ben responses accept fenced JSON and reject empty or oversized descriptions", () => {
  assert.equal(
    parseBenDescriptionResponse('```json\n{"description":"Frischer Kaffee und Frühstück in Annweiler."}\n```'),
    "Frischer Kaffee und Frühstück in Annweiler.",
  )
  assert.throws(() => parseBenDescriptionResponse('{"description":""}'), /keine Beschreibung/i)
  assert.throws(() => parseBenDescriptionResponse(JSON.stringify({ description: "x".repeat(2001) })), /2000/)
})

test("partner actions guard updates and route Ben through the existing M1 bridge", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(code, /partnerUpdateWasApplied\(result\.data\)/)
  assert.match(code, /M1_BRIDGE_URL/)
  assert.match(code, /M1_BRIDGE_SECRET/)
  assert.match(code, /action:\s*["']partner-description["']/)
  assert.match(code, /profile:\s*["']ben["']/)
  assert.match(code, /generatePartnerDescription/)
})

test("partner editor keeps localized labels inside responsive controls and exposes Ben on Description", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /overflow-x-auto[\s\S]*min-w-max/)
  assert.match(code, /whitespace-normal[\s\S]*break-words/)
  assert.match(code, /router\.refresh\(\)/)
  assert.match(code, /labelAccessory=/)
  assert.match(code, /GenerateDescriptionButton/)
  assert.match(code, /Do not forward the whole partner form/)
  assert.match(code, /querySelectorAll<HTMLInputElement>\([\s\S]*category.*:checked/)
  assert.match(code, /shrink-0[\s\S]{0,120}whitespace-nowrap/)
  assert.match(code, /\[&>\*\]:min-w-0/)
})

test("menu approvals are opened from Partner management instead of the primary navigation", async () => {
  const [shell, partner] = await Promise.all([
    readFile(shellUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ])

  assert.doesNotMatch(shell, /href="\/menu-approvals"/)
  assert.doesNotMatch(shell, /label="Menu approvals"/)
  assert.match(
    partner,
    /<LiveMetric\s+secondary\s+href="\/menu-approvals"\s+label="Menüfreigaben erforderlich"\s+value=\{pendingMenuReviews\.length\}\s*\/>/,
  )
})

test("partner social settings include YouTube and allow more than four profiles", () => {
  assert.ok(
    partnerSocialPlatformOptions.some((option) => option.value === "youtube"),
  )
  assert.ok(MAX_PARTNER_SOCIALS > 4)
})

test("partner details place opening hours between profile and contact sections", async () => {
  const code = await readFile(adminUrl, "utf8")
  const profileIndex = code.indexOf('<FormSection title="Profil"')
  const hoursMatch = code.match(
    /<OpeningHoursPanel\s+partner=\{partner\}\s+embedded\s+withinPartnerForm/,
  )
  const hoursIndex = hoursMatch?.index ?? -1
  const contactIndex = code.indexOf('title="Kontakt, Standort & Socials"')

  assert.ok(profileIndex >= 0)
  assert.ok(hoursIndex > profileIndex)
  assert.ok(contactIndex > hoursIndex)
  assert.doesNotMatch(code, /\{ id: "rewards", label: "Hours & Rewards"/)
  assert.match(code, /\{ id: "offers", label: "Stempel & Deals"/)
  assert.match(code, /settingsTab === "deals"[\s\S]*MilestonesPanel[\s\S]*DealsPanel/)
})

test("partner deletion requires server-side password verification", async () => {
  const [actions, admin] = await Promise.all([
    readFile(actionsUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ])

  assert.match(actions, /verifyAdminPassword/)
  assert.match(actions, /delete_password/)
  assert.match(admin, /name="delete_password"/)
})

test("partner PIN can be rotated without changing the normal profile save path", async () => {
  const [actions, admin] = await Promise.all([
    readFile(actionsUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ])

  assert.match(actions, /export async function rotatePartnerPin/)
  assert.match(actions, /randomInt\(/)
  assert.match(admin, /rotatePartnerPin/)
  assert.match(admin, /Partner-PIN rotieren/)
  assert.match(actions, /\.update\(\{ pin \}/)
})

test("partner menu writes invalidate the existing public partner cache", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(code, /scheduleMenuPublicRevalidation/)
  assert.match(code, /partnerIdForMenu/)
  assert.match(code, /saveMenuCategory/)
  assert.match(code, /saveMenuItem/)
  assert.match(code, /importMenuIntoMenu/)
})

test("partner management uses concise German overview copy and keeps approvals inline", async () => {
  const [code, shell] = await Promise.all([
    readFile(adminUrl, "utf8"),
    readFile(shellUrl, "utf8"),
  ])

  assert.match(code, /Aktive Partner/)
  assert.match(code, /Menüfreigaben erforderlich/)
  assert.match(shell, /Partnerverwaltung/)
  assert.doesNotMatch(code, /Supabase routing fields/)
  assert.doesNotMatch(code, /Deal recommended/)
})

test("partner editing exposes a single German save flow with unsaved protection", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /Ungespeicherte Änderungen/)
  assert.match(code, /beforeunload/)
  assert.match(code, /Änderungen speichern/)
})

test("staff and activity panels describe loaded data without inventing records", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /Mitarbeiterzugriff/)
  assert.match(code, /Keine Mitarbeiterzugriffe vorhanden/)
  assert.match(code, /Kundenaktivität/)
  assert.match(code, /Keine Besuche für diesen Partner geladen/)
  assert.match(code, /Erneut versuchen/)
})

test("danger zone explains permanent deletion and retains password confirmation", async () => {
  const [actions, admin] = await Promise.all([
    readFile(actionsUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ])

  assert.match(admin, /Gefahrenbereich/)
  assert.match(admin, /Deaktiviere/)
  assert.match(admin, /Partnernamen bestätigen/)
  assert.match(admin, /delete_password/)
  assert.match(admin, /delete_name_confirmation/)
  assert.match(actions, /verifyAdminPassword/)
  assert.match(actions, /deleteNameConfirmation/)
})

test("partner flow uses German-first copy and keeps unknown staff status neutral", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /Microsite-Builder/)
  assert.doesNotMatch(code, /Microsite builder/)
  assert.match(code, /Prüfen und anlegen/)
  assert.match(code, /function staffStatusLabel/)
  assert.match(code, /active === null/)
  assert.match(code, /Unbekannt/)
  assert.match(code, /markDirty/)
  assert.match(code, /setDescriptionDraft\(result\.description\)/)
})

test("partner activity distinguishes query failures from empty data", async () => {
  const [admin, data, page] = await Promise.all([
    readFile(adminUrl, "utf8"),
    readFile(new URL("../lib/admin-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ])

  assert.match(data, /activityErrors/)
  assert.match(page, /activityErrors=\{dashboard\.activityErrors\}/)
  assert.match(admin, /ActivityDataError/)
  assert.match(admin, /Stempel-Fortschritte konnten nicht geladen werden/)
  assert.match(admin, /Besuche konnten nicht geladen werden/)
})

test("partner action failures use German user-facing messages", async () => {
  const actions = await readFile(actionsUrl, "utf8")

  assert.match(actions, /Partner-ID ist erforderlich\./)
  assert.match(actions, /Admin-Passwort ist zum Löschen eines Partners erforderlich\./)
  assert.doesNotMatch(actions, /Partner id is required\./)
  assert.doesNotMatch(actions, /Admin password is required to delete a partner\./)
})
