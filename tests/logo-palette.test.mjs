import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_PARTNER_PALETTE,
  buildThemePalette,
  contrastRatio,
  extractThemePalette,
} from "../lib/logo-palette.ts"

test("logo palette builds three distinct professional roles from sampled colors", () => {
  const pixels = [
    ...Array.from({ length: 80 }, () => ({ r: 236, g: 91, b: 35 })),
    ...Array.from({ length: 55 }, () => ({ r: 22, g: 43, b: 82 })),
    ...Array.from({ length: 40 }, () => ({ r: 24, g: 174, b: 161 })),
  ]
  const palette = buildThemePalette(pixels)

  assert.equal(new Set([palette.primary, palette.secondary, palette.tertiary]).size, 3)
  assert.ok(contrastRatio(palette.primary, palette.secondary) >= 3)
  assert.notEqual(palette.source, "fallback")
})

test("unavailable browser logo extraction returns the professional fallback", async () => {
  assert.deepEqual(await extractThemePalette(""), DEFAULT_PARTNER_PALETTE)
})
