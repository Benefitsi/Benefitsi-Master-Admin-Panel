import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { JSDOM } from "jsdom"
import { formDataSignature } from "../lib/partner-form-signature.ts"

import {
  buildBenDescriptionPrompt,
  parseBenDescriptionResponse,
} from "../lib/partner-description.ts"
import { partnerUpdateWasApplied } from "../lib/partner-save.ts"

const actionsUrl = new URL("../app/partner-actions.ts", import.meta.url)
const adminUrl = new URL("../app/partner-admin.tsx", import.meta.url)
const configUrl = new URL("../lib/partner-config.ts", import.meta.url)

test("an unchanged partner form stays clean across empty file placeholder timestamps", async (t) => {
  const dom = new JSDOM('<form><input name="name" value="Cafe"><input type="file" name="logo_file"></form>')
  t.after(() => dom.window.close())
  const form = dom.window.document.querySelector("form")
  const first = new dom.window.FormData(form)
  await new Promise(resolve => setTimeout(resolve, 20))
  const second = new dom.window.FormData(form)
  assert.notEqual(first.get("logo_file").lastModified, second.get("logo_file").lastModified)
  assert.equal(formDataSignature(first), formDataSignature(second))
  form.elements.namedItem("name").value = "Edited Cafe"
  assert.notEqual(formDataSignature(first), formDataSignature(new dom.window.FormData(form)))
})

test("selected files, including named empty files, still change the partner signature", () => {
  const empty = new FormData()
  empty.set("logo_file", new File([], "", { type: "application/octet-stream", lastModified: 1 }))
  const selected = new FormData()
  selected.set("logo_file", new File([], "logo.png", { type: "image/png", lastModified: 1 }))
  assert.notEqual(formDataSignature(empty), formDataSignature(selected))
  const previous = formDataSignature(selected)
  selected.set("logo_file", new File([], "logo.png", { type: "image/png", lastModified: 2 }))
  assert.notEqual(formDataSignature(selected), previous)
})

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
  assert.doesNotMatch(prompt, /Hauptstraße 4/)
  assert.match(prompt, /1 bis 2 kurze, direkte Sätze/i)
  assert.match(prompt, /keine Adresse/i)
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

test("partner actions guard updates and route copy drafts through the dedicated M1 Content-Agent", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(code, /partnerUpdateWasApplied\(result\.data\)/)
  assert.match(code, /M1_BRIDGE_URL/)
  assert.match(code, /M1_BRIDGE_SECRET/)
  assert.match(code, /action:\s*["']content-draft["']/)
  assert.match(code, /profile:\s*["']benefitsi-content["']/)
  assert.match(code, /generatePartnerDescription/)
})

test("admin edits from the partner dashboard preserve the existing owner", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(
    code,
    /resolvePartnerOwner\(\s*formData,\s*isUpdate\s*\?\s*existingPartner\?\.owner_id\s*:\s*undefined,\s*\)/,
  )
})

test("partner editor keeps localized labels inside responsive controls and exposes the Content-Agent on Description", async () => {
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

test("category selector does not nest a disclosure inside a collapsible section", async () => {
  const code = await readFile(adminUrl, "utf8")
  const selector = code.slice(
    code.indexOf("function MultiSelectField"),
    code.indexOf("function WeekdayChipField"),
  )

  assert.match(selector, /<button[\s\S]*?aria-haspopup="dialog"/)
  assert.match(selector, /role="dialog"[\s\S]*?type="search"[\s\S]*?type="checkbox"/)
  assert.match(selector, /onPointerDown=\{\(?event\)? => event\.stopPropagation\(\)\}/)
  assert.doesNotMatch(selector, /<details[\s\S]*?<summary/)
})

test("selected categories remain part of form data while the dropdown is closed", async () => {
  const code = await readFile(adminUrl, "utf8")
  const selector = code.slice(
    code.indexOf("function MultiSelectField"),
    code.indexOf("function WeekdayChipField"),
  )

  assert.match(
    selector,
    /selectedValues\.map\(\(value\) => \([\s\S]*?type="hidden"[\s\S]*?name=\{name\}[\s\S]*?value=\{value\}/,
  )
  assert.doesNotMatch(selector, /type="checkbox"\s+name=\{name\}/)
})

test("editing the partner form dismisses stale save results", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /onInput=\{\(\) => \{[\s\S]*?if \(state\.message\) setDismissedActionState\(state\)/)
  assert.doesNotMatch(code, /if \(!state\.ok && state\.message\) setDismissedActionState\(state\)/)
})

test("active and featured partner metrics filter the list, with featured limited to active partners", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /const \[partnerFilter, setPartnerFilter\]/)
  assert.match(code, /label="Active partners"[\s\S]*active=\{partnerFilter === "active"\}[\s\S]*onClick=/)
  assert.match(code, /value=\{featuredPartners\}[\s\S]*active=\{partnerFilter === "featured"\}[\s\S]*onClick=/)
  assert.match(code, /partnerFilter === "active" && !isPartnerActive\(partner\)/)
  assert.match(code, /partnerFilter === "featured"[\s\S]*isPartnerActive\(partner\) && partner\.is_featured/)
  assert.match(code, /isPartnerActive\(partner\) && partner\.is_featured/)
  assert.match(code, /aria-pressed=\{active\}/)
})

test("partner list filters by status and keeps the detail pane within the filtered results", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /partnerStatusOptions/)
  assert.match(code, /aria-label="Status"/)
  assert.match(code, /statusFilter === "active"/)
  assert.match(code, /statusFilter === "inactive"/)
  assert.match(code, /filteredPartners\.find\(\(partner\) => partner\.id === selectedId\)/)
  assert.match(code, /Reset filters/)
  assert.match(code, /aria-live="polite"/)
})

test("2-for-1 deal drafts retain the entered item and basics", async () => {
  const { discountTypeUsesRewardItem, readDealFormDraft } = await import(
    "../lib/deal-form.ts"
  )
  const formData = new FormData()
  formData.set("deal_concept", "two_for_one")
  formData.set("type", "two_for_one")
  formData.set("discount_type", "2for1")
  formData.set("audience", "both")
  formData.set("reward_item", "Burger")

  assert.equal(discountTypeUsesRewardItem("2for1"), true)
  assert.deepEqual(readDealFormDraft(formData), {
    dealConcept: "two_for_one",
    discountType: "2for1",
    audience: "both",
    rewardItem: "Burger",
    customerDescription: "",
    staffInstructions: "",
    terms: "",
    displayTitle: "",
    displaySubtitle: "",
    displaySubtitleAuto: false,
  })
})

test("Ben deal-copy prompts are German, bounded, and field-scoped", async () => {
  const { BEN_DEAL_COPY_FIELDS, buildBenDealCopyPrompt } = await import(
    "../lib/deal-copy.ts"
  )

  assert.deepEqual(BEN_DEAL_COPY_FIELDS, [
    "customer_description",
    "staff_instructions",
    "terms",
  ])
  const prompt = buildBenDealCopyPrompt({
    field: "customer_description",
    partnerName: "Café Morgenrot",
    dealConcept: "two_for_one",
    discountType: "2for1",
    audience: "both",
    rewardItem: "Burger",
    currentText: "",
  })

  assert.match(prompt, /Ben/)
  assert.match(prompt, /deutsch/i)
  assert.match(prompt, /keine Fakten erfinden/i)
  assert.match(prompt, /customer_description/)
  assert.match(prompt, /Café Morgenrot/)
})

test("deal actions preserve rejected drafts and expose Content-Agent copy generation", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(code, /discountTypeUsesRewardItem\(/)
  assert.match(code, /dealDraft/)
  assert.match(code, /generateDealCopy/)
  assert.match(code, /requestContentDraft\(/)
  assert.match(code, /action:\s*["']content-draft["']/)
})

test("deal copy fields expose a Content-Agent suggestion action", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /dealDraft/)
  assert.match(code, /generateDealCopy/)
  assert.match(code, /ContentAgentSuggestionButton/)
  assert.equal((code.match(/ContentAgentSuggestionButton/g) ?? []).length >= 3, true)
})

test("default deal copy uses the canonical lifecycle terminology", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(code, /Willkommensbonus:/)
  assert.match(code, /Willkommensdeals oder Willkommensboni/)
  assert.match(code, /Comeback-Deal:/)
  assert.match(code, /Comeback-Berechtigung/)
  assert.match(code, /Zeitbonus/)
  assert.doesNotMatch(code, /Willkommen:|Comeback:/)
})

test("deal writes carry canonical taxonomy dimensions alongside legacy fields", async () => {
  const [actions, data] = await Promise.all([
    readFile(actionsUrl, "utf8"),
    readFile(new URL("../lib/admin-data.ts", import.meta.url), "utf8"),
  ])

  for (const field of [
    "reward_format",
    "trigger_key",
    "campaign_type",
    "activation_mode",
  ]) {
    assert.match(actions, new RegExp(`${field}\\s*:`))
    assert.match(data, new RegExp(`${field}: string \\| null`))
  }
})

test("partner socials support YouTube and five profiles", async () => {
  const [config, admin] = await Promise.all([
    readFile(configUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ])

  assert.match(config, /value:\s*[\"']youtube[\"']/)
  assert.match(config, /MAX_PARTNER_SOCIALS\s*=\s*5/)
  assert.match(
    admin,
    /Add up to \{MAX_PARTNER_SOCIALS\} social profiles/,
  )
})

test("partner settings keep profile fixed with contact, then expanded media and separate socials above hours", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.ok(
    /<FormSection title="Profile" collapsible=\{false\}[\s\S]*?name="phone"[\s\S]*?name="coordinates"[\s\S]*?name="address"[\s\S]*?<\/FormSection>\s*<FormSection\s+title="Media"\s+defaultOpen=\{true\}[\s\S]*?<\/FormSection>\s*<FormSection title="Socials"[\s\S]*?<SocialHandlesSection[\s\S]*?<\/FormSection>\s*\{mode === "edit"[\s\S]*?<OpeningHoursPanel\s+partner=\{partner\}\s+embedded\s+withinPartnerForm/.test(code),
    "Profile must stay visible with contact/location, followed by expanded media and separate socials above operating hours",
  )
  assert.ok(!code.includes('title="Contact, Location and Socials"'), "The combined contact/socials section must not return")
  assert.match(code, /<DealsPanel partner=\{partner\} embedded \/>/)
  assert.match(code, /<MilestonesPanel partner=\{partner\} embedded \/>/)
  assert.doesNotMatch(code, /\{ id: "rewards", label: "Operating Hours"/)
  assert.match(code, /title="Operating hours" required="subtle" defaultOpen=\{false\}/)
  assert.match(code, /slot_count_\$\{day\.value\}/)
  assert.match(code, /Add another time range/)
})

test("partner contact email stays separate from owner selection and review hides unsupported menus", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /label="Partner email"[\s\S]*?name="email"/)
  assert.match(code, /This is separate from the partner owner account/)
  assert.match(code, /snapshot\.menuSupported \? \(/)
})

test("partner deletion reauthenticates and partner PIN can be rotated", async () => {
  const [actions, admin] = await Promise.all([
    readFile(actionsUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ])

  assert.match(actions, /verifyAdminPassword\(adminSession, deletePassword\)/)
  assert.match(actions, /export async function rotatePartnerPin/)
  assert.match(admin, /name="delete_password"/)
  assert.match(admin, /Rotate partner PIN/)
})
