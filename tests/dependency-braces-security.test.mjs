import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const braces = require("braces")

test("brace patterns reject excessive nesting before overflowing the call stack", () => {
  for (const [open, close] of [["{", "}"], ["(", ")"]]) {
    const pattern = open.repeat(101) + "a,b" + close.repeat(101)
    assert.throws(() => braces.parse(pattern), /exceeds max depth/)
    assert.throws(() => braces(pattern, { maxDepth: 10_000 }), /exceeds max depth/)
    assert.doesNotThrow(() => braces.parse(open.repeat(100) + "a,b" + close.repeat(100)))
  }
})

test("direct brace AST processing rejects excessive depth in every public walker", () => {
  for (const method of ["compile", "expand", "stringify"]) {
    let ast = { type: "text", value: "a" }
    for (let i = 0; i < 101; i++) ast = { type: "brace", nodes: [ast] }
    ast = { type: "root", nodes: [ast] }
    assert.throws(() => braces[method](ast), /exceeds max depth/, method)
  }
})

test("bounded brace parsing retains ordinary ranges, nested patterns and escaping", () => {
  assert.deepEqual(braces.expand("app/{page,layout}.{ts,tsx}"), ["app/page.ts", "app/page.tsx", "app/layout.ts", "app/layout.tsx"])
  assert.deepEqual(braces.expand("item{1..3}"), ["item1", "item2", "item3"])
  assert.equal(braces.stringify(braces.parse("{{a}}"), { escapeInvalid: true }), "{{a}}")
  assert.throws(() => braces.parse("{{a,b},c}", { maxDepth: 1.5 }), /exceeds max depth/)
})

test("the pinned mitigation remains compatible with micromatch and Next lint globs", () => {
  const micromatch = require("micromatch")
  const fastGlob = require("fast-glob")
  assert.deepEqual(micromatch(["app/page.tsx", "lib/config.ts", "image.png"], "**/*.{ts,tsx}"), ["app/page.tsx", "lib/config.ts"])
  assert.deepEqual(fastGlob.sync("app/{partner-actions,partner-admin}.{ts,tsx}").sort(), ["app/partner-actions.ts", "app/partner-admin.tsx"])
})
