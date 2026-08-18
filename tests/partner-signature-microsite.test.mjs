import assert from "node:assert/strict"
import test from "node:test"

import {
  localizedPartnerCategory,
  signaturePrimaryActionHref,
  signatureStampTarget,
  themeForTemplate,
} from "../components/microsite/partner-signature-microsite.tsx"

const signatureTemplates = [
  "salon-editorial",
  "atelier-noir",
  "wellness-serene",
  "cinema-spotlight",
  "festival-neon",
]

test("every signature template has distinct light and dark surfaces", () => {
  for (const template of signatureTemplates) {
    const light = themeForTemplate(template, "light")
    const dark = themeForTemplate(template, "dark")

    assert.notEqual(light.shell, dark.shell, `${template} shell`)
    assert.notEqual(light.header, dark.header, `${template} header`)
    assert.match(light.shell, /text-\[#/)
    assert.match(dark.shell, /text-(?:white|\[#)/)
  }
})

test("signature primary calls to action target the promised section", () => {
  const partnerUrl = "https://partner.example/"

  assert.equal(
    signaturePrimaryActionHref("Vorteile ansehen", partnerUrl),
    "#deals",
  )
  assert.equal(
    signaturePrimaryActionHref("Speisekarte öffnen", partnerUrl),
    "#speisekarte",
  )
  assert.equal(
    signaturePrimaryActionHref("Termin buchen", partnerUrl),
    partnerUrl,
  )
})

test("common English partner categories are localized for German microsites", () => {
  assert.equal(localizedPartnerCategory("Doner"), "Döner")
  assert.equal(localizedPartnerCategory("Food & Drink"), "Gastronomie")
  assert.equal(localizedPartnerCategory("Wellness"), "Wellness")
})

test("signature stamp cards use the actual active partner milestones", () => {
  assert.equal(
    signatureStampTarget({
      stamp_target: 5,
      reward_milestones: [
        { active: true, required_stamps: 10 },
        { active: true, required_stamps: 5 },
        { active: false, required_stamps: 20 },
      ],
    }),
    10,
  )
  assert.equal(
    signatureStampTarget({
      stamp_target: null,
      reward_milestones: [],
    }),
    0,
  )
})
