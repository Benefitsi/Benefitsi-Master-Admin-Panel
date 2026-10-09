import assert from "node:assert/strict"
import test from "node:test"
import { translateValue } from "../app/admin-language.tsx"

test("authentication errors, secure recovery and loading states use the selected language", () => {
  for (const [en, de] of [
    ["Sign-in is temporarily unavailable. Please try again.", "Die Anmeldung ist vorübergehend nicht verfügbar. Bitte versuche es erneut."],
    ["That link can’t be used", "Dieser Link kann nicht verwendet werden"],
    ["Loading admin workspace", "Admin-Arbeitsbereich wird geladen"],
    ["Use at least 8 characters for your new password.", "Verwende mindestens 8 Zeichen für dein neues Passwort."],
  ]) {
    assert.equal(translateValue(en, "de"), de)
    assert.equal(translateValue(de, "en"), en)
  }
})

test("canonical benefit names retain their meaning and never expose internal replacement markers", () => {
  assert.equal(translateValue("Deal Drop", "en"), "Deal Drop")
  assert.equal(translateValue("Deal Drops", "en"), "Deal Drops")
  assert.equal(translateValue("Vorteile", "en"), "Benefits")
  assert.equal(translateValue("welcome deal", "en"), "welcome deal")
  assert.equal(translateValue("comeback deal", "en"), "comeback deal")
})

test("reviewed target-language copy is stable when rendered and translated again", () => {
  for (const [value, language] of [
    ["Interested in Deal Drops", "en"],
    ["Welcome deal and welcome bonus", "en"],
    ["Comeback-Vorteile benötigen einen Inaktivitätszeitraum größer als 0.", "de"],
    ["Position muss eine ganze Zahl innerhalb der Suchtiefe, >Suchtiefe oder ? sein.", "de"],
    ["Move Deal Drop up", "en"],
  ]) {
    assert.equal(translateValue(value, language), value)
  }
})

test("reviewed field labels translate when followed by a colon", () => {
  assert.equal(translateValue("Kampagnenstadt:", "en"), "Campaign city:")
  assert.equal(translateValue("Campaign city:", "de"), "Kampagnenstadt:")
})
