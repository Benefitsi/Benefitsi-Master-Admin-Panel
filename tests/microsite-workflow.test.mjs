import assert from "node:assert/strict"
import test from "node:test"
import { micrositeVersions } from "../lib/microsite-workflow.ts"

const version = (number, status) => ({ id: `${status}-${number}`, version_number: number, status, created_at: `2026-10-07T10:${String(number).padStart(2, "0")}:00Z`, config: { headline: `${status}-${number}` } })

test("reopening after publishing does not replace the latest page with an older draft", () => {
  const live = version(8, "published")
  const result = micrositeVersions({ status: "published", publishedVersion: live, draftVersion: version(6, "draft") })
  assert.equal(result.editable, live)
  assert.equal(result.published, live)
  assert.equal(result.draft, null)
})

test("a newer saved draft can be edited while the old public page stays active", () => {
  const live = version(8, "published"), draft = version(9, "draft")
  const result = micrositeVersions({ status: "published", publishedVersion: live, draftVersion: draft })
  assert.equal(result.editable, draft)
  assert.equal(result.draft, draft)
  assert.equal(result.published, live)
})

test("withdrawn publication is editable but never offered as the active website", () => {
  const live = version(8, "published")
  const result = micrositeVersions({ status: "archived", publishedVersion: live, draftVersion: null })
  assert.equal(result.editable, live)
  assert.equal(result.published, null)
})

test("legacy versions with no sequence compare their actual save times", () => {
  const live = { ...version(8, "published"), version_number: null }
  const draft = { ...version(6, "draft"), version_number: null }
  assert.equal(micrositeVersions({ status: "published", publishedVersion: live, draftVersion: draft }).editable, live)
})
test("missing legacy ordering metadata never silently discards a saved draft", () => {
  const draft = { id: "legacy-draft", config: { headline: "Unpublished edits" } }
  assert.equal(micrositeVersions({ status: "published", draftVersion: draft, publishedVersion: { id: "old-public" } }).editable, draft)
})
