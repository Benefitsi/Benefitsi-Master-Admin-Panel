import assert from "node:assert/strict"
import test from "node:test"

import { translateValue } from "../app/admin-language.tsx"
import * as workspaceTemplates from "../lib/workspace/templates.ts"

test("switches city, editorial, media, and workspace instructions with the admin language", () => {
  const examples = [
    ["Review images and their assignments", "Bilder und ihre Zuordnungen prüfen"],
    ["No editorial posts yet", "Noch keine redaktionellen Beiträge"],
    ["Select an image from the media library.", "Wähle ein Bild aus der Mediensammlung."],
    ["Edit content", "Inhalt bearbeiten"],
    ["City administration unavailable", "Stadtverwaltung nicht erreichbar"],
  ]
  for (const [english, german] of examples) {
    assert.equal(translateValue(german, "en"), english)
    assert.equal(translateValue(english, "de"), german)
  }
})

test("translates city image feedback while retaining category and count values", () => {
  assert.equal(translateValue("12 Bilder geladen", "en"), "12 images loaded")
  assert.equal(translateValue("12 images loaded", "de"), "12 Bilder geladen")
  assert.equal(translateValue("Bild für „Burgen“ gespeichert.", "en"), "Image for “Burgen” saved.")
  assert.equal(translateValue("Image for “Burgen” saved.", "de"), "Bild für „Burgen“ gespeichert.")
})

test("keeps authored editorial and workspace content intact when it has no UI translation", () => {
  for (const value of ["Patrick – Gespräch vom 09.10.", "Knobi: Unsere neue Speisekarte", "needs_review", "discovery:viewpoints"]) {
    assert.equal(translateValue(value, "en"), value)
    assert.equal(translateValue(value, "de"), value)
  }
})

test("only translates the original onboarding question copy, preserving custom edits", () => {
  const question = workspaceTemplates.onboardingContent().questions[0]
  assert.equal(workspaceTemplates.isFixedOnboardingCopy?.(question, "prompt"), true)
  assert.equal(workspaceTemplates.isFixedOnboardingCopy?.({ ...question, prompt: "Besondere Frage für Knobi" }, "prompt"), false)
  assert.equal(workspaceTemplates.isFixedOnboardingCopy?.({ ...question, id: "custom-123" }, "prompt"), false)
})

test("translates workspace counters, editor accessibility labels, and native confirmation copy", () => {
  assert.equal(translateValue("4 von 44 Fragen", "en"), "4 of 44 questions")
  assert.equal(translateValue("Block 2 nach oben", "en"), "Move block 2 up")
  assert.equal(translateValue("Version 7 als neue Fassung wiederherstellen?", "en"), "Restore version 7 as a new version?")
  assert.equal(translateValue("Move block 2 up", "de"), "Block 2 nach oben")
})
