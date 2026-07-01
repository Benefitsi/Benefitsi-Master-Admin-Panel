"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireAdmin } from "@/lib/admin"
import {
  resolveMicrositeConfig,
  type MicrositeConfig,
  type PartnerMicrosite,
} from "@/lib/microsites"
import { getDashboardData, type Partner, type PartnerWithDeals } from "@/lib/admin-data"
import { createMicrositeReadinessReport } from "@/lib/microsite-readiness"

export type MicrositeActionState = {
  ok: boolean
  message: string
  config?: MicrositeConfig
}

const MICROSITE_ASSET_BUCKET =
  process.env.SUPABASE_PARTNER_MEDIA_BUCKET ?? "partner-assets"
const MAX_MICROSITE_ASSET_BYTES = 10 * 1024 * 1024
const ALLOWED_MICROSITE_ASSET_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
])

export async function saveMicrositeVersion(
  _previousState: MicrositeActionState,
  formData: FormData,
): Promise<MicrositeActionState> {
  const partnerId = stringValue(formData, "partner_id")
  const rawIntent = stringValue(formData, "intent")
  const intent =
    rawIntent === "publish" || rawIntent === "review" || rawIntent === "approve"
      ? rawIntent
      : "draft"

  if (!partnerId) {
    return {
      ok: false,
      message:
        "Bitte zuerst einen Partner auswählen, bevor die Microsite gespeichert werden kann.",
    }
  }

  const { supabase } = await requireAdmin()
  const partnerResult = await supabase
    .from("partners")
    .select("*")
    .eq("id", partnerId)
    .maybeSingle()

  if (partnerResult.error || !partnerResult.data) {
    return {
      ok: false,
      message:
        partnerResult.error?.message ||
        "Der ausgewählte Partner existiert nicht mehr.",
    }
  }

  const partner = partnerResult.data as Partner
  let config = createConfigFromForm(formData, partner)

  if (intent === "publish") {
    const readinessPartner = await getFullPartnerForReadiness(
      supabase,
      partnerId,
      partner,
    )

    if (!readinessPartner.ok) {
      return readinessPartner.state
    }

    const report = createMicrositeReadinessReport(readinessPartner.partner, config)
    const blockers = report.items.filter(
      (item) => item.severity === "required" && !item.ok,
    )

    if (blockers.length > 0) {
      return {
        ok: false,
        config,
        message: `Veröffentlichung blockiert: ${blockers
          .slice(0, 3)
          .map((item) => item.label)
            .join(", ")}${blockers.length > 3 ? " …" : ""}. Bitte zuerst die Pflichtpunkte erledigen oder als Entwurf speichern.`,
      }
    }
  }

  const uploadedAssets = await uploadMicrositeAssets(supabase, formData, partnerId)

  if (!uploadedAssets.ok) {
    return uploadedAssets.state
  }

  config = applyUploadedAssets(config, uploadedAssets.urls)
  const micrositeResult = await findOrCreateMicrosite(partner)

  if (!micrositeResult.ok) {
    return micrositeResult.state
  }

  const microsite = micrositeResult.microsite
  const nextVersion = await nextVersionNumber(microsite.id)

  if (!nextVersion.ok) {
    return nextVersion.state
  }

  const versionId = randomUUID()
  const status =
    intent === "publish"
      ? "published"
      : intent === "review"
        ? "review"
        : intent === "approve"
          ? "approved"
          : "draft"
  const insertResult = await supabase.from("microsite_versions").insert({
    id: versionId,
    microsite_id: microsite.id,
    version_number: nextVersion.number,
    config,
    status,
  })

  if (insertResult.error) {
    return { ok: false, message: insertResult.error.message }
  }

  const micrositeUpdate =
    intent === "publish"
      ? {
          published_version_id: versionId,
          status: "published",
          updated_at: new Date().toISOString(),
        }
      : {
          status:
            intent === "approve"
              ? "approved"
              : intent === "review"
                ? "review"
                : "draft",
          updated_at: new Date().toISOString(),
        }

  const workflowResult = await supabase
    .from("microsites")
    .update(micrositeUpdate)
    .eq("id", microsite.id)

  if (workflowResult.error) {
    return {
      ok: false,
      message:
        intent === "publish"
          ? `Version gespeichert, aber die Veröffentlichung ist fehlgeschlagen: ${workflowResult.error.message}`
          : `Version gespeichert, aber der Status konnte nicht aktualisiert werden: ${workflowResult.error.message}`,
    }
  }

  const previewSlug = microsite.slug || partner.slug || partnerId

  revalidatePath("/")
  revalidatePath(`/microsite-preview/${previewSlug}`)

  if (intent === "publish") {
    revalidatePath(`/p/${previewSlug}`)
  }

  return {
    ok: true,
    config,
    message:
      intent === "publish"
        ? "Microsite veröffentlicht. Die Live-Seite nutzt jetzt diese Version."
        : intent === "approve"
          ? "Microsite freigegeben. Sie kann veröffentlicht werden, sobald die finalen Checks passen."
          : intent === "review"
            ? "Prüfversion gespeichert. Die Microsite ist jetzt für die interne Freigabe markiert."
            : "Entwurf gespeichert. Eine bereits veröffentlichte Microsite bleibt unverändert.",
  }
}

async function getFullPartnerForReadiness(
  supabase: SupabaseClient,
  partnerId: string,
  fallbackPartner: Partner,
): Promise<
  | { ok: true; partner: PartnerWithDeals }
  | { ok: false; state: MicrositeActionState }
> {
  const dashboardData = await getDashboardData(supabase)
  const partner = dashboardData.partners.find((item) => item.id === partnerId)

  if (!partner) {
    return {
      ok: false,
      state: {
        ok: false,
        message: "Partnerdaten konnten für den Live-Check nicht geladen werden.",
      },
    }
  }

  if (dashboardData.errors.length > 0) {
    return {
      ok: false,
      state: {
        ok: false,
        message: `Live-Check unvollständig: ${dashboardData.errors
          .slice(0, 2)
          .join(" · ")}`,
      },
    }
  }

  return {
    ok: true,
    partner: {
      ...fallbackPartner,
      ...partner,
    },
  }
}

async function findOrCreateMicrosite(partner: Partner): Promise<
  | { ok: true; microsite: PartnerMicrosite }
  | { ok: false; state: MicrositeActionState }
> {
  const { supabase } = await requireAdmin()
  const existing = await supabase
    .from("microsites")
    .select("*")
    .eq("partner_id", partner.id)
    .maybeSingle()

  if (existing.error) {
    return { ok: false, state: { ok: false, message: existing.error.message } }
  }

  if (existing.data) {
    return {
      ok: true,
      microsite: {
        ...(existing.data as Omit<PartnerMicrosite, "draftVersion" | "publishedVersion">),
        draftVersion: null,
        publishedVersion: null,
      },
    }
  }

  const slug = partner.slug || slugify(partner.name || "partner")
  const inserted = await supabase
    .from("microsites")
    .insert({
      id: randomUUID(),
      partner_id: partner.id,
      slug,
      subdomain: partner.subdomain || slug,
      status: "draft",
    })
    .select("*")
    .single()

  if (inserted.error) {
    return { ok: false, state: { ok: false, message: inserted.error.message } }
  }

  return {
    ok: true,
    microsite: {
      ...(inserted.data as Omit<PartnerMicrosite, "draftVersion" | "publishedVersion">),
      draftVersion: null,
      publishedVersion: null,
    },
  }
}

async function nextVersionNumber(micrositeId: string): Promise<
  | { ok: true; number: number }
  | { ok: false; state: MicrositeActionState }
> {
  const { supabase } = await requireAdmin()
  const result = await supabase
    .from("microsite_versions")
    .select("version_number")
    .eq("microsite_id", micrositeId)
    .order("version_number", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    return { ok: false, state: { ok: false, message: result.error.message } }
  }

  return { ok: true, number: Number(result.data?.version_number || 0) + 1 }
}

function createConfigFromForm(formData: FormData, partner: Partner): MicrositeConfig {
  const previousConfig = parseJson(stringValue(formData, "existing_config"))
  const base = resolveMicrositeConfig(previousConfig, partner)
  const candidate = {
    ...base,
    branding: {
      ...base.branding,
      accent: stringValue(formData, "accent") || base.branding.accent,
      accentSecondary:
        stringValue(formData, "accent_secondary") || base.branding.accentSecondary,
      logoUrl: stringValue(formData, "logo_url") || base.branding.logoUrl,
      partnerBadgeUrl:
        stringValue(formData, "partner_badge_url") || base.branding.partnerBadgeUrl,
    },
    hero: {
      ...base.hero,
      headline: stringValue(formData, "hero_headline") || base.hero.headline,
      slogan: stringValue(formData, "hero_slogan") || base.hero.slogan,
      locationText:
        stringValue(formData, "hero_location") || base.hero.locationText,
      openingText:
        stringValue(formData, "hero_opening") || base.hero.openingText,
      backgroundImageUrl:
        stringValue(formData, "hero_image_url") || base.hero.backgroundImageUrl,
      badgeText: stringValue(formData, "hero_badge_text") || base.hero.badgeText,
      primaryButtonLabel:
        stringValue(formData, "hero_primary_label") || base.hero.primaryButtonLabel,
      secondaryButtonLabel:
        stringValue(formData, "hero_secondary_label") ||
        base.hero.secondaryButtonLabel,
    },
    deals: {
      ...base.deals,
      headline: stringValue(formData, "deals_headline") || base.deals.headline,
      slogan: stringValue(formData, "deals_slogan") || base.deals.slogan,
      description:
        stringValue(formData, "deals_description") || base.deals.description,
      illustrationUrl:
        stringValue(formData, "deals_illustration_url") ||
        base.deals.illustrationUrl,
      topDealHeadline:
        stringValue(formData, "top_deal_headline") || base.deals.topDealHeadline,
      topDealImageUrl:
        stringValue(formData, "top_deal_image_url") || base.deals.topDealImageUrl,
    },
    content: {
      ...base.content,
      menuHeadline:
        stringValue(formData, "menu_headline") || base.content.menuHeadline,
      menuDescription:
        stringValue(formData, "menu_description") ||
        base.content.menuDescription,
      aboutHeadline:
        stringValue(formData, "about_headline") || base.content.aboutHeadline,
      aboutText: stringValue(formData, "about_text") || base.content.aboutText,
      contactHeadline:
        stringValue(formData, "contact_headline") ||
        base.content.contactHeadline,
      appHeadline:
        stringValue(formData, "app_headline") || base.content.appHeadline,
      appText: stringValue(formData, "app_text") || base.content.appText,
      footerText:
        stringValue(formData, "footer_text") || base.content.footerText,
    },
    seo: {
      ...base.seo,
      title: stringValue(formData, "seo_title") || base.seo.title,
      description:
        stringValue(formData, "seo_description") || base.seo.description,
      keywords:
        stringValue(formData, "seo_keywords")
          ?.split(",")
          .map((item) => item.trim())
          .filter(Boolean) || base.seo.keywords,
      ogImageUrl: stringValue(formData, "seo_og_image_url") || base.seo.ogImageUrl,
    },
  }

  return resolveMicrositeConfig(
    applyInlineTextOverrides(candidate, parseInlineTextOverrides(formData)),
    partner,
  )
}

function parseInlineTextOverrides(formData: FormData) {
  const parsed = parseJson(stringValue(formData, "inline_text_overrides"))

  if (!isRecord(parsed)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  )
}

function applyInlineTextOverrides(
  config: MicrositeConfig,
  overrides: Record<string, string>,
): MicrositeConfig {
  return Object.entries(overrides).reduce(
    (current, [id, value]) => applyInlineTextOverride(current, id, value),
    config,
  )
}

function applyInlineTextOverride(
  config: MicrositeConfig,
  id: string,
  value: string,
): MicrositeConfig {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return config
  }

  if (id.startsWith("navigation.")) {
    return {
      ...config,
      elementText: {
        ...config.elementText,
        [id]: trimmedValue,
      },
    }
  }

  switch (id) {
    case "branding.partnerName":
      return {
        ...config,
        elementText: {
          ...config.elementText,
          [id]: trimmedValue,
        },
      }
    case "hero.headline":
      return { ...config, hero: { ...config.hero, headline: trimmedValue } }
    case "hero.slogan":
      return { ...config, hero: { ...config.hero, slogan: trimmedValue } }
    case "hero.locationText":
      return { ...config, hero: { ...config.hero, locationText: trimmedValue } }
    case "hero.openingText":
      return { ...config, hero: { ...config.hero, openingText: trimmedValue } }
    case "hero.badgeText":
      return { ...config, hero: { ...config.hero, badgeText: trimmedValue } }
    case "hero.primaryButtonLabel":
      return {
        ...config,
        hero: { ...config.hero, primaryButtonLabel: trimmedValue },
      }
    case "hero.secondaryButtonLabel":
      return {
        ...config,
        hero: { ...config.hero, secondaryButtonLabel: trimmedValue },
      }
    case "deals.label":
      return { ...config, deals: { ...config.deals, label: trimmedValue } }
    case "deals.headline":
      return { ...config, deals: { ...config.deals, headline: trimmedValue } }
    case "deals.slogan":
      return { ...config, deals: { ...config.deals, slogan: trimmedValue } }
    case "deals.description":
      return { ...config, deals: { ...config.deals, description: trimmedValue } }
    case "deals.topDealLabel":
      return {
        ...config,
        deals: { ...config.deals, topDealLabel: trimmedValue },
      }
    case "deals.topDealHeadline":
      return {
        ...config,
        deals: { ...config.deals, topDealHeadline: trimmedValue },
      }
    case "deals.topDealDescription":
      return {
        ...config,
        deals: { ...config.deals, topDealDescription: trimmedValue },
      }
    case "deals.topDealButtonLabel":
      return {
        ...config,
        deals: { ...config.deals, topDealButtonLabel: trimmedValue },
      }
    case "stamps.label":
      return { ...config, stamps: { ...config.stamps, label: trimmedValue } }
    case "stamps.headline":
      return { ...config, stamps: { ...config.stamps, headline: trimmedValue } }
    case "stamps.slogan":
      return { ...config, stamps: { ...config.stamps, slogan: trimmedValue } }
    case "content.menuLabel":
      return { ...config, content: { ...config.content, menuLabel: trimmedValue } }
    case "content.menuHeadline":
      return {
        ...config,
        content: { ...config.content, menuHeadline: trimmedValue },
      }
    case "content.menuDescription":
      return {
        ...config,
        content: { ...config.content, menuDescription: trimmedValue },
      }
    case "content.aboutLabel":
      return { ...config, content: { ...config.content, aboutLabel: trimmedValue } }
    case "content.aboutHeadline":
      return {
        ...config,
        content: { ...config.content, aboutHeadline: trimmedValue },
      }
    case "content.aboutText":
      return { ...config, content: { ...config.content, aboutText: trimmedValue } }
    case "content.contactLabel":
      return {
        ...config,
        content: { ...config.content, contactLabel: trimmedValue },
      }
    case "content.contactHeadline":
      return {
        ...config,
        content: { ...config.content, contactHeadline: trimmedValue },
      }
    case "content.appHeadline":
      return { ...config, content: { ...config.content, appHeadline: trimmedValue } }
    case "content.appText":
      return { ...config, content: { ...config.content, appText: trimmedValue } }
    case "content.footerText":
      return { ...config, content: { ...config.content, footerText: trimmedValue } }
    default:
      break
  }

  const topDealBulletMatch = id.match(/^deals\.topDealBullets\.(\d+)$/)

  if (topDealBulletMatch) {
    const index = Number(topDealBulletMatch[1])

    return {
      ...config,
      deals: {
        ...config.deals,
        topDealBullets: config.deals.topDealBullets.map((item, itemIndex) =>
          itemIndex === index ? trimmedValue : item,
        ),
      },
    }
  }

  const serviceMatch = id.match(/^hero\.services\.(\d+)\.label$/)

  if (serviceMatch) {
    const index = Number(serviceMatch[1])

    return {
      ...config,
      hero: {
        ...config.hero,
        services: config.hero.services.map((item, itemIndex) =>
          itemIndex === index ? { ...item, label: trimmedValue } : item,
        ),
      },
    }
  }

  return {
    ...config,
    elementText: {
      ...config.elementText,
      [id]: trimmedValue,
    },
  }
}

type AssetSlot =
  | "logo"
  | "badge"
  | "hero"
  | "deals_illustration"
  | "top_deal"
  | "about_hero"
  | "about_ingredient"
  | "about_location"
  | "about_prep"
  | "contact_location_icon"
  | "reward_5_image"
  | "reward_10_image"
  | "app_qr_code"
  | "footer_benefitsi_logo"

type UploadedMicrositeAssets = Partial<Record<AssetSlot, string>> & {
  elementImages?: Record<string, string>
}

async function uploadMicrositeAssets(
  supabase: SupabaseClient,
  formData: FormData,
  partnerId: string,
): Promise<
  | { ok: true; urls: UploadedMicrositeAssets }
  | { ok: false; state: MicrositeActionState }
> {
  const slots: Array<{ slot: AssetSlot; field: string }> = [
    { slot: "logo", field: "logo_file" },
    { slot: "badge", field: "badge_file" },
    { slot: "hero", field: "hero_file" },
    { slot: "deals_illustration", field: "deals_illustration_file" },
    { slot: "top_deal", field: "top_deal_file" },
    { slot: "about_hero", field: "about_hero_file" },
    { slot: "about_ingredient", field: "about_ingredient_file" },
    { slot: "about_location", field: "about_location_file" },
    { slot: "about_prep", field: "about_prep_file" },
    { slot: "contact_location_icon", field: "contact_location_icon_file" },
    { slot: "reward_5_image", field: "reward_5_image_file" },
    { slot: "reward_10_image", field: "reward_10_image_file" },
    { slot: "app_qr_code", field: "app_qr_code_file" },
    { slot: "footer_benefitsi_logo", field: "footer_benefitsi_logo_file" },
  ]
  const urls: UploadedMicrositeAssets = {}

  for (const { slot, field } of slots) {
    const value = formData
      .getAll(field)
      .find(isUploadFile)

    if (!value) {
      continue
    }

    if (!ALLOWED_MICROSITE_ASSET_TYPES.has(value.type)) {
      return {
        ok: false,
        state: {
          ok: false,
          message: `${value.name}: Dieser Bildtyp wird nicht unterstützt.`,
        },
      }
    }

    if (value.size > MAX_MICROSITE_ASSET_BYTES) {
      return {
        ok: false,
        state: {
          ok: false,
          message: `${value.name}: Das Bild darf maximal 10 MB groß sein.`,
        },
      }
    }

    const extension = fileExtension(value)
    const path = `microsites/${partnerId}/${slot}-${randomUUID()}.${extension}`
    const upload = await supabase.storage
      .from(MICROSITE_ASSET_BUCKET)
      .upload(path, value, { contentType: value.type, upsert: false })

    if (upload.error) {
      return { ok: false, state: { ok: false, message: upload.error.message } }
    }

    urls[slot] = supabase.storage
      .from(MICROSITE_ASSET_BUCKET)
      .getPublicUrl(path).data.publicUrl
  }

  const elementImages: Record<string, string> = {}

  for (const [field, value] of formData.entries()) {
    if (!field.startsWith("element_image_file__") || !isUploadFile(value)) {
      continue
    }

    const elementId = decodeURIComponent(
      field.replace("element_image_file__", ""),
    )

    if (!elementId || !/^[a-zA-Z0-9._-]+$/.test(elementId)) {
      continue
    }

    const uploadResult = await uploadMicrositeAssetFile(
      supabase,
      value,
      partnerId,
      `element-${elementId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    )

    if (!uploadResult.ok) {
      return uploadResult
    }

    elementImages[elementId] = uploadResult.url
  }

  if (Object.keys(elementImages).length > 0) {
    urls.elementImages = elementImages
  }

  return { ok: true, urls }
}

async function uploadMicrositeAssetFile(
  supabase: SupabaseClient,
  value: File,
  partnerId: string,
  slot: string,
): Promise<
  | { ok: true; url: string }
  | { ok: false; state: MicrositeActionState }
> {
  if (!ALLOWED_MICROSITE_ASSET_TYPES.has(value.type)) {
    return {
      ok: false,
      state: {
        ok: false,
        message: `${value.name}: Dieser Bildtyp wird nicht unterstützt.`,
      },
    }
  }

  if (value.size > MAX_MICROSITE_ASSET_BYTES) {
    return {
      ok: false,
      state: {
        ok: false,
        message: `${value.name}: Das Bild darf maximal 10 MB groß sein.`,
      },
    }
  }

  const extension = fileExtension(value)
  const path = `microsites/${partnerId}/${slot}-${randomUUID()}.${extension}`
  const upload = await supabase.storage
    .from(MICROSITE_ASSET_BUCKET)
    .upload(path, value, { contentType: value.type, upsert: false })

  if (upload.error) {
    return { ok: false, state: { ok: false, message: upload.error.message } }
  }

  return {
    ok: true,
    url: supabase.storage
      .from(MICROSITE_ASSET_BUCKET)
      .getPublicUrl(path).data.publicUrl,
  }
}

function isUploadFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "size" in value &&
    "type" in value &&
    typeof value.size === "number" &&
    value.size > 0
  )
}

function applyUploadedAssets(
  config: MicrositeConfig,
  urls: UploadedMicrositeAssets,
) {
  return {
    ...config,
    branding: {
      ...config.branding,
      logoUrl: urls.logo || config.branding.logoUrl,
      partnerBadgeUrl: urls.badge || config.branding.partnerBadgeUrl,
    },
    hero: {
      ...config.hero,
      backgroundImageUrl: urls.hero || config.hero.backgroundImageUrl,
    },
    deals: {
      ...config.deals,
      illustrationUrl: urls.deals_illustration || config.deals.illustrationUrl,
      topDealImageUrl: urls.top_deal || config.deals.topDealImageUrl,
    },
    elementText: {
      ...config.elementText,
      "content.aboutHeroImageUrl":
        urls.about_hero || config.elementText["content.aboutHeroImageUrl"],
      "content.aboutIngredientImageUrl":
        urls.about_ingredient || config.elementText["content.aboutIngredientImageUrl"],
      "content.aboutLocationImageUrl":
        urls.about_location || config.elementText["content.aboutLocationImageUrl"],
      "content.aboutPrepImageUrl":
        urls.about_prep || config.elementText["content.aboutPrepImageUrl"],
      "content.contactLocationIcon":
        urls.contact_location_icon || config.elementText["content.contactLocationIcon"],
      "stamps.reward.5.image":
        urls.reward_5_image || config.elementText["stamps.reward.5.image"],
      "stamps.reward.10.image":
        urls.reward_10_image || config.elementText["stamps.reward.10.image"],
      "content.appQrCodeUrl":
        urls.app_qr_code || config.elementText["content.appQrCodeUrl"],
      "footer.benefitsiLogo":
        urls.footer_benefitsi_logo || config.elementText["footer.benefitsiLogo"],
      ...(urls.elementImages ?? {}),
    },
    assets: {
      ...config.assets,
      library: mergeUploadedAssetsIntoLibrary(config, urls),
    },
  }
}

function mergeUploadedAssetsIntoLibrary(
  config: MicrositeConfig,
  urls: UploadedMicrositeAssets,
) {
  const now = new Date().toISOString()
  const entries = [
    assetLibraryEntry(urls.logo, "Partnerlogo Upload", "branding.logo", now),
    assetLibraryEntry(urls.badge, "Badge Upload", "branding.partnerBadge", now),
    assetLibraryEntry(urls.hero, "Hero Hintergrund Upload", "hero.backgroundImageUrl", now),
    assetLibraryEntry(urls.deals_illustration, "Deals Intro Upload", "deals.illustrationUrl", now),
    assetLibraryEntry(urls.top_deal, "Top-Deal Upload", "deals.topDealImageUrl", now),
    assetLibraryEntry(urls.about_hero, "Über uns Hintergrund Upload", "content.aboutHeroImageUrl", now),
    assetLibraryEntry(urls.about_ingredient, "Über uns Zutaten Upload", "content.aboutIngredientImageUrl", now),
    assetLibraryEntry(urls.about_location, "Über uns Ortsbild Upload", "content.aboutLocationImageUrl", now),
    assetLibraryEntry(urls.about_prep, "Über uns Detail Upload", "content.aboutPrepImageUrl", now),
    assetLibraryEntry(urls.contact_location_icon, "Kontakt Standort Icon Upload", "content.contactLocationIcon", now),
    assetLibraryEntry(urls.reward_5_image, "Reward 5 Upload", "stamps.reward.5.image", now),
    assetLibraryEntry(urls.reward_10_image, "Reward 10 Upload", "stamps.reward.10.image", now),
    assetLibraryEntry(urls.app_qr_code, "App QR-Code Upload", "content.appQrCodeUrl", now),
    assetLibraryEntry(urls.footer_benefitsi_logo, "Footer Logo Upload", "footer.benefitsiLogo", now),
    ...Object.entries(urls.elementImages ?? {}).map(([slot, url]) =>
      assetLibraryEntry(url, `Element Upload ${slot}`, slot, now),
    ),
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const byUrl = new Map(
    (config.assets?.library ?? []).map((asset) => [asset.url, asset] as const),
  )

  for (const entry of entries) {
    byUrl.set(entry.url, entry)
  }

  return Array.from(byUrl.values()).slice(-80)
}

function assetLibraryEntry(
  url: string | undefined,
  label: string,
  slot: string,
  createdAt: string,
) {
  if (!url) {
    return null
  }

  return {
    id: `${slot}-${createdAt}`,
    url,
    label,
    slot,
    source: "upload" as const,
    createdAt,
  }
}

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
}

function parseJson(value: string) {
  try {
    return value ? (JSON.parse(value) as unknown) : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function fileExtension(file: File) {
  const providedExtension = file.name.split(".").pop()?.toLowerCase()
  const safeExtension = providedExtension?.replace(/[^a-z0-9]/g, "")

  if (safeExtension) {
    return safeExtension
  }

  return file.type === "image/svg+xml" ? "svg" : "jpg"
}
