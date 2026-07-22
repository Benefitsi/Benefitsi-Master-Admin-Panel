import dns from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import net from "node:net"

export const MAX_MENU_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
])

export async function readMenuImportFiles(files, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_MENU_IMPORT_BYTES
  const menus = []
  const assetMappings = new Map()
  const errors = []

  for (const file of files) {
    const filename = file.name || "unnamed.json"
    if (file.size > maxBytes) {
      errors.push(`${filename}: file must be ${formatBytes(maxBytes)} or smaller.`)
      continue
    }

    let value
    try {
      value = JSON.parse(await file.text())
    } catch {
      errors.push(`${filename}: malformed JSON.`)
      continue
    }

    if (isRecord(value) && Array.isArray(value.categories)) {
      try {
        menus.push(validateMenuDocument(value, filename))
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${filename}: invalid menu JSON.`)
      }
      continue
    }

    if (isAssetManifest(value)) {
      const mappings = extractAssetMappings(value)
      for (const [key, url] of mappings) assetMappings.set(key, url)
      continue
    }

    errors.push(
      `${filename}: unsupported JSON structure; expected a top-level "categories" array or an asset manifest with image mappings.`,
    )
  }

  return { menus, assetMappings, errors }
}

export function validateMenuDocument(value, filename = "menu.json") {
  const errors = []
  const categories = []

  if (!isRecord(value) || !Array.isArray(value.categories)) {
    throw new Error(`${filename}: field "categories" must be an array.`)
  }

  value.categories.forEach((rawCategory, categoryIndex) => {
    const categoryPosition = `category ${categoryIndex + 1}`
    if (!isRecord(rawCategory)) {
      errors.push(`${filename}: ${categoryPosition} > field "category": must be an object.`)
      return
    }

    const categoryName = requiredString(
      rawCategory.name,
      `${filename}: ${categoryPosition} > field "name"`,
      errors,
    )
    const categoryLabel = categoryName ? `category "${categoryName}"` : categoryPosition
    const imageUrl = optionalString(
      rawCategory.image_url,
      `${filename}: ${categoryLabel} > field "image_url"`,
      errors,
    )

    if (!Array.isArray(rawCategory.items)) {
      errors.push(`${filename}: ${categoryLabel} > field "items": must be a non-empty array.`)
      return
    }
    if (rawCategory.items.length === 0) {
      errors.push(`${filename}: ${categoryLabel} > field "items": empty categories are not imported.`)
      return
    }

    const items = []
    rawCategory.items.forEach((rawItem, itemIndex) => {
      const itemPosition = `item ${itemIndex + 1}`
      if (!isRecord(rawItem)) {
        errors.push(`${filename}: ${categoryLabel} > ${itemPosition} > field "item": must be an object.`)
        return
      }

      const itemName = requiredString(
        rawItem.name,
        `${filename}: ${categoryLabel} > ${itemPosition} > field "name"`,
        errors,
      )
      const itemLabel = itemName ? `item "${itemName}"` : itemPosition
      const price = requiredNonNegativeNumber(
        rawItem.price,
        `${filename}: ${categoryLabel} > ${itemLabel} > field "price"`,
        errors,
      )
      const description = optionalString(
        rawItem.description,
        `${filename}: ${categoryLabel} > ${itemLabel} > field "description"`,
        errors,
      )
      const itemImageUrl = optionalString(
        rawItem.image_url,
        `${filename}: ${categoryLabel} > ${itemLabel} > field "image_url"`,
        errors,
      )
      const currency = optionalString(
        rawItem.currency,
        `${filename}: ${categoryLabel} > ${itemLabel} > field "currency"`,
        errors,
      ) || "EUR"
      const tags = optionalStringArray(
        rawItem.tags,
        `${filename}: ${categoryLabel} > ${itemLabel} > field "tags"`,
        errors,
      )
      const allergens = optionalStringArray(
        rawItem.allergens,
        `${filename}: ${categoryLabel} > ${itemLabel} > field "allergens"`,
        errors,
      )
      const addons = validateAddons(rawItem.addons, filename, categoryLabel, itemLabel, errors)

      if (rawItem.is_popular !== undefined && typeof rawItem.is_popular !== "boolean") {
        errors.push(`${filename}: ${categoryLabel} > ${itemLabel} > field "is_popular": must be true or false.`)
      }

      items.push({
        name: itemName,
        description,
        price,
        currency,
        image_url: itemImageUrl,
        tags,
        allergens,
        addons,
        is_popular: rawItem.is_popular === true,
      })
    })

    categories.push({ name: categoryName, image_url: imageUrl, items })
  })

  if (value.categories.length === 0) {
    errors.push(`${filename}: field "categories": menu must contain at least one category.`)
  }

  if (errors.length) throw new Error(errors.join("\n"))

  return { filename, categories }
}

export function isAssetManifest(value) {
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((entry) => isRecord(entry))
  }
  if (!isRecord(value) || Array.isArray(value.categories)) return false
  if (["assets", "images", "mappings", "files", "image_mappings", "asset_mappings"].some((key) => key in value)) return true
  return [...Object.entries(value)].some(([key, entry]) =>
    findRemoteUrl(key, entry),
  )
}

export function extractAssetMappings(value) {
  const mappings = new Map()
  if (Array.isArray(value)) {
    collectManifestMappings(value, mappings)
    return mappings
  }
  if (!isRecord(value)) return mappings

  const containers = [
    value.assets,
    value.images,
    value.mappings,
    value.files,
    value.image_mappings,
    value.asset_mappings,
  ]
    .filter((entry) => entry !== undefined)
  const sources = containers.length ? containers : [value]

  for (const source of sources) collectManifestMappings(source, mappings)
  return mappings
}

export function prepareMissingAddonsRetry(rows, errorMessage) {
  const missingAddons =
    /Could not find the 'addons' column/i.test(errorMessage || "") ||
    /column "addons" of relation "[^"]+" does not exist/i.test(errorMessage || "")

  if (!missingAddons) return null
  return {
    skippedAddons: rows.reduce(
      (total, row) => total + (Array.isArray(row.addons) ? row.addons.length : 0),
      0,
    ),
    rows: rows.map((row) => {
      const retryRow = { ...row }
      delete retryRow.addons
      return retryRow
    }),
  }
}

const importedItemUpdateFields = [
  "description",
  "price",
  "currency",
  "image_url",
  "tags",
  "allergens",
  "is_popular",
  "addons",
]

export function createAddonUpdatePlan(menus, existingCategories, existingItems) {
  const warnings = []
  const updates = []
  const categoriesByName = new Map()
  const plannedItemIds = new Set()

  for (const category of existingCategories) {
    const key = normalizedMatchKey(category.name)
    if (!key) continue
    const matches = categoriesByName.get(key) ?? []
    matches.push(category)
    categoriesByName.set(key, matches)
  }

  for (const menu of menus) {
    for (const category of menu.categories) {
      const categoryMatches = categoriesByName.get(normalizedMatchKey(category.name)) ?? []
      if (categoryMatches.length !== 1) {
        if (category.items.some((item) => item.addons.length > 0)) {
          warnings.push(
            `${menu.filename}: category "${category.name}" could not be matched uniquely; its add-ons were not changed.`,
          )
        }
        continue
      }

      const categoryId = categoryMatches[0].id
      const itemsByName = new Map()
      for (const item of existingItems.filter((item) => item.category_id === categoryId)) {
        const key = normalizedMatchKey(item.name)
        if (!key) continue
        const matches = itemsByName.get(key) ?? []
        matches.push(item)
        itemsByName.set(key, matches)
      }

      for (const item of category.items) {
        const itemMatches = itemsByName.get(normalizedMatchKey(item.name)) ?? []
        if (itemMatches.length !== 1) {
          warnings.push(
            `${menu.filename}: category "${category.name}" > item "${item.name}" could not be matched uniquely; it was not changed.`,
          )
          continue
        }

        const existingItem = itemMatches[0]
        if (plannedItemIds.has(existingItem.id)) {
          warnings.push(
            `${menu.filename}: category "${category.name}" > item "${item.name}" appears more than once in this import; the duplicate was not applied.`,
          )
          continue
        }

        const values = importedItemValues(item)
        const changedFields = importedItemUpdateFields.filter(
          (field) => !sameImportedValue(field, existingItem[field], values[field]),
        )
        if (!changedFields.length) continue

        plannedItemIds.add(existingItem.id)
        updates.push({
          itemId: existingItem.id,
          values,
          changedFields,
          addonChanges: countAddonChanges(existingItem.addons, values.addons),
          filename: menu.filename,
          category: category.name,
          item: item.name,
        })
      }
    }
  }

  return { updates, warnings }
}

export async function applyMenuItemUpdatePlan(supabase, plan, options = {}) {
  const results = []
  const updateBatchSize = options.batchSize ?? 6

  for (let index = 0; index < plan.updates.length; index += updateBatchSize) {
    const batch = plan.updates.slice(index, index + updateBatchSize)
    results.push(
      ...(await Promise.all(
        batch.map(async (update) => ({
          update,
          result: await supabase
            .from("menu_items")
            .update({
              ...Object.fromEntries(
                update.changedFields.map((field) => [field, update.values[field]]),
              ),
              updated_at: new Date().toISOString(),
            })
            .eq("id", update.itemId),
        })),
      )),
    )
  }

  const successfulUpdates = results
    .filter(({ result }) => !result.error)
    .map(({ update }) => update)
  const addonChanges = successfulUpdates.reduce(
    (totals, update) => ({
      created: totals.created + update.addonChanges.created,
      updated: totals.updated + update.addonChanges.updated,
      removed: totals.removed + update.addonChanges.removed,
    }),
    { created: 0, updated: 0, removed: 0 },
  )

  return {
    successfulUpdates,
    addonChanges,
    failures: results
      .filter(({ result }) => result.error)
      .map(({ update, result }) =>
        `${update.filename}: category "${update.category}" > item "${update.item}": ${result.error?.message ?? "item could not be updated"}.`,
      ),
  }
}

export async function copyMenuImages(menu, assetMappings, copyImage, options = {}) {
  const tasks = []
  const categoryImageIndexes = []
  const itemImageIndexes = []

  for (const [categoryIndex, category] of menu.categories.entries()) {
    const categoryLabel = `category "${category.name}"`
    categoryImageIndexes[categoryIndex] = tasks.length
    tasks.push({
      value: category.image_url,
      context: { filename: menu.filename, category: category.name, categoryIndex, kind: "category" },
      label: `${menu.filename}: ${categoryLabel} > field "image_url"`,
    })
    itemImageIndexes[categoryIndex] = []

    for (const [itemIndex, item] of category.items.entries()) {
      itemImageIndexes[categoryIndex][itemIndex] = tasks.length
      tasks.push({
        value: item.image_url,
        context: {
          filename: menu.filename,
          category: category.name,
          categoryIndex,
          item: item.name,
          itemIndex,
          kind: "item",
        },
        label: `${menu.filename}: ${categoryLabel} > item "${item.name}" > field "image_url"`,
      })
    }
  }

  const results = await mapWithConcurrency(
    tasks,
    options.concurrency ?? 4,
    async (task) => {
      const warnings = []
      const imageUrl = await copyOneImage(
        task.value,
        assetMappings,
        copyImage,
        task.context,
        task.label,
        warnings,
      )
      return { imageUrl, warnings }
    },
  )
  const categories = menu.categories.map((category, categoryIndex) => ({
    ...category,
    image_url: results[categoryImageIndexes[categoryIndex]].imageUrl,
    items: category.items.map((item, itemIndex) => ({
      ...item,
      image_url: results[itemImageIndexes[categoryIndex][itemIndex]].imageUrl,
    })),
  }))

  return {
    menu: { ...menu, categories },
    warnings: results.flatMap((result) => result.warnings),
  }
}

export async function runMenuImportBatch(prepared, handlers) {
  const errors = [...prepared.errors]
  const warnings = [...(prepared.warnings ?? [])]
  const successes = []
  let replacePending = handlers.mode === "replace"

  for (const menu of prepared.menus) {
    const copied = await copyMenuImages(menu, prepared.assetMappings, handlers.copyImage)
    warnings.push(...copied.warnings)

    try {
      const mode = replacePending ? "replace" : "append"
      const result = await handlers.saveMenu(copied.menu, mode)
      warnings.push(...(result.warnings ?? []))
      successes.push({ filename: menu.filename, ...result })
      replacePending = false
    } catch (error) {
      errors.push(
        `${menu.filename}: import failed: ${error instanceof Error ? error.message : "unknown database error"}.`,
      )
    }
  }

  return { successes, errors, warnings }
}

export async function downloadRemoteImage(rawUrl, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_REMOTE_IMAGE_BYTES
  const lookup = options.lookup ?? dns.lookup
  let currentUrl = rawUrl

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const url = await assertPublicHttpUrl(currentUrl, lookup)
    const response = await requestUrl(url, lookup, maxBytes)

    if (response.redirect) {
      currentUrl = new URL(response.redirect, url).toString()
      continue
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`image download returned HTTP ${response.statusCode}`)
    }
    if (!allowedImageTypes.has(response.contentType)) {
      throw new Error(`image response has unsupported content type "${response.contentType || "unknown"}"`)
    }

    return {
      bytes: response.bytes,
      contentType: response.contentType,
      filename: safeRemoteFileName(url, response.contentType),
    }
  }

  throw new Error("image download followed too many redirects")
}

export async function assertPublicHttpUrl(rawUrl, lookup = dns.lookup) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error("image URL is invalid")
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("image URL must be public HTTP or HTTPS")
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("image URL cannot target localhost")
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("image URL cannot target a private IP address")
    return url
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("image URL resolved to a private or unavailable address")
  }
  return url
}

function validateAddons(value, filename, categoryLabel, itemLabel, errors) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    errors.push(`${filename}: ${categoryLabel} > ${itemLabel} > field "addons": must be an array.`)
    return []
  }

  return value.map((addon, addonIndex) => {
    const addonPosition = `add-on ${addonIndex + 1}`
    if (!isRecord(addon)) {
      errors.push(`${filename}: ${categoryLabel} > ${itemLabel} > ${addonPosition} > field "addon": must be an object.`)
      return { title: "", description: "", cost: null }
    }
    const title = requiredString(
      addon.title,
      `${filename}: ${categoryLabel} > ${itemLabel} > ${addonPosition} > field "title"`,
      errors,
    )
    const description = optionalString(
      addon.description,
      `${filename}: ${categoryLabel} > ${itemLabel} > add-on "${title || addonIndex + 1}" > field "description"`,
      errors,
    )
    const cost = requiredNonNegativeNumber(
      addon.cost,
      `${filename}: ${categoryLabel} > ${itemLabel} > add-on "${title || addonIndex + 1}" > field "cost"`,
      errors,
    )
    return { title, description, cost }
  })
}

function requiredString(value, label, errors) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label}: is required and must be a non-empty string.`)
    return ""
  }
  return value.trim()
}

function optionalString(value, label, errors) {
  if (value === undefined || value === null || value === "") return ""
  if (typeof value !== "string") {
    errors.push(`${label}: must be a string when provided.`)
    return ""
  }
  return value.trim()
}

function optionalStringArray(value, label, errors) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    errors.push(`${label}: must be an array of strings.`)
    return []
  }
  return value.map((entry) => entry.trim()).filter(Boolean)
}

function requiredNonNegativeNumber(value, label, errors) {
  if (value === undefined || value === null || value === "") {
    errors.push(`${label}: is required.`)
    return null
  }
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`${label}: must be a valid non-negative number.`)
    return null
  }
  return number
}

async function copyOneImage(value, mappings, copyImage, context, label, warnings) {
  if (!value) return ""
  if (isSupabaseStorageUrl(value)) return value

  const remoteUrl = resolveAssetUrl(value, mappings)
  if (!remoteUrl) {
    warnings.push(`${label}: no remote URL was found in the asset manifest; imported without image.`)
    return ""
  }
  if (isSupabaseStorageUrl(remoteUrl)) return remoteUrl

  try {
    return await copyImage(remoteUrl, context)
  } catch (error) {
    warnings.push(
      `${label}: ${error instanceof Error ? error.message : "image copy failed"}; imported without image.`,
    )
    return ""
  }
}

function resolveAssetUrl(value, mappings) {
  if (value.startsWith("zip-asset://")) return value
  const normalized = normalizeAssetKey(value)
  const mapped = mappings.get(normalized) || mappings.get(normalizeAssetKey(basename(value)))
  if (mapped) return mapped
  return isHttpUrl(value) ? value : ""
}

async function mapWithConcurrency(values, concurrency, mapper) {
  if (!values.length) return []
  const results = new Array(values.length)
  const workerCount = Math.max(1, Math.min(values.length, Math.floor(concurrency) || 1))
  let nextIndex = 0

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(values[index], index)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function collectManifestMappings(source, mappings) {
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!isRecord(entry)) continue
      const remote = firstString(entry, ["source_url", "original_url", "remote_url", "download_url", "source", "original", "remote", "url"])
      const local = firstString(entry, ["local_path", "relative_path", "local_file", "path", "file", "filename", "asset", "image_url"])
      addMapping(mappings, local, remote)
    }
    return
  }
  if (!isRecord(source)) return

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      addMapping(mappings, key, value)
    } else if (isRecord(value)) {
      const remote = firstString(value, ["source_url", "original_url", "remote_url", "download_url", "source", "original", "remote", "url"])
      const local = firstString(value, ["local_path", "relative_path", "local_file", "path", "file", "filename", "asset", "image_url"]) || key
      addMapping(mappings, local, remote)
      if (!remote) collectManifestMappings(value, mappings)
    }
  }
}

function addMapping(mappings, left, right) {
  if (!left || !right) return
  if (isHttpUrl(left) && !isHttpUrl(right)) {
    mappings.set(normalizeAssetKey(right), left)
    mappings.set(normalizeAssetKey(left), left)
  } else if (!isHttpUrl(left) && isHttpUrl(right)) {
    mappings.set(normalizeAssetKey(left), right)
  } else if (isHttpUrl(right)) {
    mappings.set(normalizeAssetKey(left), right)
  }
}

function findRemoteUrl(key, value) {
  if (isHttpUrl(key) || (typeof value === "string" && isHttpUrl(value))) return true
  if (!isRecord(value)) return false
  return Boolean(firstString(value, ["source_url", "original_url", "remote_url", "download_url", "source", "original", "remote", "url"]))
}

function firstString(record, keys) {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim()
  }
  return ""
}

function requestUrl(url, lookup, maxBytes) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http
    const request = transport.get(url, {
      headers: { Accept: "image/*", "User-Agent": "Benefitsi-Menu-Importer/1.0" },
      lookup(hostname, options, callback) {
        lookup(hostname, { all: true, verbatim: true })
          .then((addresses) => {
            if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
              callback(new Error("image host resolved to a private or unavailable address"))
              return
            }
            const selected = addresses[0]
            callback(null, selected.address, selected.family)
          })
          .catch(callback)
      },
    }, (response) => {
      const statusCode = response.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        response.resume()
        resolve({ redirect: response.headers.location || "", statusCode })
        return
      }

      const declaredLength = Number(response.headers["content-length"] || 0)
      if (declaredLength > maxBytes) {
        response.destroy()
        reject(new Error(`image is larger than ${formatBytes(maxBytes)}`))
        return
      }

      const chunks = []
      let received = 0
      response.on("data", (chunk) => {
        received += chunk.length
        if (received > maxBytes) {
          response.destroy(new Error(`image is larger than ${formatBytes(maxBytes)}`))
          return
        }
        chunks.push(chunk)
      })
      response.on("end", () => resolve({
        bytes: Buffer.concat(chunks),
        contentType: String(response.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase(),
        statusCode,
      }))
      response.on("error", reject)
    })
    request.setTimeout(15_000, () => request.destroy(new Error("image download timed out")))
    request.on("error", reject)
  })
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && (b === 18 || b === 19))
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase()
    if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7))
    return normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
  }
  return true
}

function safeRemoteFileName(url, contentType) {
  const fallbackExtension = contentType === "image/jpeg" ? "jpg" :
    contentType === "image/svg+xml" ? "svg" : contentType.split("/")[1] || "img"
  const raw = basename(decodeURIComponent(url.pathname)) || `remote.${fallbackExtension}`
  return raw.replace(/[^a-zA-Z0-9._-]+/g, "-")
}

function normalizeAssetKey(value) {
  return String(value || "").trim().replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase()
}

function basename(value) {
  return String(value || "").split(/[\\/]/).pop() || ""
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim())
}

function isSupabaseStorageUrl(value) {
  return isHttpUrl(value) && value.includes("/storage/v1/object/public/")
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function formatBytes(bytes) {
  return bytes % (1024 * 1024) === 0 ? `${bytes / (1024 * 1024)} MB` : `${bytes} bytes`
}

function normalizedMatchKey(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()
    : ""
}

function importedItemValues(item) {
  return {
    description: item.description || null,
    price: item.price,
    currency: item.currency,
    image_url: item.image_url || null,
    tags: item.tags,
    allergens: item.allergens,
    is_popular: item.is_popular,
    addons: uniqueAddons(item.addons),
  }
}

function uniqueAddons(addons) {
  const unique = new Map()
  for (const addon of Array.isArray(addons) ? addons : []) {
    const key = normalizedMatchKey(addon.title)
    if (key && !unique.has(key)) unique.set(key, addon)
  }
  return [...unique.values()]
}

function sameImportedValue(field, existingValue, importedValue) {
  if (field === "price") return Number(existingValue) === Number(importedValue)
  if (field === "description" || field === "image_url") {
    return (existingValue || null) === importedValue
  }
  if (field === "addons") {
    return JSON.stringify(comparableAddons(existingValue)) === JSON.stringify(comparableAddons(importedValue))
  }
  return JSON.stringify(existingValue ?? []) === JSON.stringify(importedValue ?? [])
}

function comparableAddons(addons) {
  return uniqueAddons(addons).map((addon) => ({
    title: addon.title,
    description: addon.description || "",
    cost: Number(addon.cost),
  }))
}

function countAddonChanges(existingAddons, importedAddons) {
  const existingByName = new Map(
    uniqueAddons(existingAddons).map((addon) => [normalizedMatchKey(addon.title), addon]),
  )
  const importedByName = new Map(
    uniqueAddons(importedAddons).map((addon) => [normalizedMatchKey(addon.title), addon]),
  )
  let created = 0
  let updated = 0
  let removed = 0

  for (const [key, addon] of importedByName) {
    if (!existingByName.has(key)) created += 1
    else if (
      JSON.stringify(comparableAddons([existingByName.get(key)])) !==
      JSON.stringify(comparableAddons([addon]))
    ) updated += 1
  }
  for (const key of existingByName.keys()) {
    if (!importedByName.has(key)) removed += 1
  }

  return { created, updated, removed }
}
