import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import sharp from "sharp"
import ts from "typescript"

function prepare() {
  const source = readFileSync(new URL("../app/partner-actions.ts", import.meta.url), "utf8")
  const file = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.Latest, true)
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "preparePartnerUploadFile")
  const compiled = ts.transpileModule(fn.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function("sharp", "File", "Buffer", "partnerMediaContentType", "replaceFileExtension", `${compiled}; return preparePartnerUploadFile`)(sharp, File, Buffer, file => file.type, (name, ext) => `${name.replace(/\.[^.]+$/, "")}.${ext}`)
}
test("an already sized WebP keeps its exact bytes instead of accumulating another lossy encoding", async () => {
  for (const [width, height] of [[64, 32], [32, 16]]) {
    const input = await sharp({ create: { width, height, channels: 4, background: "#128cffa0" } }).webp({ lossless: true }).toBuffer()
    const result = await prepare()(new File([input], "photo.webp", { type: "image/webp" }), { width: 64, height: 32 })
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), input)
    assert.ok(result.name.endsWith(`${width}x${height}.webp`))
  }
})
test("larger source images still use the existing crop and WebP preparation", async () => {
  const input = await sharp({ create: { width: 128, height: 64, channels: 3, background: "#ff751a" } }).png().toBuffer()
  const result = await prepare()(new File([input], "photo.png", { type: "image/png" }), { width: 64, height: 32 })
  const info = await sharp(Buffer.from(await result.arrayBuffer())).metadata()
  assert.equal(info.format, "webp"); assert.equal(info.width, 64); assert.equal(info.height, 32)
})
