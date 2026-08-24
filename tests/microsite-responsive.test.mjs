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
