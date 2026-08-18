import { createHash, randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { loadCityMediaLibraryData } from "@/lib/city-media/data"
import {
  isMediaSourceType,
  isMediaStatus,
} from "@/lib/city-media/contracts"
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_FILE_SIZE,
  cleanText,
  hasValidImageSignature,
  imageExtension,
  isSafeSlug,
  nullableText,
  safeFileStem,
  validHttpUrl,
  writeMediaAudit,
} from "@/lib/city-media/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  await requireAdmin()
  return NextResponse.json(await loadCityMediaLibraryData(), {
    headers: { "cache-control": "private, no-store" },
  })
}

export async function POST(request: Request) {
  const { adminSession } = await requireAdmin()
  const formData = await request.formData()
  const citySlug = cleanText(formData.get("citySlug"), 180)
  const file = formData.get("file")

  if (!isSafeSlug(citySlug) || !(file instanceof File)) {
    return NextResponse.json({ error: "city_and_file_required" }, { status: 400 })
  }
  if (!MEDIA_ALLOWED_MIME_TYPES.includes(file.type as (typeof MEDIA_ALLOWED_MIME_TYPES)[number])) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 })
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "file_empty" }, { status: 400 })
  }
  if (file.size > MEDIA_MAX_FILE_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (!hasValidImageSignature(buffer, file.type)) {
    return NextResponse.json({ error: "invalid_image" }, { status: 415 })
  }

  const admin = createAdminClient()
  const cityResult = await admin
    .from("cities")
    .select("id,name,slug")
    .eq("slug", citySlug)
    .maybeSingle()
  if (cityResult.error || !cityResult.data) {
    return NextResponse.json({ error: "city_not_found" }, { status: 404 })
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex")
  const duplicateResult = await admin
    .from("city_media_assets")
    .select("id,public_url,status")
    .eq("city_id", cityResult.data.id)
    .eq("content_hash", contentHash)
    .neq("status", "ARCHIVED")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (duplicateResult.data) {
    return NextResponse.json(
      { error: "duplicate_asset", asset: duplicateResult.data },
      { status: 409 },
    )
  }

  const assetId = randomUUID()
  const storagePath = `cities/${cityResult.data.id}/media/${assetId}-${safeFileStem(file.name)}.${imageExtension(file.type)}`
  const storage = admin.storage.from("city-media")
  const uploadResult = await storage.upload(storagePath, buffer, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  })

  if (uploadResult.error) {
    return NextResponse.json(
      { error: "storage_upload_failed" },
      { status: 502 },
    )
  }

  const { data: publicUrlData } = storage.getPublicUrl(storagePath)
  const dimensions = readImageDimensions(buffer, file.type)
  const title = nullableText(formData.get("title"), 240)
  const altText = nullableText(formData.get("altText"), 400)
  const sourceUrl = validHttpUrl(formData.get("sourceUrl"))
  const sourceTypeValue = formData.get("sourceType")
  const sourceType = isMediaSourceType(sourceTypeValue)
    ? sourceTypeValue
    : "MANUAL_UPLOAD"
  const statusValue = formData.get("status")
  const status = isMediaStatus(statusValue)
    ? statusValue
    : "PUBLISHED"

  const insertResult = await admin
    .from("city_media_assets")
    .insert({
      id: assetId,
      city_id: cityResult.data.id,
      storage_bucket: "city-media",
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
      media_type: "image",
      mime_type: file.type,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      file_size_bytes: file.size,
      content_hash: contentHash,
      title,
      alt_text: altText,
      photographer: nullableText(formData.get("photographer"), 240),
      copyright_holder: nullableText(formData.get("copyrightHolder"), 240),
      license: nullableText(formData.get("license"), 160),
      license_url: validHttpUrl(formData.get("licenseUrl")),
      source_type: sourceType,
      source_url: sourceUrl,
      provenance_note: nullableText(formData.get("provenanceNote"), 2000),
      status,
      created_by: adminSession.user.id,
      updated_by: adminSession.user.id,
    })
    .select("*")
    .single()

  if (insertResult.error || !insertResult.data) {
    await storage.remove([storagePath])
    return NextResponse.json({ error: "asset_create_failed" }, { status: 500 })
  }

  await writeMediaAudit(admin, adminSession, {
    cityId: cityResult.data.id,
    mediaAssetId: assetId,
    action: "UPLOAD",
    nextState: insertResult.data,
  })

  return NextResponse.json({ asset: insertResult.data }, { status: 201 })
}

function readImageDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    }
  }

  if (mimeType === "image/jpeg") {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        }
      }
      if (!length) break
      offset += 2 + length
    }
  }

  if (mimeType === "image/webp" && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const kind = buffer.toString("ascii", 12, 16)
    if (kind === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      }
    }
  }

  return null
}
