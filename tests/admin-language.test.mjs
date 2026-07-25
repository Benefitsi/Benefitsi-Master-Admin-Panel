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
  assert.equal(translateValue("items", "de"), "Artikel")
  assert.equal(translateValue("12 Artikel", "en"), "12 items")
})

test("translates generated reward and schedule labels", () => {
  assert.equal(translateValue("5 stamps - Item", "de"), "5 Stempel – Artikel")
  assert.equal(translateValue("5 stamps - ", "de"), "5 Stempel – ")
  assert.equal(translateValue(" stamps -", "de"), " Stempel –")
  assert.equal(translateValue("2 milestones", "de"), "2 Prämienstufen")
  assert.equal(translateValue("2 Prämienstufen", "en"), "2 milestones")
  assert.equal(
    translateValue("Annweiler am Trifels - Food & Drink", "de"),
    "Annweiler am Trifels – Gastronomie",
  )
  assert.equal(
    translateValue("Annweiler am Trifels – Gastronomie", "en"),
    "Annweiler am Trifels - Food & Drink",
  )
  assert.equal(
    translateValue("Monday opening time", "de"),
    "Öffnungszeit am Montag",
  )
})

test("preserves whitespace and supports switching back to English", () => {
  assert.equal(translateValue("  Item  ", "de"), "  Artikel  ")
  assert.equal(translateValue("Prämienartikel", "en"), "Reward item")
  assert.equal(translateValue("24 / 120 characters", "de"), "24 / 120 Zeichen")
  assert.equal(translateValue("24 / 120 Zeichen", "en"), "24 / 120 characters")
  assert.equal(translateValue("24 Dec 2026", "de"), "24. Dez. 2026")
  assert.equal(
    translateValue("Jul 22, 2026, 8:13 PM", "de"),
    "22. Juli 2026, 20:13",
  )
  assert.equal(translateValue("Handle 2", "de"), "Profil 2")
  assert.equal(
    translateValue("3 of 5 cover photos saved; 2 slots available.", "de"),
    "3 von 5 Titelbildern gespeichert; 2 Plätze verfügbar.",
  )
  assert.equal(
    translateValue("Showing 2 of 2 visits.", "de"),
    "2 von 2 Besuchen werden angezeigt.",
  )
  assert.equal(
    translateValue("Visit 3ca94a2a-030", "de"),
    "Besuch 3ca94a2a-030",
  )
  assert.equal(
    translateValue(
      "26.06.26–25.07.26 · Vergleich 27.05.26–25.06.26 · Zeitzone Europe/Berlin · Währung EUR",
      "en",
    ),
    "26.06.26–25.07.26 · Comparison 27.05.26–25.06.26 · Time zone Europe/Berlin · Currency EUR",
  )
})

test("translates complete admin workflows in both directions", () => {
  assert.equal(translateValue("Select...", "de"), "Bitte auswählen ...")
  assert.equal(translateValue("Add deal", "de"), "Deal hinzufügen")
  assert.equal(
    translateValue("Review submitted partner menus before publishing", "de"),
    "Eingereichte Partnermenüs vor der Veröffentlichung prüfen",
  )
  assert.equal(
    translateValue("Benefitsi-Systeme öffnen", "en"),
    "Open Benefitsi systems",
  )
  assert.equal(
    translateValue("Unternehmenszustand", "en"),
    "Business Health",
  )
  assert.equal(
    translateValue("Contribution Margin II", "de"),
    "Deckungsbeitrag II",
  )
  assert.equal(
    translateValue(
      "Count of server-confirmed, non-reversed redemptions.",
      "de",
    ),
    "Anzahl serverseitig bestätigter, nicht rückgängig gemachter Einlösungen.",
  )
  assert.equal(
    translateValue(
      "Automatically generated from the permanent partner record and kept read-only.",
      "de",
    ),
    "Wird automatisch aus dem dauerhaften Partnerdatensatz erzeugt und kann nicht bearbeitet werden.",
  )
})
