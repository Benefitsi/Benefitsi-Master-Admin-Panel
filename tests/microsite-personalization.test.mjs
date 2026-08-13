import assert from "node:assert/strict"
import test from "node:test"

import {
  defaultMicrositeCopyForPartner,
  inferMicrositePartnerProfile,
} from "../lib/microsite-personalization.ts"

test("does not mistake the German word entspannen for a spa signal", () => {
  const partner = {
    name: "Knobi Döner und Pizza Haus",
    type: "Gastronomie",
    category: ["Döner", "Pizza"],
    description:
      "Genießen Sie unsere Gerichte und vor allem: Entspannen Sie sich!",
  }

  assert.equal(inferMicrositePartnerProfile(partner), "restaurant")
  assert.deepEqual(
    defaultMicrositeCopyForPartner(partner).services.map((service) => service.label),
    [
      "Abholung",
      "Frische Auswahl",
      "Kartenzahlung & Mobile Pay",
      "Familienfreundlich",
    ],
  )
})

test("still recognizes explicit wellness and spa partner signals", () => {
  assert.equal(
    inferMicrositePartnerProfile({
      name: "Auszeit Spa Annweiler",
      type: "Wellness",
      category: ["Massage"],
      description: "Ruhige Behandlungen und Yoga.",
    }),
    "wellness",
  )
})
