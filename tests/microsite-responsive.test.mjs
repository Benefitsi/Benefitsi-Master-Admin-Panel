import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const componentUrl = new URL(
  "../components/microsite/restaurant-premium-microsite.tsx",
  import.meta.url,
)
const micrositeActionsUrl = new URL("../app/microsite-actions.ts", import.meta.url)
const builderUrl = new URL("../app/microsite-panel.tsx", import.meta.url)

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
  assert.match(source, /partitionMicrositePublicDeals\(publicDeals\)/)
  assert.match(source, /secondaryDeals\.map/)
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
    /secondaryDeals\.length > 1 \? "@min-\[900px\]:grid-cols-2" : ""/,
  )
  assert.match(source, /const isFeaturedDeal = primary/)
  assert.match(source, /const articleClassName = isFeaturedDeal\s+\? `premium-topdeal/)
  assert.match(source, /if \(!featuredDeal && !hasLoyaltyContent\) return null/)
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

test("keeps hero photos sharp and gives the final stamp a restrained emphasis", async () => {
  const source = await readFile(componentUrl, "utf8")
  const actionsSource = await readFile(micrositeActionsUrl, "utf8")

  assert.doesNotMatch(source, /premium-hero-image-focus[\s\S]{0,500}filter: blur/)
  assert.match(source, /scale-\[1\.04\]/)
  assert.match(source, /shadow-\[0_14px_30px_-20px_var\(--site-accent\)\]/)
  assert.match(actionsSource, /width: 2880/)
  assert.match(actionsSource, /height: 2880/)
  assert.match(actionsSource, /webp\(\{ quality: 90, effort: 5 \}\)/)
})

test("keeps the editor sidebar pinned beside a long live preview on desktop", async () => {
  const source = await readFile(builderUrl, "utf8")

  assert.match(source, /lg:items-start/)
  assert.match(source, /lg:!sticky lg:!self-start lg:z-20/)
  assert.match(source, /lg:top-20 lg:h-\[calc\(100dvh-5rem\)\]/)
})
