import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8")
}

test("/wissen is an admin-protected server page with server-side pagination", async () => {
  const page = await source("app/wissen/page.tsx")
  assert.match(page, /requireAdmin\(\)/)
  assert.match(page, /searchBenefitsiKnowledge\(/)
  assert.match(page, /getBenefitsiKnowledgeDocument\(/)
  assert.match(page, /PAGE_SIZE\s*=\s*50/)
  assert.match(page, /searchParams/)
  assert.doesNotMatch(page, /use client/)
  assert.doesNotMatch(page, /SUPABASE_SERVICE_ROLE_KEY|knowledge-ingestion-token|absolute_path|m1Path/i)
})

test("Admin navigation exposes the German Wissen entry and active state", async () => {
  const shell = await source("app/admin-shell.tsx")
  assert.match(shell, /href="\/wissen"/)
  assert.match(shell, /label="Wissen"/)
  assert.match(shell, /pathname\.startsWith\("\/wissen"\)/)
})

test("the mirror UI renders status, sync metadata, deletion state, and read-only detail copy", async () => {
  const browser = await source("app/wissen/knowledge-browser.tsx")
  for (const label of [
    "Wissensspiegel",
    "Letzte erfolgreiche Synchronisierung",
    "Dokumente",
    "Letzter sicherer Fehler",
    "Relativer Pfad",
    "Geändert",
    "Synchronisiert",
    "Gelöscht",
    "Dokument öffnen",
  ]) {
    assert.match(browser, new RegExp(label))
  }
  assert.doesNotMatch(browser, /SUPABASE_SERVICE_ROLE_KEY|knowledge-ingestion-token|absolute_path|m1Path/i)
  assert.doesNotMatch(browser, /textarea|contentEditable|action=/)
})

test("the browser-facing knowledge component contains no private-table or token access", async () => {
  const files = await Promise.all([
    source("app/wissen/page.tsx"),
    source("app/wissen/knowledge-browser.tsx"),
  ])
  const combined = files.join("\n")
  assert.doesNotMatch(combined, /from\(["']knowledge_/)
  assert.doesNotMatch(combined, /createAdminClient\(/)
  assert.doesNotMatch(combined, /token|service.role/i)
})

test("the token-bound ingestion API bypasses the browser-session redirect", async () => {
  const proxy = await source("lib/supabase/proxy.ts")
  assert.match(proxy, /pathname\.startsWith\("\/api\/internal\/knowledge\/sync"\)/)
})
