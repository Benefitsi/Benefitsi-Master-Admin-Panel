"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireAdmin } from "@/lib/admin"

export type PartnerActionState = {
  message: string
  ok: boolean
}

type UploadedStoragePath = {
  bucket: string
  path: string
}

type PartnerMediaFormValues = {
  logoFile: File | null
  featureFile: File | null
  coverFiles: File[]
  existingLogoUrl: string
  existingFeatureCardUrl: string
  existingCoverUrls: string[]
  removedMediaUrls: string[]
}

type ParsedDeal = {
  partner_id: string
  type: string
  discount_type: string
  discount_value: number | null
  premium_only: boolean
  active: boolean
  happy_hour_start: string
  happy_hour_end: string
  trigger_value: number | null
  expiry_days: number | null
  twoforone_usage_limit: number | null
  twoforone_trial_limit: number | null
  reward_item: string
  benefit_count: number | null
  estimated_savings: number | null
  created_at?: string
  updated_at?: string
}

const MAX_COVERS = 5
const MAX_PARTNER_MEDIA_BYTES = 10 * 1024 * 1024
const ALLOWED_PARTNER_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
])
const PARTNER_MEDIA_BUCKET =
  process.env.SUPABASE_PARTNER_MEDIA_BUCKET ?? "partner-assets"
const UPLOAD_PLACEHOLDER_PATH = "/upload-image.jpg"

export async function savePartner(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const isUpdate = Boolean(id)
  const partnerId = id || randomUUID()
  const mediaValues = collectPartnerMedia(formData)
  const validationError = validatePartnerForm(formData, mediaValues)

  if (validationError) {
    return { ok: false, message: validationError }
  }

  const uploadedPaths: UploadedStoragePath[] = []

  try {
    const basePayload = parsePartnerPayload(formData, isUpdate)
    const media = await resolvePartnerMedia(
      supabase,
      mediaValues,
      partnerId,
      basePayload.slug,
    )

    uploadedPaths.push(...media.uploadedPaths)

    const payload = {
      ...basePayload,
      logo_url: media.logoUrl,
      feature_card_url: media.featureCardUrl,
      cover_urls: media.coverUrls,
    }

    const result = isUpdate
      ? await supabase.from("partners").update(payload).eq("id", id).select("id")
      : await supabase
          .from("partners")
          .insert({ id: partnerId, ...payload })
          .select("id")

    if (result.error) {
      await cleanupUploadedFiles(supabase, uploadedPaths)
      return { ok: false, message: result.error.message }
    }

    await cleanupPublicMediaUrls(supabase, [
      ...mediaValues.removedMediaUrls,
      ...(mediaValues.logoFile && mediaValues.existingLogoUrl
        ? [mediaValues.existingLogoUrl]
        : []),
      ...(mediaValues.featureFile && mediaValues.existingFeatureCardUrl
        ? [mediaValues.existingFeatureCardUrl]
        : []),
    ])

    const warnings: string[] = []
    const ownerWarning = await markOwnerAsPartner(supabase, payload.owner_id)

    if (ownerWarning) {
      warnings.push(ownerWarning)
    }

    if (!isUpdate) {
      const initialDeals = parseInitialDeals(formData, partnerId)
      const duplicateDealType = findDuplicateDealType(initialDeals)

      if (duplicateDealType) {
        warnings.push(
          `Partner was created, but initial deals were skipped because "${duplicateDealType}" was added twice.`,
        )
      } else if (initialDeals.length > 0) {
        const dealResult = await supabase.from("deals").insert(initialDeals)

        if (dealResult.error) {
          warnings.push(
            `Partner was created, but deals could not be added: ${dealResult.error.message}`,
          )
        }
      }
    }

    revalidatePath("/")

    return {
      ok: true,
      message: [
        isUpdate ? "Partner updated." : "Partner created.",
        ...warnings,
      ].join(" "),
    }
  } catch (error) {
    await cleanupUploadedFiles(supabase, uploadedPaths)

    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save the partner.",
    }
  }
}

export async function deletePartner(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Partner id is required." }
  }

  const dealsResult = await supabase.from("deals").delete().eq("partner_id", id)

  if (dealsResult.error) {
    return { ok: false, message: dealsResult.error.message }
  }

  const partnerResult = await supabase.from("partners").delete().eq("id", id)

  if (partnerResult.error) {
    return { ok: false, message: partnerResult.error.message }
  }

  revalidatePath("/")

  return { ok: true, message: "Partner and attached deals removed." }
}

export async function saveDeal(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const now = new Date().toISOString()
  const payload = parseDealPayload(formData, "", stringValue(formData, "partner_id"))

  if (!payload.partner_id) {
    return { ok: false, message: "A deal must be attached to a partner." }
  }

  if (!payload.type) {
    return { ok: false, message: "Deal type is required." }
  }

  const duplicateMessage = await validateUniqueDealType(
    supabase,
    payload.partner_id,
    payload.type,
    id,
  )

  if (duplicateMessage) {
    return { ok: false, message: duplicateMessage }
  }

  const mutationPayload = {
    ...payload,
    updated_at: now,
    ...(id ? {} : { created_at: now }),
  }
  const result = id
    ? await supabase.from("deals").update(mutationPayload).eq("id", id)
    : await supabase.from("deals").insert(mutationPayload)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")

  return {
    ok: true,
    message: id ? "Deal updated." : "Deal added.",
  }
}

export async function deleteDeal(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Deal id is required." }
  }

  const result = await supabase.from("deals").delete().eq("id", id)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")

  return { ok: true, message: "Deal removed." }
}

function validatePartnerForm(
  formData: FormData,
  mediaValues: PartnerMediaFormValues,
) {
  const requiredFields = [
    ["name", "Partner name is required."],
    ["city_id", "Partner city is required."],
    ["owner_id", "Partner owner is required."],
    ["type", "Partner type is required."],
    ["email", "Email is required."],
    ["address", "Address is required."],
    ["coordinates", "Coordinates are required."],
    ["description", "Description is required."],
    ["stamp_target", "Stamp target is required."],
    ["reward_text_primary", "Stamp reward 1 is required."],
    ["reward_text_secondary", "Stamp reward 2 is required."],
  ]

  for (const [key, message] of requiredFields) {
    if (!stringValue(formData, key)) {
      return message
    }
  }

  if (listValue(formData, "category").length === 0) {
    return "Please select at least one category."
  }

  if (!parseCoordinates(stringValue(formData, "coordinates"))) {
    return "Coordinates must use the format latitude, longitude."
  }

  if (integerValue(formData, "stamp_target") === null) {
    return "Stamp target must be a number."
  }

  if (
    mediaValues.existingCoverUrls.length + mediaValues.coverFiles.length >
    MAX_COVERS
  ) {
    return `A partner can have at most ${MAX_COVERS} cover pictures.`
  }

  const mediaError = validatePartnerMediaFiles(mediaValues)

  if (mediaError) {
    return mediaError
  }

  return null
}

function parsePartnerPayload(formData: FormData, isUpdate: boolean) {
  const now = new Date().toISOString()
  const name = stringValue(formData, "name")
  const coordinates = parseCoordinates(stringValue(formData, "coordinates"))
  const slug =
    stringValue(formData, "existing_slug") ||
    slugify(name) ||
    randomUUID()
  const subdomain = stringValue(formData, "existing_subdomain") || slug
  const active = checkboxValue(formData, "active")
  const existingPin = integerValue(formData, "existing_pin")

  return {
    owner_id: stringValue(formData, "owner_id"),
    city_id: stringValue(formData, "city_id"),
    name,
    slug,
    subdomain,
    short_name: stringValue(formData, "short_name") || createShortName(name),
    description: stringValue(formData, "description"),
    category: listValue(formData, "category"),
    type: stringValue(formData, "type"),
    status: active ? "active" : "inactive",
    is_featured: checkboxValue(formData, "is_featured"),
    is_restaurant: checkboxValue(formData, "is_restaurant"),
    loves: isUpdate ? integerValue(formData, "existing_loves") ?? 0 : 0,
    stamp_target: integerValue(formData, "stamp_target"),
    reward_text_primary: stringValue(formData, "reward_text_primary"),
    reward_text_secondary: stringValue(formData, "reward_text_secondary"),
    pin: isUpdate && existingPin ? existingPin : randomFourDigitPin(),
    address: stringValue(formData, "address"),
    phone: stringValue(formData, "phone"),
    website: stringValue(formData, "website"),
    coordinates: coordinates ? JSON.stringify(coordinates) : null,
    is_active: active,
    email: stringValue(formData, "email"),
    updated_at: now,
    ...(isUpdate ? {} : { created_at: now }),
  }
}

async function resolvePartnerMedia(
  supabase: SupabaseClient,
  mediaValues: PartnerMediaFormValues,
  partnerId: string,
  slug: string,
) {
  const uploadedPaths: UploadedStoragePath[] = []
  let logoUrl = mediaValues.existingLogoUrl
  let featureCardUrl = mediaValues.existingFeatureCardUrl
  const coverUrls = [...mediaValues.existingCoverUrls]

  if (mediaValues.logoFile) {
    const uploaded = await uploadPartnerFile(
      supabase,
      mediaValues.logoFile,
      `${partnerId}/logo-${Date.now()}-${safeFileName(mediaValues.logoFile.name)}`,
    )

    logoUrl = uploaded.url
    uploadedPaths.push(uploaded)
  } else if (mediaValues.removedMediaUrls.includes(logoUrl)) {
    logoUrl = ""
  }

  if (mediaValues.featureFile) {
    const uploaded = await uploadPartnerFile(
      supabase,
      mediaValues.featureFile,
      `${partnerId}/feature-${Date.now()}-${safeFileName(mediaValues.featureFile.name)}`,
    )

    featureCardUrl = uploaded.url
    uploadedPaths.push(uploaded)
  } else if (mediaValues.removedMediaUrls.includes(featureCardUrl)) {
    featureCardUrl = ""
  }

  for (const [index, coverFile] of mediaValues.coverFiles.entries()) {
    const uploaded = await uploadPartnerFile(
      supabase,
      coverFile,
      `${partnerId}/covers/${slug}-${Date.now()}-${index}-${safeFileName(
        coverFile.name,
      )}`,
    )

    coverUrls.push(uploaded.url)
    uploadedPaths.push(uploaded)
  }

  return {
    logoUrl,
    featureCardUrl,
    coverUrls: coverUrls.slice(0, MAX_COVERS),
    uploadedPaths,
  }
}

async function uploadPartnerFile(
  supabase: SupabaseClient,
  file: File,
  path: string,
) {
  const { data, error } = await supabase.storage
    .from(PARTNER_MEDIA_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: partnerMediaContentType(file) ?? "application/octet-stream",
      upsert: false,
    })

  if (error) {
    throw new Error(
      `Unable to upload "${file.name}" to Supabase Storage bucket "${PARTNER_MEDIA_BUCKET}": ${error.message}`,
    )
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PARTNER_MEDIA_BUCKET).getPublicUrl(data.path)

  return {
    bucket: PARTNER_MEDIA_BUCKET,
    path: data.path,
    url: publicUrl,
  }
}

async function cleanupUploadedFiles(
  supabase: SupabaseClient,
  uploadedPaths: UploadedStoragePath[],
) {
  for (const { bucket, path } of uploadedPaths) {
    await supabase.storage.from(bucket).remove([path])
  }
}

async function cleanupPublicMediaUrls(supabase: SupabaseClient, urls: string[]) {
  const pathsByBucket = new Map<string, string[]>()

  for (const url of urls) {
    const storagePath = parsePublicStorageUrl(url)

    if (!storagePath) {
      continue
    }

    pathsByBucket.set(storagePath.bucket, [
      ...(pathsByBucket.get(storagePath.bucket) ?? []),
      storagePath.path,
    ])
  }

  for (const [bucket, paths] of pathsByBucket) {
    await supabase.storage.from(bucket).remove(paths)
  }
}

function parsePublicStorageUrl(url: string): UploadedStoragePath | null {
  try {
    const parsedUrl = new URL(url)
    const marker = "/storage/v1/object/public/"
    const markerIndex = parsedUrl.pathname.indexOf(marker)

    if (markerIndex === -1) {
      return null
    }

    const [bucket, ...pathParts] = parsedUrl.pathname
      .slice(markerIndex + marker.length)
      .split("/")

    if (!bucket || pathParts.length === 0) {
      return null
    }

    return {
      bucket,
      path: decodeURIComponent(pathParts.join("/")),
    }
  } catch {
    return null
  }
}

async function markOwnerAsPartner(supabase: SupabaseClient, ownerId: string) {
  if (!ownerId) {
    return null
  }

  const byId = await supabase
    .from("users")
    .update({ is_partner: true })
    .eq("id", ownerId)

  if (!byId.error) {
    return null
  }

  const message = byId.error.message.toLowerCase()

  if (message.includes("column") || message.includes("schema cache")) {
    return `Owner was selected, but the users table could not be marked as partner: ${byId.error.message}`
  }

  const byUid = await supabase
    .from("users")
    .update({ is_partner: true })
    .eq("uid", ownerId)

  if (!byUid.error) {
    return null
  }

  return `Owner was selected, but could not be marked as partner: ${byUid.error.message}`
}

function parseInitialDeals(formData: FormData, partnerId: string): ParsedDeal[] {
  const count = integerValue(formData, "initial_deal_count") ?? 0
  const deals: ParsedDeal[] = []
  const now = new Date().toISOString()

  for (let index = 0; index < count; index += 1) {
    const prefix = `initial_deal_${index}_`
    const deal = parseDealPayload(formData, prefix, partnerId)

    if (!deal.type) {
      continue
    }

    deals.push({
      ...deal,
      created_at: now,
      updated_at: now,
    })
  }

  return deals
}

function parseDealPayload(
  formData: FormData,
  prefix = "",
  partnerId = stringValue(formData, `${prefix}partner_id`),
): ParsedDeal {
  return {
    partner_id: partnerId,
    type: stringValue(formData, `${prefix}type`),
    discount_type: stringValue(formData, `${prefix}discount_type`),
    discount_value: integerValue(formData, `${prefix}discount_value`),
    premium_only: checkboxValue(formData, `${prefix}premium_only`),
    active: checkboxValue(formData, `${prefix}active`),
    happy_hour_start: stringValue(formData, `${prefix}happy_hour_start`),
    happy_hour_end: stringValue(formData, `${prefix}happy_hour_end`),
    trigger_value: integerValue(formData, `${prefix}trigger_value`),
    expiry_days: integerValue(formData, `${prefix}expiry_days`),
    twoforone_usage_limit: integerValue(
      formData,
      `${prefix}twoforone_usage_limit`,
    ),
    twoforone_trial_limit: integerValue(
      formData,
      `${prefix}twoforone_trial_limit`,
    ),
    reward_item: stringValue(formData, `${prefix}reward_item`),
    benefit_count: integerValue(formData, `${prefix}benefit_count`),
    estimated_savings: numberValue(formData, `${prefix}estimated_savings`),
  }
}

async function validateUniqueDealType(
  supabase: SupabaseClient,
  partnerId: string,
  type: string,
  currentDealId: string,
) {
  let query = supabase
    .from("deals")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("type", type)
    .limit(1)

  if (currentDealId) {
    query = query.neq("id", currentDealId)
  }

  const result = await query

  if (result.error) {
    return result.error.message
  }

  if ((result.data ?? []).length > 0) {
    return "This partner already has a deal with that type."
  }

  return null
}

function findDuplicateDealType(deals: ParsedDeal[]) {
  const seen = new Set<string>()

  for (const deal of deals) {
    const normalized = deal.type.trim().toLowerCase()

    if (!normalized) {
      continue
    }

    if (seen.has(normalized)) {
      return deal.type
    }

    seen.add(normalized)
  }

  return null
}

function collectPartnerMedia(formData: FormData): PartnerMediaFormValues {
  return {
    logoFile: fileValue(formData, "logo_file"),
    featureFile: fileValue(formData, "feature_card_file"),
    coverFiles: fileValues(formData, "cover_files"),
    existingLogoUrl: stringValue(formData, "existing_logo_url"),
    existingFeatureCardUrl: stringValue(formData, "existing_feature_card_url"),
    existingCoverUrls: coverValues(formData),
    removedMediaUrls: stringListValue(formData, "removed_media_urls"),
  }
}

function fileValue(formData: FormData, key: string) {
  const value = formData.get(key)

  return value instanceof File && value.size > 0 ? value : null
}

function fileValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is File => value instanceof File && value.size > 0)
}

function coverValues(formData: FormData) {
  return formData
    .getAll("existing_cover_urls")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value && !isUploadPlaceholderUrl(value))
    .slice(0, MAX_COVERS)
}

function isUploadPlaceholderUrl(value: string) {
  try {
    return (
      new URL(value, "https://benefitsi.local").pathname ===
      UPLOAD_PLACEHOLDER_PATH
    )
  } catch {
    return value === UPLOAD_PLACEHOLDER_PATH || value === "upload-image.jpg"
  }
}

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key)

  return typeof value === "string" ? value.trim() : ""
}

function integerValue(formData: FormData, key: string) {
  const value = stringValue(formData, key)

  if (!value) {
    return null
  }

  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? number : null
}

function numberValue(formData: FormData, key: string) {
  const value = stringValue(formData, key)

  if (!value) {
    return null
  }

  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : null
}

function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on"
}

function listValue(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .filter(Boolean)
    .map((item) => item.trim())
    .filter(Boolean)
}

function stringListValue(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value && !isUploadPlaceholderUrl(value))
}

function validatePartnerMediaFiles(mediaValues: PartnerMediaFormValues) {
  const files = [
    mediaValues.logoFile,
    mediaValues.featureFile,
    ...mediaValues.coverFiles,
  ].filter((file): file is File => Boolean(file))

  for (const file of files) {
    const contentType = partnerMediaContentType(file)

    if (!contentType || !ALLOWED_PARTNER_MEDIA_TYPES.has(contentType)) {
      return `"${file.name}" must be a PNG, JPEG, WebP, or SVG image.`
    }

    if (file.size > MAX_PARTNER_MEDIA_BYTES) {
      return `"${file.name}" must be 10 MB or smaller.`
    }
  }

  return null
}

function partnerMediaContentType(file: File) {
  if (ALLOWED_PARTNER_MEDIA_TYPES.has(file.type)) {
    return file.type
  }

  if (file.type) {
    return null
  }

  const extension = file.name.split(".").pop()?.toLowerCase()

  switch (extension) {
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "svg":
      return "image/svg+xml"
    default:
      return null
  }
}

function parseCoordinates(value: string) {
  const [latitude, longitude] = value
    .split(",")
    .map((part) => Number.parseFloat(part.trim()))

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null
  }

  return { latitude, longitude }
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function createShortName(name: string) {
  const firstNamePart = name.split(/[,-]/)[0]?.trim()

  return (firstNamePart || name).slice(0, 32)
}

function randomFourDigitPin() {
  return Math.floor(1000 + Math.random() * 9000)
}

function safeFileName(name: string) {
  const extension = name.includes(".") ? name.split(".").pop() : ""
  const baseName = name.replace(/\.[^.]+$/, "")
  const safeBaseName = slugify(baseName) || "image"

  return extension ? `${safeBaseName}.${extension.toLowerCase()}` : safeBaseName
}
