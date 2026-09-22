import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { extractMenuFromFiles, validateReviewedMenuDraft } from "../lib/menu-ai-import.ts"

function draft() {
  return {
    name: "Speisekarte", currency: "EUR", complete: true, warnings: [],
    categories: [{ name: "Pizza", items: [{
      name: "Margherita", description: "Tomaten, Mozzarella", price: 8.5,
      allergens: ["A", "G"], tags: [], note: "",
    }] }],
  }
}

function pdfFile(bytes = Buffer.from("%PDF-1.4\n1 0 obj<</Type /Catalog>>endobj\n%%EOF"), type = "application/pdf") {
  return new File([bytes], "karte.pdf", { type })
}

const bridgeOptions = { bridgeUrl: "https://m1.example.test", bridgeSecret: "test-bridge-secret" }

function provider(value = draft(), overrides = {}) {
  const requests = []
  const fetch = async (url, init) => {
    requests.push({ url, ...init, body: JSON.parse(init.body) })
    return Response.json({ profile: "benefitsi-menu", task: "extract-menu", schemaVersion: 1, requestId: JSON.parse(init.body).requestId, draft: value, ...overrides })
  }
  return { fetch, requests }
}

test("PDF extraction sends original bytes as a typed attachment to the dedicated Hermes M1 action and returns reviewed fields", async () => {
  const api = provider()
  const file = pdfFile()
  const result = await extractMenuFromFiles([file], { ...bridgeOptions, fetch: api.fetch })
  assert.deepEqual(result, draft())
  assert.equal(api.requests.length, 1)
  const request = api.requests[0]
  assert.equal(request.url, "https://m1.example.test/hermes/menu-extract")
  assert.equal(request.method, "POST")
  assert.equal(request.headers.authorization, "Bearer test-bridge-secret")
  assert.equal(request.redirect, "error")
  assert.equal(request.body.profile, "benefitsi-menu")
  assert.equal(request.body.task, "extract-menu")
  assert.equal(request.body.action, "menu-extract")
  assert.equal(request.cache, "no-store")
  assert.ok(request.signal instanceof AbortSignal)
  assert.equal(request.body.tools, undefined)
  const attachments = request.body.files
  assert.equal(attachments.length, 1)
  assert.equal(attachments[0].mimeType, "application/pdf")
  assert.deepEqual(Buffer.from(attachments[0].data, "base64"), Buffer.from(await file.arrayBuffer()))
  assert.equal(request.body.model, undefined)
  assert.equal(request.body.message, undefined)
})

test("JPEG, PNG and WebP photos retain their order and actual MIME types", async () => {
  const files = await Promise.all(["jpeg", "png", "webp"].map(async (format) => new File([
    await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).toFormat(format).toBuffer(),
  ], `seite.${format}`, { type: `image/${format}` })))
  const api = provider()
  await extractMenuFromFiles(files, { ...bridgeOptions, fetch: api.fetch })
  const attachments = api.requests[0].body.files
  assert.deepEqual(attachments.map((part) => part.mimeType), ["image/jpeg", "image/png", "image/webp"])
  for (let index = 0; index < files.length; index++) {
    assert.deepEqual(Buffer.from(attachments[index].data, "base64"), Buffer.from(await files[index].arrayBuffer()))
  }
})

test("extraction preserves uncertain source data without fabricating prices, currency or allergens", async () => {
  const value = draft()
  value.name = ""
  value.currency = ""
  value.categories[0].items[0] = { name: "Pizza", description: "", price: null, allergens: [], tags: [], note: "Klein/groß: Preis nicht eindeutig zugeordnet." }
  value.warnings = ["Größenvarianten und Aufpreise bitte anhand der Vorlage prüfen."]
  const api = provider(value)
  assert.deepEqual(await extractMenuFromFiles([pdfFile()], { ...bridgeOptions, fetch: api.fetch }), value)
  assert.throws(() => validateReviewedMenuDraft(value), /name|Währung|Preis/i)
})

test("review validation trims text and preserves explicit zero prices, notes and source warnings", () => {
  const value = draft()
  value.name = "  Mittagskarte  "
  value.categories[0].items[0].price = 0
  value.categories[0].items[0].note = "Größe vor Import prüfen."
  value.warnings = ["Angebot nur mittags."]
  const result = validateReviewedMenuDraft(value)
  assert.equal(result.name, "Mittagskarte")
  assert.equal(result.categories[0].items[0].price, 0)
  assert.equal(result.categories[0].items[0].note, "Größe vor Import prüfen.")
  assert.deepEqual(result.warnings, ["Angebot nur mittags."])
  assert.equal(value.name, "  Mittagskarte  ")
})

test("extraction preserves CHF source prices but review refuses unsupported currency without conversion", async () => {
  const value = draft()
  value.currency = "CHF"
  value.categories[0].items[0].price = 18.9
  const api = provider(value)
  const extracted = await extractMenuFromFiles([pdfFile()], { ...bridgeOptions, fetch: api.fetch })
  assert.equal(extracted.currency, "CHF")
  assert.equal(extracted.categories[0].items[0].price, 18.9)
  assert.throws(() => validateReviewedMenuDraft(extracted), /nur EUR.*keine automatische Umrechnung/i)
})

test("unreviewable values cannot cross the final import boundary", async (t) => {
  const cases = [
    ["blank menu name", (v) => { v.name = "  " }],
    ["blank currency", (v) => { v.currency = "" }],
    ["invalid currency", (v) => { v.currency = "Euro" }],
    ["blank category", (v) => { v.categories[0].name = "" }],
    ["blank item", (v) => { v.categories[0].items[0].name = "" }],
    ["unknown price", (v) => { v.categories[0].items[0].price = null }],
    ["negative price", (v) => { v.categories[0].items[0].price = -1 }],
    ["nonfinite price", (v) => { v.categories[0].items[0].price = Infinity }],
    ["numeric string", (v) => { v.categories[0].items[0].price = "8,50" }],
    ["empty categories", (v) => { v.categories = [] }],
    ["empty category", (v) => { v.categories[0].items = [] }],
    ["incomplete source", (v) => { v.complete = false }],
    ["missing completeness flag", (v) => { delete v.complete }],
    ["invalid allergens", (v) => { v.categories[0].items[0].allergens = "A,G" }],
    ["unsupported modifiers", (v) => { v.categories[0].items[0].modifiers = [{ name: "Käse", price: 2 }] }],
    ["missing note", (v) => { delete v.categories[0].items[0].note }],
    ["oversized name", (v) => { v.categories[0].items[0].name = "x".repeat(121) }],
    ["oversized description", (v) => { v.categories[0].items[0].description = "x".repeat(2001) }],
  ]
  for (const [name, mutate] of cases) await t.test(name, () => {
    const value = draft()
    mutate(value)
    assert.throws(() => validateReviewedMenuDraft(value))
  })
})

test("size limits reject overlarge menus instead of silently dropping categories or items", async () => {
  const manyCategories = draft()
  manyCategories.categories = Array.from({ length: 41 }, () => draft().categories[0])
  const manyItems = draft()
  manyItems.categories[0].items = Array.from({ length: 201 }, () => draft().categories[0].items[0])
  for (const value of [manyCategories, manyItems]) {
    assert.throws(() => validateReviewedMenuDraft(value), /aufteilen|Teil/)
    const api = provider(value)
    await assert.rejects(extractMenuFromFiles([pdfFile()], { ...bridgeOptions, fetch: api.fetch }), /aufteilen|Teil/)
  }
  const maximum = draft()
  maximum.categories = Array.from({ length: 40 }, (_, i) => ({ name: `Kategorie ${i}`, items: Array.from({ length: 5 }, () => draft().categories[0].items[0]) }))
  assert.equal(validateReviewedMenuDraft(maximum).categories.flatMap((category) => category.items).length, 200)
})

test("file validation rejects unsupported, spoofed and mixed files before making any provider call", async (t) => {
  const photo = new File([await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer()], "photo.png", { type: "image/png" })
  const cases = [
    ["empty upload", []],
    ["too many photos", Array.from({ length: 9 }, () => photo)],
    ["two PDFs", [pdfFile(), pdfFile()]],
    ["PDF mixed with photo", [pdfFile(), photo]],
    ["HTML masquerading as PDF", [pdfFile(Buffer.from("<html>menu</html>"))]],
    ["PDF declared as JPEG", [pdfFile(undefined, "image/jpeg")]],
    ["unsupported MIME", [pdfFile(undefined, "text/plain")]],
    ["empty file", [pdfFile(Buffer.alloc(0))]],
    ["aggregate too large", [pdfFile(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(4 * 1024 * 1024)]))]],
  ]
  for (const [name, files] of cases) await t.test(name, async () => {
    let requests = 0
    await assert.rejects(extractMenuFromFiles(files, { ...bridgeOptions, fetch: async () => { requests++; throw new Error("must not call") } }))
    assert.equal(requests, 0)
  })
})

test("the 4 MiB upload boundary accepts its limit and rejects one extra byte across multiple files", async () => {
  const maximumPdf = Buffer.alloc(4 * 1024 * 1024)
  maximumPdf.write("%PDF-1.4\n")
  const atLimit = provider()
  await extractMenuFromFiles([pdfFile(maximumPdf)], { ...bridgeOptions, fetch: atLimit.fetch })
  assert.equal(atLimit.requests.length, 1)

  const imageBytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer()
  const photos = [2 * 1024 * 1024, 2 * 1024 * 1024 + 1].map((size, index) => new File([
    imageBytes, Buffer.alloc(size - imageBytes.length),
  ], `seite-${index}.png`, { type: "image/png" }))
  const tooLarge = provider()
  await assert.rejects(extractMenuFromFiles(photos, { ...bridgeOptions, fetch: tooLarge.fetch }), /höchstens 4 MiB/)
  assert.equal(tooLarge.requests.length, 0, "the aggregate cap must apply before a provider request")
})

test("missing provider configuration never sends a menu", async () => {
  let requests = 0
  await assert.rejects(extractMenuFromFiles([pdfFile()], { ...bridgeOptions, bridgeSecret: " ", fetch: async () => { requests++; throw new Error("must not call") } }), /eingerichtet|konfiguriert/)
  assert.equal(requests, 0)
})

test("mismatched, incomplete and malformed Hermes responses are rejected", async (t) => {
  for (const overrides of [
    { profile: "ben" }, { task: "chat" }, { schemaVersion: 2 }, { requestId: "old-request" },
    { draft: { ...draft(), complete: false } }, { draft: null }, { draft: "{broken" },
  ]) await t.test(JSON.stringify(overrides), async () => {
    const api = provider(draft(), overrides)
    await assert.rejects(extractMenuFromFiles([pdfFile()], { ...bridgeOptions, fetch: api.fetch }))
  })
})

test("bridge URL validation rejects insecure destinations and credentials before upload", async () => {
  for (const bridgeUrl of ["http://remote.example.test", "https://user:pass@m1.example.test", "https://m1.example.test?token=secret", "not a URL"]) {
    const api = provider()
    await assert.rejects(extractMenuFromFiles([pdfFile()], { ...bridgeOptions, bridgeUrl, fetch: api.fetch }))
    assert.equal(api.requests.length, 0)
  }
})

test("provider transport errors are actionable German messages without echoing upstream secrets", async (t) => {
  for (const status of [400, 401, 403, 429, 500, 503]) await t.test(String(status), async () => {
    await assert.rejects(extractMenuFromFiles([pdfFile()], { ...bridgeOptions, fetch: async () => Response.json({ error: { message: "private-key/provider-internal-detail" } }, { status }) }), (error) => {
      assert.doesNotMatch(error.message, /private-key|provider-internal-detail/)
      assert.match(error.message, /KI|erneut|Limit|Zugang/)
      return true
    })
  })
  await assert.rejects(extractMenuFromFiles([pdfFile()], { ...bridgeOptions, fetch: async () => { throw new TypeError("private-key upstream network error") } }), /Verbindung|erreichbar|erneut/)
})
