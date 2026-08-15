export type ThemePalette = {
  primary: string
  secondary: string
  tertiary: string
  source: "logo" | "derived" | "fallback"
}

export const DEFAULT_PARTNER_PALETTE: ThemePalette = {
  primary: "#f97316",
  secondary: "#172554",
  tertiary: "#14b8a6",
  source: "fallback",
}

type Rgb = { r: number; g: number; b: number }
type Hsl = { h: number; s: number; l: number }

export async function extractThemePalette(
  logoUrl: string,
): Promise<ThemePalette> {
  if (!logoUrl || typeof window === "undefined") {
    return DEFAULT_PARTNER_PALETTE
  }

  try {
    const pixels = await readLogoPixels(logoUrl)
    return buildThemePalette(pixels)
  } catch {
    return DEFAULT_PARTNER_PALETTE
  }
}

export function buildThemePalette(pixels: Rgb[]): ThemePalette {
  const buckets = new Map<string, { color: Rgb; count: number }>()

  for (const pixel of pixels) {
    const hsl = rgbToHsl(pixel)

    if (hsl.l > 0.96 || hsl.l < 0.035 || hsl.s < 0.08) {
      continue
    }

    const color = {
      r: Math.round(pixel.r / 24) * 24,
      g: Math.round(pixel.g / 24) * 24,
      b: Math.round(pixel.b / 24) * 24,
    }
    const key = `${color.r}-${color.g}-${color.b}`
    const existing = buckets.get(key)
    buckets.set(key, {
      color,
      count: (existing?.count ?? 0) + 1,
    })
  }

  const candidates = Array.from(buckets.values())
    .sort((a, b) => {
      const aHsl = rgbToHsl(a.color)
      const bHsl = rgbToHsl(b.color)
      return b.count * (0.65 + bHsl.s) - a.count * (0.65 + aHsl.s)
    })
    .map((entry) => entry.color)
    .filter((color, index, list) =>
      list.slice(0, index).every((other) => colorDistance(color, other) > 82),
    )
    .slice(0, 8)

  if (!candidates.length) {
    return DEFAULT_PARTNER_PALETTE
  }

  const primaryRgb = [...candidates].sort(
    (a, b) => colorEnergy(b) - colorEnergy(a),
  )[0]
  const primary = tuneAccent(primaryRgb)
  const primaryHsl = rgbToHsl(hexToRgb(primary))

  const darkCandidate = [...candidates]
    .sort((a, b) => rgbToHsl(a).l - rgbToHsl(b).l)
    .find((color) => contrastRatio(primary, rgbToHex(color)) >= 3)
  const secondary = darkCandidate
    ? tuneInk(darkCandidate)
    : rgbToHex(
        hslToRgb({
          h: (primaryHsl.h + 28) % 360,
          s: Math.max(0.42, primaryHsl.s * 0.72),
          l: 0.18,
        }),
      )

  const tertiaryCandidate = candidates.find((color) => {
    const candidate = rgbToHex(color)
    return (
      colorDistance(hexToRgb(primary), color) > 105 &&
      contrastRatio(candidate, secondary) >= 2.4
    )
  })
  const tertiary = tertiaryCandidate
    ? tuneAccent(tertiaryCandidate)
    : rgbToHex(
        hslToRgb({
          h: (primaryHsl.h + 155) % 360,
          s: Math.min(0.72, Math.max(0.48, primaryHsl.s)),
          l: primaryHsl.l > 0.58 ? 0.42 : 0.54,
        }),
      )

  return {
    primary,
    secondary,
    tertiary,
    source: candidates.length >= 3 ? "logo" : "derived",
  }
}

export function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(hexToRgb(first))
  const secondLuminance = relativeLuminance(hexToRgb(second))
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

async function readLogoPixels(url: string) {
  const image = new Image()
  image.crossOrigin = "anonymous"
  image.decoding = "async"

  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("Logo could not be loaded"))
  })

  image.src = url
  await loaded

  const canvas = document.createElement("canvas")
  const size = 72
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) {
    throw new Error("Canvas is unavailable")
  }

  context.clearRect(0, 0, size, size)
  context.drawImage(image, 0, 0, size, size)
  const data = context.getImageData(0, 0, size, size).data
  const pixels: Rgb[] = []

  for (let index = 0; index < data.length; index += 16) {
    if (data[index + 3] < 160) {
      continue
    }

    pixels.push({ r: data[index], g: data[index + 1], b: data[index + 2] })
  }

  return pixels
}

function tuneAccent(color: Rgb) {
  const hsl = rgbToHsl(color)
  return rgbToHex(
    hslToRgb({
      h: hsl.h,
      s: Math.min(0.82, Math.max(0.5, hsl.s)),
      l: Math.min(0.58, Math.max(0.42, hsl.l)),
    }),
  )
}

function tuneInk(color: Rgb) {
  const hsl = rgbToHsl(color)
  return rgbToHex(
    hslToRgb({
      h: hsl.h,
      s: Math.min(0.62, Math.max(0.32, hsl.s)),
      l: Math.min(0.25, Math.max(0.13, hsl.l)),
    }),
  )
}

function colorEnergy(color: Rgb) {
  const hsl = rgbToHsl(color)
  return hsl.s * 1.4 + (1 - Math.abs(0.5 - hsl.l)) * 0.45
}

function colorDistance(a: Rgb, b: Rgb) {
  return Math.sqrt(
    (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2,
  )
}

function relativeLuminance(color: Rgb) {
  const values = [color.r, color.g, color.b].map((value) => {
    const channel = value / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

function hexToRgb(value: string): Rgb {
  const hex = value.replace("#", "")
  const normalized = hex.length === 3
    ? hex.split("").map((character) => character + character).join("")
    : hex.padEnd(6, "0").slice(0, 6)
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex(color: Rgb) {
  return `#${[color.r, color.g, color.b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0

  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6)
    if (max === green) hue = 60 * ((blue - red) / delta + 2)
    if (max === blue) hue = 60 * ((red - green) / delta + 4)
  }

  const lightness = (max + min) / 2
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0
  return { h: (hue + 360) % 360, s: saturation, l: lightness }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hue = h / 60
  const x = chroma * (1 - Math.abs((hue % 2) - 1))
  let red = 0
  let green = 0
  let blue = 0

  if (hue < 1) [red, green] = [chroma, x]
  else if (hue < 2) [red, green] = [x, chroma]
  else if (hue < 3) [green, blue] = [chroma, x]
  else if (hue < 4) [green, blue] = [x, chroma]
  else if (hue < 5) [red, blue] = [x, chroma]
  else [red, blue] = [chroma, x]

  const match = l - chroma / 2
  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
  }
}
