import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const componentUrl = new URL(
  "../components/microsite/restaurant-premium-microsite.tsx",
  import.meta.url,
)

test("keeps the microsite mobile layout requirements in place", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.match(source, /\.premium-hero-glass \{\s+display: none;/)
  assert.match(source, /padding: 0 \.75rem \.55rem;/)
  assert.match(source, /padding-block: 30\.625rem 1\.25rem;/)
  assert.match(
    source,
    /premium-stamp-rewards mt-5 grid grid-cols-1 gap-3/,
  )
  assert.doesNotMatch(source, /currentMobileRewardId/)
  assert.match(source, /items-center justify-self-center gap-2/)
  assert.match(
    source,
    /premium-about-background premium-parallax absolute inset-0 h-full w-full object-cover/,
  )
  assert.match(source, /\.premium-about-background \{\s+opacity: \.32;/)
})

test("renders admin-backed deals and stamp rewards as responsive collections", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.match(source, /getMicrositePublicDeals/)
  assert.match(source, /getMicrositeStampDeals/)
  assert.match(source, /getMicrositeWelcomeDeals/)
  assert.match(source, /getMicrositeStampRewards/)
  assert.match(source, /publicDeals\.map/)
  assert.match(source, /@min-\[900px\]:grid-cols-2/)
  assert.match(source, /stampDeals\.map/)
  assert.match(source, /stampRewards\.map/)
  assert.doesNotMatch(source, /const twoForOneDeal = partner\.deals\.find/)
  assert.doesNotMatch(source, /textValue\(config, card\.titleId, card\.titleFallback\)/)
})

test("keeps secondary deal banners compact next to the top deal", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.match(source, /premium-deal-secondary/)
  assert.match(
    source,
    /wide=\{publicDeals\.length > 1 && isMicrositeTopDeal\(deal\)\}/,
  )
  assert.match(source, /isTopDeal \?/)
  assert.match(source, /const articleClassName = isTopDeal\s+\? `premium-topdeal/)
})

test("keeps dark mode polished and uses the official social glyphs", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.doesNotMatch(source, /LanguageSwitch|onLanguageChange|<Languages/)
  assert.match(source, /\.premium-microsite-dark \.premium-hero-title-panel/)
  assert.match(source, /\.premium-microsite-dark \.premium-stamp-panel/)
  assert.match(source, /\.premium-microsite-dark \.premium-about-scrim/)
  assert.match(source, /\.premium-microsite-dark \.premium-branded-image/)
  assert.match(
    source,
    /return <FaTiktok aria-hidden="true" className=\{sizeClassName\} \/>/,
  )
})
