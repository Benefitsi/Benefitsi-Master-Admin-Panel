import assert from "node:assert/strict"
import test from "node:test"

import {
  isTranslationVariant,
  translateValue,
} from "../app/admin-language.tsx"

test("uses natural German terms for reward types", () => {
  assert.equal(translateValue("Reward type", "de"), "Prämientyp")
  assert.equal(translateValue("Item", "de"), "Artikel")
  assert.equal(translateValue("Reward item", "de"), "Prämienartikel")
  assert.equal(translateValue("Fixed amount", "de"), "Fester Betrag")
  assert.equal(translateValue("Bonus stamp", "de"), "Bonusstempel")
  assert.equal(
    translateValue("Permanent fallback discount", "de"),
    "Automatischer Basisrabatt",
  )
})

test("keeps partner dashboard singular and plural labels unambiguous", () => {
  assert.equal(translateValue("Partners", "de"), "Partner")
  assert.equal(translateValue("Partner location", "de"), "Partnerbetrieb")
  assert.equal(translateValue("Partnerbetrieb", "en"), "Partner location")
})

test("uses precise reward terminology in the reward type selector", async () => {
  const { dealTypeOptions, rewardTypeOptions } = await import("../lib/reward-config.ts")
  const itemOption = rewardTypeOptions.find((option) => option.value === "item")
  const timeBasedBonus = dealTypeOptions.find(
    (option) => option.value === "comeback",
  )
  const limitedDealDrop = dealTypeOptions.find(
    (option) => option.value === "limited_drop",
  )

  assert.equal(itemOption?.label, "Reward item")
  assert.equal(translateValue(itemOption?.label ?? "", "de"), "Prämienartikel")
  assert.equal(timeBasedBonus?.label, "Time-based bonus")
  assert.equal(translateValue(timeBasedBonus?.label ?? "", "de"), "Zeitbonus")
  assert.equal(limitedDealDrop?.label, "Limited deal drop")
  assert.equal(
    translateValue(limitedDealDrop?.label ?? "", "de"),
    "Limitierter Deal Drop",
  )
})

test("keeps the original language stable across repeated language switches", () => {
  assert.equal(isTranslationVariant("5 Stempel –", "5 stamps -"), true)
  assert.equal(
    isTranslationVariant("Prämienartikel", "Reward item"),
    true,
  )
  assert.equal(
    isTranslationVariant("Monday opening time", "Öffnungszeit am Montag"),
    true,
  )
  assert.equal(isTranslationVariant("Unrelated content", "Reward item"), false)
})

test("uses menu-specific terminology consistently", () => {
  assert.equal(translateValue("Add menu item", "de"), "Menüartikel hinzufügen")
  assert.equal(translateValue("Menu item picture", "de"), "Bild des Menüartikels")
  assert.equal(translateValue("1 item", "de"), "1 Artikel")
  assert.equal(translateValue("12 items", "de"), "12 Artikel")
  assert.equal(translateValue("items", "de"), "Artikel")
  assert.equal(translateValue("12 Artikel", "en"), "12 items")
  assert.equal(
    translateValue("Duplicate Pizza and its items", "de"),
    "Pizza einschließlich Artikel duplizieren",
  )
  assert.equal(
    translateValue("Pizza einschließlich Artikel duplizieren", "en"),
    "Duplicate Pizza and its items",
  )
  assert.equal(translateValue("Pizza picture", "de"), "Bild von Pizza")
  assert.equal(translateValue("Bild von Pizza", "en"), "Pizza picture")
  assert.equal(translateValue("Delete Pizza", "de"), "Pizza löschen")
  assert.equal(translateValue("Pizza löschen", "en"), "Delete Pizza")
  assert.equal(translateValue("2.00 EUR", "de"), "2,00 €")
  assert.equal(translateValue("2,00 €", "en"), "2.00 EUR")
  assert.equal(translateValue("4.5", "de"), "4,5")
  assert.equal(translateValue("4,5", "en"), "4.5")
})

test("localizes remaining partner editor fallback and validation copy", () => {
  assert.equal(translateValue("Benefit not set", "de"), "Vorteil nicht festgelegt")
  assert.equal(translateValue("Reward not set", "de"), "Prämie nicht festgelegt")
  assert.equal(translateValue("Staff user", "de"), "Mitarbeiterkonto")
  assert.equal(translateValue("Unnamed owner", "de"), "Verantwortliche Person ohne Namen")
  assert.equal(
    translateValue("Choose a valid holiday date.", "de"),
    "Wähle ein gültiges Feiertagsdatum aus.",
  )
  assert.equal(
    translateValue("That holiday is already listed.", "de"),
    "Dieser Feiertag ist bereits eingetragen.",
  )
})

test("translates generated reward and schedule labels", () => {
  assert.equal(translateValue("5 stamps - Item", "de"), "5 Stempel – Artikel")
  assert.equal(translateValue("5 Stempel – Artikel", "en"), "5 stamps - Item")
  assert.equal(translateValue("5 stamps - ", "de"), "5 Stempel – ")
  assert.equal(translateValue("5 Stempel – ", "en"), "5 stamps - ")
  assert.equal(translateValue(" stamps -", "de"), " Stempel –")
  assert.equal(translateValue("1 Stempel", "en"), "1 stamp")
  assert.equal(translateValue("5 Stempel", "en"), "5 stamps")
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
  assert.equal(
    translateValue("Öffnungszeit am Montag", "en"),
    "Monday opening time",
  )
  assert.equal(
    translateValue("Schließzeit am Sonntag", "en"),
    "Sunday closing time",
  )
  assert.equal(translateValue("24. Dez. 2026", "en"), "24 Dec 2026")
  assert.equal(translateValue("15% off", "de"), "15 % Rabatt")
  assert.equal(translateValue("15 % Rabatt", "en"), "15% off")
  assert.equal(
    translateValue("20% off - 14:00-17:00 - Mon-Fri", "de"),
    "20 % Rabatt – 14:00-17:00 – Mo–Fr",
  )
  assert.equal(
    translateValue("20 % Rabatt – 14:00-17:00 – Mo–Fr", "en"),
    "20% off - 14:00-17:00 - Mon-Fri",
  )
  assert.equal(translateValue("€5 off", "de"), "5 € Rabatt")
  assert.equal(translateValue("5 € Rabatt", "en"), "€5 off")
  assert.equal(translateValue("+1 bonus stamp", "de"), "+1 Bonusstempel")
  assert.equal(translateValue("+3 bonus stamps", "de"), "+3 Bonusstempel")
  assert.equal(translateValue("+3 Bonusstempel", "en"), "+3 bonus stamps")
  assert.equal(
    translateValue("Must be between 1 and 10.", "de"),
    "Der Wert muss zwischen 1 und 10 liegen.",
  )
  assert.equal(
    translateValue("Der Wert muss zwischen 1 und 10 liegen.", "en"),
    "Must be between 1 and 10.",
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
  assert.equal(translateValue("Partner management", "de"), "Partnerverwaltung")
  assert.equal(translateValue("Partnerverwaltung", "en"), "Partner management")
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
    translateValue("System overview", "de"),
    "Systemübersicht",
  )
  assert.equal(
    translateValue("Benefitsi website", "de"),
    "Benefitsi-Webseite",
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

test("translates import, image editing, login, and empty-state copy", () => {
  assert.equal(translateValue("Import behavior", "de"), "Importoptionen")
  assert.equal(translateValue("Append", "de"), "Anhängen")
  assert.equal(translateValue("Update add-ons", "de"), "Extras aktualisieren")
  assert.equal(
    translateValue("Horizontal crop", "de"),
    "Horizontaler Bildausschnitt",
  )
  assert.equal(
    translateValue("The current account is not an admin.", "de"),
    "Das aktuelle Konto besitzt keine Administratorrechte.",
  )
  assert.equal(
    translateValue("No stamp-card milestones configured yet.", "de"),
    "Noch keine Stempelkarten-Prämien eingerichtet.",
  )
  assert.equal(translateValue("User", "de"), "Nutzer")
  assert.equal(translateValue("User ID", "de"), "Nutzer-ID")
  assert.equal(translateValue("Basics", "de"), "Grundlagen")
  assert.equal(translateValue("Doner", "de"), "Döner")
  assert.equal(translateValue("Doner kebab, Pizza", "de"), "Döner, Pizza")
  assert.equal(
    translateValue("Döner, Pizza", "en"),
    "Doner kebab, Pizza",
  )
  assert.equal(translateValue("Indian", "de"), "Indisch")
  assert.equal(translateValue("Indisch", "en"), "Indian")
  assert.equal(translateValue("Deal Drop inventory", "de"), "Deal-Drop-Kontingent")
  assert.equal(translateValue("Challenge name", "de"), "Name der Challenge")
  assert.equal(translateValue("Comeback Deal", "de"), "Comeback-Deal")
  assert.equal(translateValue("Selectable deal", "de"), "Auswählbarer Deal")
  assert.equal(
    translateValue("Selected direct deal source", "de"),
    "Ausgewählter direkter Deal",
  )
  assert.equal(translateValue("3 visits this week", "de"), "3 Besuche diese Woche")
  assert.equal(translateValue("7/7 days open", "de"), "7 von 7 Tagen geöffnet")
  assert.equal(translateValue("2 images", "de"), "2 Bilder")
  assert.equal(translateValue("1 set", "de"), "1 eingerichtet")
  assert.equal(
    translateValue(
      "18 of 27 required fields are complete. Review the marked tabs before creating.",
      "de",
    ),
    "18 von 27 Pflichtfeldern sind vollständig. Prüfe vor dem Erstellen die markierten Bereiche.",
  )
  assert.equal(
    translateValue(
      "Please complete the required fields in Business Profile before creating the partner.",
      "de",
    ),
    "Bitte fülle vor dem Erstellen des Partners alle Pflichtfelder unter „Unternehmensprofil“ aus.",
  )
  assert.equal(
    translateValue("Optional extras customers can add to this item.", "de"),
    "Optionale Extras, die Kunden zu diesem Artikel hinzufügen können.",
  )
  assert.equal(
    translateValue("Enter the free item name.", "de"),
    "Gib den Namen des Gratisartikels ein.",
  )
  assert.equal(
    translateValue("Limited Deal Drops must have an end time.", "de"),
    "Limitierte Deal Drops benötigen einen Endzeitpunkt.",
  )
})
