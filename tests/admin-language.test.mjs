import assert from "node:assert/strict"
import test from "node:test"

import { translateValue } from "../app/admin-language.tsx"

test("uses natural German terms for reward types", () => {
  assert.equal(translateValue("Reward type", "de"), "Prämientyp")
  assert.equal(translateValue("Item", "de"), "Artikel")
  assert.equal(translateValue("Reward item", "de"), "Prämienartikel")
  assert.equal(translateValue("Fixed amount", "de"), "Fester Betrag")
  assert.equal(translateValue("Bonus stamp", "de"), "Bonusstempel")
})

test("uses menu-specific terminology consistently", () => {
  assert.equal(translateValue("Add menu item", "de"), "Menüartikel hinzufügen")
  assert.equal(translateValue("Menu item picture", "de"), "Bild des Menüartikels")
  assert.equal(translateValue("1 item", "de"), "1 Artikel")
  assert.equal(translateValue("12 items", "de"), "12 Artikel")
})

test("translates generated reward and schedule labels", () => {
  assert.equal(translateValue("5 stamps - Item", "de"), "5 Stempel – Artikel")
  assert.equal(translateValue("5 stamps - ", "de"), "5 Stempel – ")
  assert.equal(translateValue(" stamps -", "de"), " Stempel –")
  assert.equal(translateValue("2 milestones", "de"), "2 Prämienstufen")
  assert.equal(
    translateValue("Monday opening time", "de"),
    "Öffnungszeit am Montag",
  )
})

test("preserves whitespace and supports switching back to English", () => {
  assert.equal(translateValue("  Item  ", "de"), "  Artikel  ")
  assert.equal(translateValue("Prämienartikel", "en"), "Reward item")
})
