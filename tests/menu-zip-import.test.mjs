import assert from "node:assert/strict"
import { File } from "node:buffer"
import test from "node:test"

import menuImport from "../lib/menu-import.js"
import menuZipImport from "../lib/menu-zip-import.js"

const { runMenuImportBatch } = menuImport
const { readMenuZipFiles } = menuZipImport

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

function knobiMenu(overrides = {}) {
  return {
    categories: [{
      name: "Pizza",
      image_url: "assets/pizza-category.png",
      items: [{
        name: "Margherita",
        price: 9.5,
        image_url: "",
        addons: [{ title: "Extra cheese", cost: 1.5 }],
        ...overrides,
      }],
    }],
  }
}

function zipFile(entries, name = "knobi-menu.zip") {
  const bytes = createStoredZip(entries)
  return new File([bytes], name, { type: "application/zip" })
}

test("valid Knobi ZIP is detected by structure and resolves relative category images", async () => {
  const prepared = await readMenuZipFiles([zipFile({
    "knobi_menu_extraction/knobi-menu.json": JSON.stringify(knobiMenu()),
    "knobi_menu_extraction/assets/pizza-category.png": pngBytes,
  })])

  assert.deepEqual(prepared.errors, [])
  assert.equal(prepared.menus.length, 1)
  assert.equal(prepared.preview.categories, 1)
  assert.equal(prepared.preview.items, 1)
  assert.equal(prepared.preview.addons, 1)
  assert.equal(prepared.preview.imagesMatched, 1)
  assert.equal(prepared.preview.imagesMissing, 0)
  const imageUrl = prepared.menus[0].categories[0].image_url
  assert.match(imageUrl, /^zip-asset:\/\//)
  assert.equal(prepared.imageAssets.get(imageUrl).contentType, "image/png")
})

test("ZIP menu optional descriptions default to empty strings", async () => {
  const prepared = await readMenuZipFiles([zipFile({
    "menu.json": JSON.stringify(knobiMenu()),
    "assets/pizza-category.png": pngBytes,
  })])

  const item = prepared.menus[0].categories[0].items[0]
  assert.equal(item.description, "")
  assert.equal(item.addons[0].description, "")
})

test("empty ZIP image paths remain empty and are not counted as missing", async () => {
  const menu = knobiMenu({ image_url: "" })
  menu.categories[0].image_url = ""
  const prepared = await readMenuZipFiles([zipFile({
    "menu.json": JSON.stringify(menu),
  })])

  assert.equal(prepared.preview.imagesMatched, 0)
  assert.equal(prepared.preview.imagesMissing, 0)
  assert.equal(prepared.menus[0].categories[0].image_url, "")
  assert.equal(prepared.menus[0].categories[0].items[0].image_url, "")
})

test("missing ZIP image files produce contextual warnings without local database paths", async () => {
  const prepared = await readMenuZipFiles([zipFile({
    "knobi/menu.json": JSON.stringify(knobiMenu()),
  })])

  assert.equal(prepared.menus.length, 1)
  assert.equal(prepared.preview.imagesMissing, 1)
  assert.equal(prepared.menus[0].categories[0].image_url, "")
  assert.match(prepared.warnings[0], /category "Pizza".*knobi\/assets\/pizza-category\.png.*not found/)
})

test("malformed JSON in a ZIP is reported and no menu is prepared", async () => {
  const prepared = await readMenuZipFiles([zipFile({ "knobi/menu.json": "{broken" })])

  assert.equal(prepared.menus.length, 0)
  assert.equal(prepared.preview.ready, false)
  assert.match(prepared.errors.join("\n"), /knobi\/menu\.json: malformed JSON/)
})

test("ZIP path traversal entries are rejected before extraction", async () => {
  const prepared = await readMenuZipFiles([zipFile({
    "../menu.json": JSON.stringify(knobiMenu()),
  })])

  assert.equal(prepared.menus.length, 0)
  assert.match(prepared.errors.join("\n"), /path traversal.*not allowed/)
})

test("failed Supabase image upload imports the ZIP menu without that image", async () => {
  const prepared = await readMenuZipFiles([zipFile({
    "knobi/menu.json": JSON.stringify(knobiMenu()),
    "knobi/assets/pizza-category.png": pngBytes,
  })])
  let savedMenu
  const result = await runMenuImportBatch(prepared, {
    mode: "append",
    async copyImage() { throw new Error("Supabase upload failed") },
    async saveMenu(menu) {
      savedMenu = menu
      return { importedCategories: 1, importedItems: 1 }
    },
  })

  assert.equal(result.successes.length, 1)
  assert.equal(savedMenu.categories[0].image_url, "")
  assert.match(result.warnings.join("\n"), /category "Pizza".*Supabase upload failed; imported without image/)
})

function createStoredZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const [name, rawValue] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name)
    const data = Buffer.isBuffer(rawValue) ? rawValue : Buffer.from(rawValue)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    localParts.push(local, nameBytes, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
