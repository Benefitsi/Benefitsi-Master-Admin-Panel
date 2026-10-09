import assert from "node:assert/strict"
import test from "node:test"
import { compileTranslationTemplates, translateTemplate } from "../lib/admin-i18n/templates.ts"
import { translateValue } from "../app/admin-language.tsx"

test("dynamic messages preserve opaque parameters including whitespace and replacement characters", () => {
  const templates = compileTranslationTemplates([["Image for {0}", "Bild für {0}"], ["Remove {0} from {1}?", "{0} aus {1} entfernen?"]])
  assert.equal(translateTemplate("Bild für A  B $&", "en", templates), "Image for A  B $&")
  assert.equal(translateTemplate("Knobi aus Annweiler entfernen?", "en", templates), "Remove Knobi from Annweiler?")
  assert.equal(translateTemplate("A Bild für Test", "en", templates), undefined)
  assert.equal(translateValue("Bildbeschreibung: A  B $&", "en"), "Image description: A  B $&")
})

test("repeated template parameters must agree and specific sentences outrank generic ones", () => {
  const templates = compileTranslationTemplates([
    ["{0} partners", "{0} Partner"],
    ["Search partners", "Partner suchen"],
    ["Compare {0} to {0}", "{0} mit {0} vergleichen"],
  ])
  assert.equal(translateTemplate("A mit B vergleichen", "en", templates), undefined)
  assert.equal(translateTemplate("A mit A vergleichen", "en", templates), "Compare A to A")
  assert.equal(translateValue("Search partners", "de"), "Partner suchen")
})
