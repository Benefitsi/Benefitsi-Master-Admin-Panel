import { createHash } from "node:crypto"
import path from "node:path"
import yauzl from "yauzl"

import { validateMenuDocument } from "./menu-import.js"

export const MAX_MENU_ZIP_BYTES = 15 * 1024 * 1024
export const MAX_MENU_ZIP_ENTRY_BYTES = 10 * 1024 * 1024
export const MAX_MENU_ZIP_EXTRACTED_BYTES = 50 * 1024 * 1024
export const MAX_MENU_ZIP_FILES = 250

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"])

export async function readMenuZipFiles(files, options = {}) {
  const errors = []
  const warnings = []
  const menus = []
  const imageAssets = new Map()
  const hash = createHash("sha256")
  let imagesMatched = 0
  let imagesMissing = 0

  for (const file of files) {
    const filename = file.name || "menu.zip"
    if (file.size > (options.maxZipBytes ?? MAX_MENU_ZIP_BYTES)) {
      errors.push(`${filename}: ZIP must be ${formatBytes(options.maxZipBytes ?? MAX_MENU_ZIP_BYTES)} or smaller.`)
      continue
    }

    let archive
    try {
      const bytes = Buffer.from(await file.arrayBuffer())
      if (bytes.length > (options.maxZipBytes ?? MAX_MENU_ZIP_BYTES)) {
        throw new Error(`ZIP must be ${formatBytes(options.maxZipBytes ?? MAX_MENU_ZIP_BYTES)} or smaller`)
      }
      hash.update(filename).update("\0").update(bytes)
      archive = await extractZip(bytes, options)
    } catch (error) {
      const message = error instanceof Error ? error.message : "unable to extract ZIP"
      errors.push(`${filename}: ${/invalid relative path/i.test(message) ? `ZIP path traversal is not allowed (${message})` : message}.`)
      continue
    }

    const archiveId = createHash("sha256")
      .update(filename)
      .update("\0")
      .update(archive.digest)
      .digest("hex")
      .slice(0, 20)
    let menuJsonFound = false

    for (const [entryPath, entry] of archive.entries) {
      if (entry.kind !== "json") continue

      let value
      try {
        value = JSON.parse(entry.bytes.toString("utf8"))
      } catch {
        errors.push(`${filename} > ${entryPath}: malformed JSON.`)
        continue
      }

      if (!value || typeof value !== "object" || !Array.isArray(value.categories)) {
        warnings.push(`${filename} > ${entryPath}: ignored JSON because it does not contain a top-level "categories" array.`)
        continue
      }

      menuJsonFound = true
      try {
        const menu = validateMenuDocument(value, `${filename} > ${entryPath}`)
        const resolved = resolveMenuImages(menu, entryPath, archive.entries, archiveId, filename)
        imagesMatched += resolved.imagesMatched
        imagesMissing += resolved.imagesMissing
        warnings.push(...resolved.warnings)
        for (const [url, asset] of resolved.imageAssets) imageAssets.set(url, asset)
        menus.push(resolved.menu)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${filename} > ${entryPath}: invalid menu JSON.`)
      }
    }

    if (!menuJsonFound) {
      errors.push(`${filename}: no menu JSON with a top-level "categories" array was found.`)
    }
  }

  const counts = countMenus(menus)
  return {
    menus,
    imageAssets,
    assetMappings: new Map(),
    errors,
    warnings,
    signature: files.length ? hash.digest("hex") : "",
    preview: {
      ...counts,
      imagesMatched,
      imagesMissing,
      errors,
      warnings,
      ready: menus.length > 0,
    },
  }
}

export function resolveMenuImages(menu, jsonPath, entries, archiveId, archiveFilename) {
  const imageAssets = new Map()
  const warnings = []
  let imagesMatched = 0
  let imagesMissing = 0
  const jsonDirectory = path.posix.dirname(jsonPath)

  const resolveOne = (rawUrl, label) => {
    if (!rawUrl) return ""
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl

    if (isAbsoluteArchivePath(rawUrl)) {
      imagesMissing += 1
      warnings.push(`${archiveFilename}: ${label}: absolute image path "${rawUrl}" was ignored.`)
      return ""
    }

    const resolvedPath = path.posix.normalize(path.posix.join(jsonDirectory, rawUrl.replaceAll("\\", "/")))
    if (resolvedPath === ".." || resolvedPath.startsWith("../")) {
      imagesMissing += 1
      warnings.push(`${archiveFilename}: ${label}: image path "${rawUrl}" escapes the ZIP root and was ignored.`)
      return ""
    }

    const entry = entries.get(resolvedPath)
    if (!entry || entry.kind !== "image") {
      imagesMissing += 1
      warnings.push(`${archiveFilename}: ${label}: image file "${resolvedPath}" was not found.`)
      return ""
    }

    imagesMatched += 1
    const assetUrl = `zip-asset://${archiveId}/${encodeURIComponent(resolvedPath)}`
    imageAssets.set(assetUrl, {
      bytes: entry.bytes,
      contentType: entry.contentType,
      filename: path.posix.basename(resolvedPath),
    })
    return assetUrl
  }

  const categories = menu.categories.map((category) => ({
    ...category,
    image_url: resolveOne(category.image_url, `category "${category.name}" > field "image_url"`),
    items: category.items.map((item) => ({
      ...item,
      image_url: resolveOne(
        item.image_url,
        `category "${category.name}" > item "${item.name}" > field "image_url"`,
      ),
    })),
  }))

  return {
    menu: { ...menu, categories },
    imageAssets,
    warnings,
    imagesMatched,
    imagesMissing,
  }
}

export function detectImageMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp"
  }
  const prefix = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("utf8").replace(/^\uFEFF/, "").trimStart()
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(prefix)) return "image/svg+xml"
  return ""
}

async function extractZip(bytes, options) {
  const maxEntryBytes = options.maxEntryBytes ?? MAX_MENU_ZIP_ENTRY_BYTES
  const maxExtractedBytes = options.maxExtractedBytes ?? MAX_MENU_ZIP_EXTRACTED_BYTES
  const maxFiles = options.maxFiles ?? MAX_MENU_ZIP_FILES
  const zip = await openZip(bytes)
  const entries = new Map()
  let fileCount = 0
  let extractedBytes = 0

  try {
    while (true) {
      const entry = await nextEntry(zip)
      if (!entry) break
      const entryPath = validateEntryPath(entry.fileName)
      fileCount += 1
      if (fileCount > maxFiles) throw new Error(`ZIP contains more than ${maxFiles} entries`)
      if (entryPath.endsWith("/")) continue
      if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new Error(`encrypted ZIP entry "${entryPath}" is not supported`)

      if (entry.uncompressedSize > maxEntryBytes) {
        throw new Error(`entry "${entryPath}" exceeds the ${formatBytes(maxEntryBytes)} file limit`)
      }
      extractedBytes += entry.uncompressedSize
      if (extractedBytes > maxExtractedBytes) {
        throw new Error(`ZIP expands beyond the ${formatBytes(maxExtractedBytes)} total limit`)
      }

      const extension = path.posix.extname(entryPath).toLowerCase()
      const kind = extension === ".json" ? "json" : imageExtensions.has(extension) ? "image" : ""
      if (!kind) throw new Error(`unsupported ZIP entry "${entryPath}"; only JSON and supported images are allowed`)
      if (entries.has(entryPath)) throw new Error(`ZIP contains duplicate entry "${entryPath}"`)

      const entryBytes = await readEntry(zip, entry, maxEntryBytes)
      if (entryBytes.length !== entry.uncompressedSize) throw new Error(`entry "${entryPath}" has an invalid extracted size`)

      if (kind === "image") {
        const contentType = detectImageMime(entryBytes)
        if (!contentType || !mimeMatchesExtension(contentType, extension)) {
          throw new Error(`entry "${entryPath}" is not a valid ${extension.slice(1).toUpperCase()} image`)
        }
        entries.set(entryPath, { kind, bytes: entryBytes, contentType })
      } else {
        entries.set(entryPath, { kind, bytes: entryBytes })
      }
    }
  } finally {
    zip.close()
  }

  return { entries, digest: createHash("sha256").update(bytes).digest() }
}

function openZip(bytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    }, (error, zip) => error ? reject(new Error(`invalid ZIP: ${error.message}`)) : resolve(zip))
  })
}

function nextEntry(zip) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      zip.removeListener("entry", onEntry)
      zip.removeListener("end", onEnd)
      zip.removeListener("error", onError)
    }
    const onEntry = (entry) => { cleanup(); resolve(entry) }
    const onEnd = () => { cleanup(); resolve(null) }
    const onError = (error) => { cleanup(); reject(error) }
    zip.once("entry", onEntry)
    zip.once("end", onEnd)
    zip.once("error", onError)
    zip.readEntry()
  })
}

function readEntry(zip, entry, maxBytes) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) { reject(error); return }
      const chunks = []
      let size = 0
      stream.on("data", (chunk) => {
        size += chunk.length
        if (size > maxBytes) stream.destroy(new Error("extracted entry exceeds its size limit"))
        else chunks.push(chunk)
      })
      stream.once("error", reject)
      stream.once("end", () => resolve(Buffer.concat(chunks, size)))
    })
  })
}

function validateEntryPath(rawPath) {
  const normalizedSlashes = rawPath.replaceAll("\\", "/")
  if (isAbsoluteArchivePath(normalizedSlashes)) throw new Error(`absolute ZIP path "${rawPath}" is not allowed`)
  const segments = normalizedSlashes.split("/")
  if (segments.includes("..")) throw new Error(`ZIP path traversal in "${rawPath}" is not allowed`)
  const normalized = path.posix.normalize(normalizedSlashes)
  if (!normalized || normalized === ".") throw new Error("ZIP contains an invalid empty path")
  return normalized
}

function isAbsoluteArchivePath(value) {
  return value.startsWith("/") || value.startsWith("\\") || /^[a-z]:[\\/]/i.test(value)
}

function mimeMatchesExtension(mime, extension) {
  if (mime === "image/jpeg") return extension === ".jpg" || extension === ".jpeg"
  if (mime === "image/png") return extension === ".png"
  if (mime === "image/webp") return extension === ".webp"
  if (mime === "image/svg+xml") return extension === ".svg"
  return false
}

function countMenus(menus) {
  let categories = 0
  let items = 0
  let addons = 0
  for (const menu of menus) {
    categories += menu.categories.length
    for (const category of menu.categories) {
      items += category.items.length
      for (const item of category.items) addons += item.addons.length
    }
  }
  return { categories, items, addons }
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))} MB`
    : `${Math.round(bytes / 1024)} KB`
}
