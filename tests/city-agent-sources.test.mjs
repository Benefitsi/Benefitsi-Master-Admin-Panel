import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("source extraction normalizes non-global matchers before matchAll", async () => {
  const code = await readFile(new URL("../lib/city-agent/sources.ts", import.meta.url), "utf8");
  assert.match(code, /expression\.global/);
  assert.match(code, /new RegExp\(expression\.source, `\$\{expression\.flags\}g`\)/);
  assert.match(code, /html\.matchAll\(globalExpression\)/);
});
