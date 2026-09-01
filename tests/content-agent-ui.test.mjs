import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const adminUrl = new URL("../app/partner-admin.tsx", import.meta.url)
const languageUrl = new URL("../app/admin-language.tsx", import.meta.url)

test("partner editor labels editorial suggestions as Content-Agent drafts", async () => {
  const code = await readFile(adminUrl, "utf8")
  const language = await readFile(languageUrl, "utf8")

  assert.match(code, /Content-Agent/)
  assert.match(code, /ContentAgentSuggestionButton/)
  assert.equal((code.match(/ContentAgentSuggestionButton/g) ?? []).length >= 3, true)
  assert.doesNotMatch(code, /title="Generate with Ben"/)
  assert.match(language, /Generate with Content-Agent/)
})

test("editorial suggestions only update local form state", async () => {
  const code = await readFile(adminUrl, "utf8")

  assert.match(code, /setCustomerDescription\(result\.description\)/)
  assert.match(code, /setStaffInstructions\(result\.description\)/)
  assert.match(code, /setTerms\(result\.description\)/)
  assert.doesNotMatch(code, /ContentAgentSuggestionButton[\s\S]{0,800}formAction/)
})
