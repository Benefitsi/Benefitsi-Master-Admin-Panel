import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  buildBenDescriptionPrompt,
  parseBenDescriptionResponse,
} from "../lib/partner-description.ts"
import { partnerUpdateWasApplied } from "../lib/partner-save.ts"

const actionsUrl = new URL("../app/partner-actions.ts", import.meta.url)
const adminUrl = new URL("../app/partner-admin.tsx", import.meta.url)

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

test("deal actions preserve rejected drafts and expose Ben copy generation", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(code, /discountTypeUsesRewardItem\(/)
  assert.match(code, /dealDraft/)
  assert.match(code, /generateDealCopy/)
  assert.match(code, /buildBenDealCopyPrompt/)
  assert.match(code, /action:\s*["']partner-description["']/)
})

test("deal copy fields expose a Ben suggestion action", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /dealDraft/)
  assert.match(code, /generateDealCopy/)
  assert.match(code, /BenSuggestionButton/)
  assert.equal((code.match(/BenSuggestionButton/g) ?? []).length >= 3, true)
})
