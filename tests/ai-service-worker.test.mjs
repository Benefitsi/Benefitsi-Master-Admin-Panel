import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import proxyTesting from "next/experimental/testing/server"

import { config } from "../proxy.ts"
import { portalRoute } from "../lib/portal-routing.ts"

const { unstable_doesMiddlewareMatch } = proxyTesting

test("the compatibility service worker is public and bypasses authentication", async () => {
  const source = await readFile(
    new URL("../public/ai-sw.js", import.meta.url),
    "utf8",
  )

  assert.equal(portalRoute("partner.benefitsi.de", "/ai-sw.js", "GET").kind, "public")
  assert.match(source, /Intentionally empty compatibility service worker/)
  assert.equal(
    unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "/ai-sw.js",
    }),
    true,
  )
  assert.equal(
    unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "/microsites",
    }),
    true,
  )
})
