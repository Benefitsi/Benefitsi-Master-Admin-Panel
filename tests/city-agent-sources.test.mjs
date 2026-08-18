import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deflateSync } from "node:zlib";

test("source extraction normalizes non-global matchers before matchAll", async () => {
  const code = await readFile(new URL("../lib/city-agent/sources.ts", import.meta.url), "utf8");
  assert.match(code, /expression\.global/);
  assert.match(code, /new RegExp\(expression\.source, `\$\{expression\.flags\}g`\)/);
  assert.match(code, /html\.matchAll\(globalExpression\)/);
});

test("PDF extraction reads Flate-compressed text content streams without OCR", async () => {
  const { extractPdfText } = await import("../lib/city-agent/sources.ts");
  const content = Buffer.from("BT\n[(Stadtrundgang) 40 (Annweiler)]TJ\nET\n", "latin1");
  const compressed = deflateSync(content);
  const bytes = Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<</Type /Page /Filter /FlateDecode /Length ", "latin1"),
    Buffer.from(String(compressed.length), "latin1"),
    Buffer.from(">>\nstream\n", "latin1"),
    compressed,
    Buffer.from("\nendstream\nendobj\n%%EOF", "latin1"),
  ]);

  const result = extractPdfText(bytes);
  assert.equal(result.extractable, true);
  assert.match(result.text, /Stadtrundgang/);
  assert.match(result.text, /Annweiler/);
});
