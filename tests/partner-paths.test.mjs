import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("legacy Knobi slugs resolve to the single public partner page", async () => {
  const [paths, proxy, legacyPage] = await Promise.all([
    read("lib/partner-paths.ts"),
    read("proxy.ts"),
    read("app/p/[slug]/page.tsx"),
  ])

  for (const legacySlug of [
    "kebap-haus-annweiler",
    "knobi-doener-annweiler",
    "knobi-imbiss-doener-kebab-annweiler",
  ]) {
    assert.match(paths, new RegExp(`"${legacySlug}": "knobi-doener-und-pizza-haus"`))
  }

  assert.match(proxy, /canonicalPartnerSlug\(slug\)/)
  assert.match(legacyPage, /canonicalPartnerSlug\(slug\)/)
})

