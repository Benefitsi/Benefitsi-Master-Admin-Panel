"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import type { MicrositeConfig } from "@/lib/microsites"
import { createClient } from "@/lib/supabase/client"
import { completeMicrositeImageUpload, discardMicrositeImageUpload, prepareMicrositeImageUpload } from "./microsite-upload-actions"

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_PENDING_BYTES = 20 * 1024 * 1024
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"])

type ImageUpload = {
  slot: string
  fileName: string
  file?: File
  previewUrl?: string
  originalUrl: string
  status: "uploading" | "error" | "complete"
  message?: string
}

const uploadSlots: Record<string, string> = {
  logo_file: "branding.logo",
  badge_file: "branding.partnerBadge",
  hero_file: "hero.backgroundImageUrl",
  deals_illustration_file: "deals.illustrationUrl",
  top_deal_file: "deals.topDealImageUrl",
  about_hero_file: "content.aboutHeroImageUrl",
  about_ingredient_file: "content.aboutIngredientImageUrl",
  about_location_file: "content.aboutLocationImageUrl",
  about_prep_file: "content.aboutPrepImageUrl",
  contact_location_icon_file: "content.contactLocationIcon",
  reward_5_image_file: "stamps.reward.5.image",
  reward_10_image_file: "stamps.reward.10.image",
  app_phone_screenshot_file: "content.appPhoneScreenshotUrl",
  footer_benefitsi_logo_file: "footer.benefitsiLogo",
}

export function micrositeImageUploadSlot(name: string) {
  return uploadSlots[name] || (name.startsWith("element_image_file__") ? decodeURIComponent(name.slice("element_image_file__".length)) : name)
}

export function micrositeImageSlotUrl(config: MicrositeConfig, slot: string) {
  const field = slot === "branding.logo" ? "branding.logoUrl" : slot === "branding.partnerBadge" ? "branding.partnerBadgeUrl" : slot
  const [group, key] = field.split(".")
  const section = config[group as keyof MicrositeConfig]
  return config.elementText[slot] || (section && typeof section === "object" && key in section ? String((section as Record<string, unknown>)[key] || "") : "")
}

export function micrositeLocalImageSlots(config: MicrositeConfig) {
  const slots = new Set([...Object.values(uploadSlots), "seo.ogImageUrl", ...Object.keys(config.elementText)])
  return Array.from(slots).filter(slot => micrositeImageSlotUrl(config, slot).trim().startsWith("blob:"))
}

// Replace only this selection's unique object URL. A later file selection or a
// manually chosen library URL must never be overwritten by a late completion.
function replacePreview<T>(value: T, preview: string, replacement: string): T {
  if (value === preview) return replacement as T
  if (Array.isArray(value)) return value.map(item => replacePreview(item, preview, replacement)) as T
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePreview(item, preview, replacement)])) as T
  }
  return value
}

export function hasMicrositeLocalImage(value: unknown): boolean {
  if (typeof value === "string") return value.trim().startsWith("blob:")
  if (Array.isArray(value)) return value.some(hasMicrositeLocalImage)
  return Boolean(value && typeof value === "object" && Object.values(value).some(hasMicrositeLocalImage))
}

export function useMicrositeImageUploads(partnerId: string, config: MicrositeConfig, setConfig: Dispatch<SetStateAction<MicrositeConfig>>) {
  const records = useRef(new Map<string, ImageUpload>())
  const mounted = useRef(true)
  const [uploads, setUploads] = useState<ImageUpload[]>([])
  const refresh = useCallback(() => {
    if (mounted.current) setUploads(Array.from(records.current.values()))
  }, [])
  const clear = useCallback(() => {
    for (const record of records.current.values()) if (record.previewUrl) URL.revokeObjectURL(record.previewUrl)
    records.current.clear()
    refresh()
  }, [refresh])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clear()
    }
  }, [clear])

  const isCurrent = (record: ImageUpload) => mounted.current && records.current.get(record.slot) === record

  async function start(record: ImageUpload) {
    const file = record.file
    if (!file) return
    record.status = "uploading"
    record.message = undefined
    refresh()
    let path: string | undefined
    let completed = false
    try {
      const prepared = await prepareMicrositeImageUpload(partnerId, { name: file.name, type: file.type, size: file.size })
      if (!prepared.ok) throw new Error(prepared.message)
      path = prepared.path
      if (!isCurrent(record)) return
      const result = await createClient().storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type })
      if (result.error) throw new Error("Bild-Upload fehlgeschlagen. Bitte erneut versuchen.")
      if (!isCurrent(record)) return
      const resultUrl = await completeMicrositeImageUpload(partnerId, prepared.path)
      if (!resultUrl.ok) throw new Error(resultUrl.message)
      if (!/^https?:\/\//.test(resultUrl.url)) throw new Error("Bild-Upload fehlgeschlagen. Bitte erneut versuchen.")
      completed = true
      if (!isCurrent(record)) return
      const previewUrl = record.previewUrl
      if (previewUrl) {
        setConfig(current => {
          const next = replacePreview(current, previewUrl, resultUrl.url)
          const createdAt = new Date().toISOString()
          const entry = { id: `${record.slot}-${createdAt}`, slot: record.slot, url: resultUrl.url, label: record.fileName, source: "upload" as const, createdAt }
          return { ...next, assets: { ...next.assets, library: [...next.assets.library.filter(asset => asset.url !== resultUrl.url), entry].slice(-80) } }
        })
        URL.revokeObjectURL(previewUrl)
      }
      record.previewUrl = undefined
      record.file = undefined
      record.status = "complete"
      refresh()
    } catch (error) {
      if (isCurrent(record)) {
        record.status = "error"
        record.message = error instanceof Error ? error.message : "Bild-Upload fehlgeschlagen. Bitte erneut versuchen."
        refresh()
      }
    } finally {
      // Only staging objects are removed. Published immutable URLs may already
      // be referenced by a saved version and must never be deleted here.
      if (path && !completed) void discardMicrositeImageUpload(partnerId, path).catch(() => {})
    }
  }

  function cancel(slot: string) {
    const record = records.current.get(slot)
    if (!record) return
    records.current.delete(slot)
    if (record.previewUrl) {
      const preview = record.previewUrl
      setConfig(current => {
        const next = replacePreview(current, preview, record.originalUrl)
        if (!record.originalUrl) {
          // An absent override inherits the Builder image. An empty string can
          // deliberately hide it, so cancellation must restore the absence.
          for (const [key, value] of Object.entries(current.elementText)) {
            if (value === preview) delete next.elementText[key]
          }
          next.assets.library = next.assets.library.filter((_, index) => current.assets.library[index].url !== preview)
        }
        return next
      })
      URL.revokeObjectURL(preview)
    }
    refresh()
  }

  function select(slot: string, file: File, onPreview?: (url: string) => void) {
    const previous = records.current.get(slot)
    const currentSlotUrl = micrositeImageSlotUrl(config, slot)
    const originalUrl = previous?.previewUrl === currentSlotUrl
      ? previous.originalUrl
      : currentSlotUrl
    const pendingBytes = Array.from(records.current.values()).reduce((total, entry) => total + (entry.slot === slot ? 0 : entry.file?.size || 0), 0)
    const message = !IMAGE_TYPES.has(file.type)
      ? "Dieser Bildtyp wird nicht unterstützt. Bitte PNG, JPG, WebP oder SVG verwenden."
      : file.size > MAX_IMAGE_BYTES || file.size === 0
        ? "Ein Bild muss zwischen 1 Byte und 10 MB groß sein."
        : pendingBytes + file.size > MAX_PENDING_BYTES
          ? "Offene Bild-Uploads dürfen zusammen maximal 20 MB groß sein. Bitte laufende Uploads abwarten."
          : undefined
    cancel(slot)
    const record: ImageUpload = { slot, fileName: file.name, originalUrl, status: message ? "error" : "uploading", message }
    if (!message) {
      record.file = file
      record.previewUrl = URL.createObjectURL(file)
    }
    records.current.set(slot, record)
    if (record.previewUrl) onPreview?.(record.previewUrl)
    refresh()
    if (!message) void start(record)
  }

  function retry(slot: string) {
    const record = records.current.get(slot)
    if (record?.status === "error" && record.file) void start(record)
  }

  return { uploads, select, cancel, retry, clear, blocked: uploads.some(upload => upload.status !== "complete"), isBlocked: () => Array.from(records.current.values()).some(upload => upload.status !== "complete") }
}

export const MicrositeImageUploadContext = createContext<ReturnType<typeof useMicrositeImageUploads> | null>(null)

export function useMicrositeImageUploadContext() {
  const value = useContext(MicrositeImageUploadContext)
  if (!value) throw new Error("MicrositeImageUploadContext is missing.")
  return value
}
