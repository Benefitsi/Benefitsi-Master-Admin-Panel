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

test("black and white logos use the Benefitsi blue fallback", () => {
  const pixels = [
    ...Array.from({ length: 180 }, () => ({ r: 255, g: 255, b: 255 })),
    ...Array.from({ length: 140 }, () => ({ r: 10, g: 10, b: 10 })),
    ...Array.from({ length: 40 }, () => ({ r: 132, g: 132, b: 132 })),
  ]

  assert.deepEqual(buildThemePalette(pixels), DEFAULT_PARTNER_PALETTE)
  assert.equal(DEFAULT_PARTNER_PALETTE.primary, "#118cff")
})

test("logo extraction favors the dominant brand color over rare saturated pixels", () => {
  const pixels = [
    ...Array.from({ length: 260 }, () => ({ r: 22, g: 132, b: 238 })),
    ...Array.from({ length: 18 }, () => ({ r: 246, g: 35, b: 173 })),
    ...Array.from({ length: 12 }, () => ({ r: 250, g: 205, b: 40 })),
  ]
  const palette = buildThemePalette(pixels)
  const red = Number.parseInt(palette.primary.slice(1, 3), 16)
  const blue = Number.parseInt(palette.primary.slice(5, 7), 16)

  assert.ok(blue > red)
  assert.notEqual(palette.source, "fallback")
})
