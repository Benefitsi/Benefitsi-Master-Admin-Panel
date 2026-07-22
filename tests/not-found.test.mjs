import assert from "node:assert/strict"
import test from "node:test"

import notFoundModule from "../app/not-found.js"

const NotFound = notFoundModule.default

test("unmatched routes redirect to the homepage", () => {
  assert.throws(
    () => NotFound(),
    (error) =>
      typeof error?.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT;replace;/;"),
  )
})
