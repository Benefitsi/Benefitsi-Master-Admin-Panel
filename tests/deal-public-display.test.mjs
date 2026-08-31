import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  readDealFormDraft,
  readDealPublicDisplayValues,
} from "../lib/deal-form.ts"
import {
  micrositeDealDescription,
  micrositeDealTitle,
} from "../lib/microsite-content.ts"

const adminUrl = new URL("../app/partner-admin.tsx", import.meta.url)
const actionsUrl = new URL("../app/partner-actions.ts", import.meta.url)
const micrositeContentUrl = new URL("../lib/microsite-content.ts", import.meta.url)
const micrositeDataUrl = new URL("../lib/public-microsite.ts", import.meta.url)
const micrositeViewUrl = new URL(
  "../components/microsite/restaurant-premium-microsite.tsx",
  import.meta.url,
)

test("deal drafts retain public title and nullable subtitle mode", () => {
  const formData = new FormData()
  formData.set("deal_concept", "two_for_one")
  formData.set("display_title", "2 für 1 Döner")
  formData.set("display_subtitle", "Automatische Unterzeile")
  formData.set("display_subtitle_auto", "on")

  assert.deepEqual(readDealFormDraft(formData), {
    dealConcept: "two_for_one",
    discountType: "",
    audience: "",
    rewardItem: "",
    customerDescription: "",
    staffInstructions: "",
    terms: "",
    displayTitle: "2 für 1 Döner",
    displaySubtitle: "Automatische Unterzeile",
    displaySubtitleAuto: true,
  })
})

test("deal drafts preserve an explicitly empty subtitle instead of falling back", () => {
  const formData = new FormData()
  formData.set("display_title", "Mein Deal")
  formData.set("display_subtitle", "")

  const draft = readDealFormDraft(formData)

  assert.equal(draft.displayTitle, "Mein Deal")
  assert.equal(draft.displaySubtitle, "")
  assert.equal(draft.displaySubtitleAuto, false)
})

test("payload display values preserve null automatic and empty custom subtitle states", () => {
  const automatic = new FormData()
  automatic.set("display_title", "2 für 1 Döner")
  automatic.set("display_subtitle", "ignored")
  automatic.set("display_subtitle_auto", "on")
  assert.deepEqual(readDealPublicDisplayValues(automatic), {
    displayTitle: "2 für 1 Döner",
    displaySubtitle: null,
  })

  const hidden = new FormData()
  hidden.set("display_title", "2 für 1 Döner")
  hidden.set("display_subtitle", "")
  assert.deepEqual(readDealPublicDisplayValues(hidden), {
    displayTitle: "2 für 1 Döner",
    displaySubtitle: "",
  })
})

test("admin deal contract exposes public display fields and no top-benefit control", async () => {
  const [adminCode, actionCode] = await Promise.all([
    readFile(adminUrl, "utf8"),
    readFile(actionsUrl, "utf8"),
  ])

  assert.match(adminCode, /display_title/)
  assert.match(adminCode, /display_subtitle/)
  assert.match(adminCode, /display_subtitle_auto/)
  assert.match(adminCode, /Öffentliche Darstellung|Public display/)
  assert.doesNotMatch(adminCode, /Top[- ]Vorteil.*(Schalter|Badge|Auswahl)/i)
  assert.match(actionCode, /display_title/)
  assert.match(actionCode, /readDealPublicDisplayValues/)
})

test("public microsite contract includes explicit deal display fields", async () => {
  const [contentCode, dataCode] = await Promise.all([
    readFile(micrositeContentUrl, "utf8"),
    readFile(micrositeDataUrl, "utf8"),
  ])

  assert.match(contentCode, /display_title/)
  assert.match(contentCode, /display_subtitle/)
  assert.match(dataCode, /display_title/)
  assert.match(dataCode, /display_subtitle/)
})

test("microsite title and subtitle follow explicit public display fallbacks", () => {
  const deal = {
    type: "two_for_one",
    discount_type: "2for1",
    discount_value: null,
    reward_item: "Döner",
    benefit_count: null,
    customer_description: "Ein Döner nach Wahl.",
    terms: "Nur vor Ort.",
    min_spend: null,
    display_title: "2 für 1 Döner",
    display_subtitle: "Nur heute",
  }

  assert.equal(micrositeDealTitle(deal, "de"), "2 für 1 Döner")
  assert.equal(micrositeDealDescription(deal, "de"), "Nur heute")
  assert.equal(
    micrositeDealDescription({ ...deal, display_subtitle: null }, "de"),
    "Ein Döner nach Wahl.",
  )
  assert.equal(micrositeDealDescription({ ...deal, display_subtitle: "" }, "de"), "")
})

test("legacy two-for-one titles include the reward item consistently", async () => {
  const [adminCode, micrositeCode] = await Promise.all([
    readFile(adminUrl, "utf8"),
    readFile(micrositeContentUrl, "utf8"),
  ])

  const legacyDeal = {
    type: "two_for_one",
    discount_type: "2for1",
    discount_value: null,
    reward_item: "Döner",
    benefit_count: null,
    customer_description: "",
    terms: "",
    min_spend: null,
  }

  assert.equal(micrositeDealTitle(legacyDeal, "de"), "2 für 1 Döner")
  assert.match(adminCode, /formatDealPublicTitle/)
  assert.match(micrositeCode, /2 für 1/)
})

test("microsite phone preview does not render a Top-Vorteil badge", async () => {
  const viewCode = await readFile(micrositeViewUrl, "utf8")

  assert.doesNotMatch(viewCode, /siteCopy\(config, ["']Top-Vorteil["']/)
})

test("public microsite deal loading has a legacy projection fallback", async () => {
  const dataCode = await readFile(micrositeDataUrl, "utf8")

  assert.match(dataCode, /PUBLIC_DEAL_COLUMNS_LEGACY/)
  assert.match(dataCode, /dealsResult\.error/)
  assert.match(dataCode, /display_title:\s*null/)
  assert.match(dataCode, /publicDealsError/)
})
