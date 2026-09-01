import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const actionsUrl = new URL("../app/partner-actions.ts", import.meta.url)

test("partner and deal copy actions use the dedicated Content-Agent bridge contract", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(code, /action:\s*["']content-draft["']/)
  assert.match(code, /profile:\s*["']benefitsi-content["']/)
  assert.match(code, /requestContentDraft\(\s*["']partner_description["']/)
  assert.match(code, /["']deal_copy["']/)
  assert.match(code, /["']staff_instructions["']/)
  assert.match(code, /parseContentDraftResponse/)
  assert.doesNotMatch(code, /action:\s*["']partner-description["']/)
  assert.doesNotMatch(code, /profile:\s*["']ben["']/)
})

test("content actions keep drafts human-reviewed and do not save agent output", async () => {
  const code = await readFile(actionsUrl, "utf8")

  assert.match(code, /Please review it before saving|vor dem Speichern/i)
  assert.match(code, /AbortSignal\.timeout\(60_000\)/)
  assert.doesNotMatch(code, /supabase[\s\S]{0,120}description\s*=/i)
})
