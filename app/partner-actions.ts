"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import sharp from "sharp"
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import { requireAdmin } from "@/lib/admin"
import { getSupabaseConfig } from "@/lib/supabase/config"
import {
  DEFAULT_MENU_STATUS,
  adminTextLimits,
  MAX_PARTNER_SOCIALS,
  isPartnerSocialPlatform,
  partnerMediaSpecs,
  type PartnerMediaSpec,
} from "@/lib/partner-config"
import {
  DEFAULT_AUDIENCE,
  DEFAULT_DEAL_DROP_PRIORITY,
  DEFAULT_DEAL_DROP_WEEKDAYS,
  DEFAULT_REWARD_TRACK_TARGET,
  DEFAULT_SELECTION_EXPIRES_MINUTES,
  DEFAULT_TIMEZONE,
  MAX_STAMP_CARD_STAMPS,
  activationRequiredForCategory,
  isAudience,
  isDealType,
  isDiscountType,
  isMilestoneAudience,
  isPartnerStaffRole,
  isRewardType,
  normalizeBenefitCategory,
} from "@/lib/reward-config"
import * as menuImport from "@/lib/menu-import.js"
import * as menuZipImport from "@/lib/menu-zip-import.js"

const {
  downloadRemoteImage,
  readMenuImportFiles,
  runMenuImportBatch,
  validateMenuDocument,
  prepareMissingAddonsRetry,
  createAddonUpdatePlan,
  applyMenuItemUpdatePlan,
} = menuImport
const { readMenuZipFiles } = menuZipImport

const DURATION_BONUS_DEAL = "duration_bonus"
const COMEBACK_INACTIVE_DEAL = "comeback_inactive"
const DURATION_BONUS_MODE = "duration_bonus"
const COMEBACK_INACTIVE_MODE = "comeback_inactive"

export type PartnerActionState = {
  message: string
  ok: boolean
  partnerId?: string
  created?: boolean
  menuCategory?: {
    id: string
    menu_id: string | null
    name: string | null
    slug: string | null
    image_url: string | null
    sort_order: number | null
  }
  menuItem?: {
    id: string
    menu_id: string | null
    category_id: string | null
    name: string | null
    description: string | null
    price: number | string | null
    currency: string | null
    image_url: string | null
    tags: string[] | null
    allergens: string[] | null
    addons: ParsedMenuItemAddon[] | null
    is_popular: boolean | null
    is_stamp_eligible: boolean | null
    sort_order: number | null
  }
  deletedId?: string
  importedCategories?: number
  importedItems?: number
  updatedAddons?: Array<{
    itemId: string
    addons: ParsedMenuItemAddon[]
  }>
  menuId?: string
  issues?: boolean
  importWarnings?: string[]
  importPreview?: {
    signature: string
    categories: number
    items: number
    addons: number
    imagesMatched: number
    imagesMissing: number
    errors: string[]
    warnings: string[]
    ready: boolean
  }
}

export type PartnerCoverUploadTarget =
  | {
      ok: true
      bucket: string
      path: string
      publicUrl: string
      token: string
    }
  | { ok: false; message: string }

type UploadedStoragePath = {
  bucket: string
  path: string
}

type PartnerMediaFormValues = {
  logoFile: File | null
  featureFile: File | null
  discoverFile: File | null
  coverFiles: File[]
  coverOrder: string[]
  existingLogoUrl: string
  existingFeatureCardUrl: string
  existingDiscoverCardUrl: string
  existingCoverUrls: string[]
  removedMediaUrls: string[]
}

type ParsedDeal = {
  partner_id: string
  type: string
  discount_type: string
  premium_only: boolean
  benefit_category: string
  audience: string
  activation_required: boolean
  active: boolean
  discount_value: number | null
  reward_item: string | null
  benefit_count: number | null
  estimated_savings: number | null
  customer_description: string | null
  staff_instructions: string | null
  terms: string | null
  trigger_value: number | null
  expiry_days: number | null
  happy_hour_start: string | null
  happy_hour_end: string | null
  starts_at: string | null
  ends_at: string | null
  valid_from: string | null
  valid_until: string | null
  valid_weekdays: number[]
  max_redemptions_global: number | null
  max_redemptions_per_user: number | null
  cooldown_hours: number | null
  stock_total: number | null
  stock_remaining: number | null
  selection_expires_minutes: number
  priority: number | null
  min_spend: number | null
  max_discount_amount: number | null
  allow_free_trial: boolean
  reward_track_target: string
  timezone: string
  weekdays: string[]
  reserve_on_selection: boolean
  metadata: unknown
  created_at?: string
  updated_at?: string
}

type ParsedMilestone = {
  partner_id: string
  required_stamps: number | null
  reward_type: string
  reward_item: string | null
  discount_type: string
  discount_value: number | null
  estimated_savings: number | null
  title: string | null
  customer_description: string | null
  staff_instructions: string | null
  terms: string | null
  audience: string
  active: boolean
  reward_track_target: string
  created_at?: string
  updated_at?: string
}

type ParsedPartnerSocial = {
  platform: string
  handle: string
  sort_order: number
  url: string
}

type ParsedPartnerStaff = {
  partner_id: string
  user_id: string
  role: string
  active: boolean
  created_at?: string
  updated_at?: string
}

type ParsedOpeningHour = {
  partner_id: string
  weekday: number | null
  opens_at: string | null
  closes_at: string | null
  label: string | null
  is_closed: boolean
  sort_order: number | null
}

type ParsedPartnerHoliday = {
  partner_id: string
  holiday_date: string
  label: string | null
  is_closed: boolean
  opens_at: string | null
  closes_at: string | null
  repeats_yearly: boolean
  created_at?: string
  updated_at?: string
}

type ParsedMenu = {
  partner_id: string
  name: string
  description: string | null
  status: string
}

type ParsedMenuCategory = {
  menu_id: string
  name: string
  slug: string
  image_url: string | null
  sort_order: number | null
}

type ParsedMenuItem = {
  menu_id: string
  category_id: string | null
  name: string
  description: string | null
  price: number | null
  currency: string
  image_url: string | null
  tags: string[]
  allergens: string[]
  addons: ParsedMenuItemAddon[]
  is_popular: boolean
  is_stamp_eligible: boolean
  sort_order: number | null
}

type ParsedInitialMenuCategory = ParsedMenuCategory & {
  draft_id: string
  image_file: File | null
}

type ParsedInitialMenuItem = ParsedMenuItem & {
  image_file: File | null
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
const openingWeekdays = [1, 2, 3, 4, 5, 6, 7] as const

export async function createPartnerCoverUpload(
  fileName: string,
  contentType: string,
  size: number,
): Promise<PartnerCoverUploadTarget> {
  const { supabase } = await requireAdmin()

  if (!ALLOWED_PARTNER_MEDIA_TYPES.has(contentType)) {
    return { ok: false, message: "Cover photos must be PNG, JPEG, WebP, or SVG images." }
  }

  if (!Number.isFinite(size) || size <= 0 || size > MAX_PARTNER_MEDIA_BYTES) {
    return { ok: false, message: "Each cover photo must be 10 MB or smaller." }
  }

  const path = `staged-covers/${randomUUID()}-${safeFileName(fileName)}`
  const { data, error } = await supabase.storage
    .from(PARTNER_MEDIA_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    return {
      ok: false,
      message: error?.message ?? "Unable to prepare the cover photo upload.",
    }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PARTNER_MEDIA_BUCKET).getPublicUrl(path)

  return {
    ok: true,
    bucket: PARTNER_MEDIA_BUCKET,
    path,
    publicUrl,
    token: data.token,
  }
}

export async function savePartner(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const isUpdate = Boolean(id)
  const partnerId = isUpdate ? id : createUuidV4()
  const mediaValues = collectPartnerMedia(formData)
  const validationError = validatePartnerForm(formData, mediaValues)

  if (validationError) {
    return { ok: false, message: validationError }
  }

  const uploadedPaths: UploadedStoragePath[] = []

  try {
    const ownerResolution = await resolvePartnerOwner(formData)

    if (!ownerResolution.ok) {
      return { ok: false, message: ownerResolution.message }
    }

    const basePayload = {
      ...parsePartnerPayload(formData, isUpdate),
      owner_id: ownerResolution.ownerId,
    }
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
      discover_card_image_url: media.discoverCardUrl,
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

    const partnerSocials = parsePartnerSocials(formData)
    const partnerSocialValidation = validatePartnerSocials(partnerSocials)

    if (partnerSocialValidation) {
      if (!isUpdate) {
        await rollbackCreatedPartner(supabase, partnerId)
        await cleanupUploadedFiles(supabase, uploadedPaths)
      }

      return { ok: false, message: partnerSocialValidation }
    }

    const socialSyncMessage = await replacePartnerSocials(
      supabase,
      partnerId,
      partnerSocials,
    )

    if (socialSyncMessage) {
      if (!isUpdate) {
        await rollbackCreatedPartner(supabase, partnerId)
        await cleanupUploadedFiles(supabase, uploadedPaths)
      }

      return { ok: false, message: socialSyncMessage }
    }

    const oldMediaUrls = [
      ...mediaValues.removedMediaUrls,
      ...(mediaValues.logoFile && mediaValues.existingLogoUrl
        ? [mediaValues.existingLogoUrl]
        : []),
      ...(mediaValues.featureFile && mediaValues.existingFeatureCardUrl
        ? [mediaValues.existingFeatureCardUrl]
        : []),
      ...(mediaValues.discoverFile && mediaValues.existingDiscoverCardUrl
        ? [mediaValues.existingDiscoverCardUrl]
        : []),
    ]
    if (oldMediaUrls.length) {
      after(() => cleanupPublicMediaUrls(supabase, oldMediaUrls))
    }

    const warnings: string[] = []
    const ownerWarning = await markOwnerAsPartner(supabase, payload.owner_id)

    if (ownerWarning) {
      warnings.push(ownerWarning)
    }

    if (!isUpdate) {
      const initialMilestones = parseInitialMilestones(formData, partnerId)
      const initialMilestoneError = validateInitialMilestones(initialMilestones)

      if (initialMilestoneError) {
        await rollbackCreatedPartner(supabase, partnerId)
        await cleanupUploadedFiles(supabase, uploadedPaths)
        return { ok: false, message: initialMilestoneError }
      }

      const milestoneRows = initialMilestones.map((milestone) => ({
        ...milestone,
        created_at: basePayload.updated_at,
        updated_at: basePayload.updated_at,
      }))
      const milestoneResult = await supabase
        .from("partner_reward_milestones")
        .insert(milestoneRows)

      if (milestoneResult.error) {
        await rollbackCreatedPartner(supabase, partnerId)
        await cleanupUploadedFiles(supabase, uploadedPaths)
        return { ok: false, message: milestoneResult.error.message }
      }

      const openingHours = parseWeeklyOpeningHourRows(formData, partnerId)
      const openingHoursError = invalidWeeklyOpeningHourRow(openingHours)
      const openingHoursValidation = validateOpeningHourRows(openingHours)

      if (openingHoursError) {
        await rollbackCreatedPartner(supabase, partnerId)
        await cleanupUploadedFiles(supabase, uploadedPaths)
        return {
          ok: false,
          message: `${weekdayName(openingHoursError.weekday)} needs opening and closing times, or mark it closed.`,
        }
      }

      if (openingHoursValidation) {
        await rollbackCreatedPartner(supabase, partnerId)
        await cleanupUploadedFiles(supabase, uploadedPaths)
        return { ok: false, message: openingHoursValidation }
      }

      const hoursResult = await supabase
        .from("partner_opening_hours")
        .insert(openingHours)

      if (hoursResult.error) {
        await rollbackCreatedPartner(supabase, partnerId)
        await cleanupUploadedFiles(supabase, uploadedPaths)
        return { ok: false, message: hoursResult.error.message }
      }

      const holidays = parsePartnerHolidays(formData, partnerId)
      const holidayError = validatePartnerHolidays(holidays)

      if (holidayError) {
        warnings.push(`Partner was created, but holiday hour exceptions were skipped: ${holidayError}`)
      } else if (holidays.length > 0) {
        const holidayResult = await supabase.from("partner_holidays").insert(
          holidays.map((holiday) => ({
            ...holiday,
            created_at: basePayload.updated_at,
            updated_at: basePayload.updated_at,
          })),
        )

        if (holidayResult.error) {
          warnings.push(
            `Partner was created, but holiday hour exceptions could not be added: ${holidayResult.error.message}`,
          )
        }
      }

      if (
        partnerTypeSupportsMenu(stringValue(formData, "type")) &&
        checkboxValue(formData, "initial_menu_enabled")
      ) {
        const initialMenuWarning = await createInitialMenu(
          supabase,
          formData,
          partnerId,
        )

        if (initialMenuWarning) {
          warnings.push(`Partner was created, but ${initialMenuWarning}`)
        }
      }

      const initialDeals = parseInitialDeals(formData, partnerId)
      const initialDealError = initialDeals
        .map(validateDealPayload)
        .find(Boolean)
      const initialDealPriorityError =
        validateUniqueInitialAutomaticDealPriorities(initialDeals)

      if (initialDealError) {
        warnings.push(
          `Partner was created, but deals were skipped: ${initialDealError}`,
        )
      } else if (initialDealPriorityError) {
        warnings.push(
          `Partner was created, but deals were skipped: ${initialDealPriorityError}`,
        )
      } else if (initialDeals.length > 0) {
        const dealMessage = await insertDeals(supabase, initialDeals)

        if (dealMessage) {
          warnings.push(
            `Partner was created, but deals could not be added: ${dealMessage}`,
          )
        }
      }
    }

    revalidatePath("/")

    return {
      ok: true,
      partnerId,
      created: !isUpdate,
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

  const cleanupResult = await collectPartnerDeletionMediaUrls(supabase, id)

  if (cleanupResult.error) {
    return { ok: false, message: cleanupResult.error }
  }

  const visitLinkResetResult = await supabase
    .from("visits")
    .update({
      applied_fallback_deal_id: null,
      deal_selection_id: null,
      qr_token_id: null,
      selected_direct_deal_id: null,
    })
    .eq("partner_id", id)

  if (visitLinkResetResult.error) {
    return { ok: false, message: visitLinkResetResult.error.message }
  }

  const qrTokenLinkResetResult = await supabase
    .from("qr_tokens")
    .update({
      deal_selection_id: null,
      used_for_visit_id: null,
    })
    .eq("partner_id", id)

  if (qrTokenLinkResetResult.error) {
    return { ok: false, message: qrTokenLinkResetResult.error.message }
  }

  const deletionSteps: Array<{
    message: string
    run: () => PromiseLike<{ error: { message: string } | null }>
  }> = [
    {
      message: "Unable to remove partner notifications.",
      run: () => supabase.from("app_notifications").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove streak rewards.",
      run: () => supabase.from("user_streak_rewards").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove streak shields.",
      run: () =>
        supabase
          .from("user_streak_shields")
          .delete()
          .or(`partner_id.eq.${id},used_for_partner_id.eq.${id}`),
    },
    {
      message: "Unable to remove redemption benefits.",
      run: () =>
        supabase
          .from("redemption_applied_benefits")
          .delete()
          .eq("partner_id", id),
    },
    {
      message: "Unable to remove redemption reversals.",
      run: () =>
        supabase.from("redemption_reversals").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove deal redemptions.",
      run: () => supabase.from("deal_redemptions").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove QR tokens.",
      run: () => supabase.from("qr_tokens").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove visits.",
      run: () => supabase.from("visits").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove deal selections.",
      run: () => supabase.from("deal_selections").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove stamp cards.",
      run: () => supabase.from("stamp_cards").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove user partner stats.",
      run: () =>
        supabase.from("user_partner_stats").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove user challenges.",
      run: () => supabase.from("user_challenges").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove menu items.",
      run: () =>
        cleanupResult.menuIds.length
          ? supabase.from("menu_items").delete().in("menu_id", cleanupResult.menuIds)
          : Promise.resolve({ error: null }),
    },
    {
      message: "Unable to remove menu categories.",
      run: () =>
        cleanupResult.menuIds.length
          ? supabase
              .from("menu_categories")
              .delete()
              .in("menu_id", cleanupResult.menuIds)
          : Promise.resolve({ error: null }),
    },
    {
      message: "Unable to remove menus.",
      run: () => supabase.from("menus").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove partner locations.",
      run: () =>
        supabase.from("partner_locations").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove partner staff.",
      run: () => supabase.from("partner_staff").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove partner social profiles.",
      run: () =>
        supabase.from("partner_socials").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove partner holidays.",
      run: () =>
        supabase.from("partner_holidays").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove partner operating hours.",
      run: () =>
        supabase.from("partner_opening_hours").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove partner milestones.",
      run: () =>
        supabase
          .from("partner_reward_milestones")
          .delete()
          .eq("partner_id", id),
    },
    {
      message: "Unable to remove partner microsites.",
      run: () => supabase.from("microsites").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove partner deals.",
      run: () => supabase.from("deals").delete().eq("partner_id", id),
    },
    {
      message: "Unable to remove the partner.",
      run: () => supabase.from("partners").delete().eq("id", id),
    },
  ]

  for (const step of deletionSteps) {
    const result = await step.run()

    if (result.error) {
      return { ok: false, message: `${step.message} ${result.error.message}` }
    }
  }

  if (cleanupResult.mediaUrls.length) {
    after(() => cleanupPublicMediaUrls(supabase, cleanupResult.mediaUrls))
  }

  revalidatePath("/")

  return { ok: true, message: "Partner and all attached data removed." }
}

export async function saveDeal(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const now = new Date().toISOString()
  let payload: ParsedDeal

  try {
    payload = parseDealPayload(formData, "", stringValue(formData, "partner_id"))
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to parse deal form.",
    }
  }

  if (id) {
    const preservationMessage = await preserveExistingDealCopy(
      supabase,
      id,
      formData,
      "",
      payload,
    )

    if (preservationMessage) {
      return { ok: false, message: preservationMessage }
    }
  }

  const validationMessage = validateDealPayload(payload)

  if (validationMessage) {
    return { ok: false, message: validationMessage }
  }

  const priorityMessage = await validateUniqueAutomaticDealPriority(
    supabase,
    payload,
    id,
  )

  if (priorityMessage) {
    return { ok: false, message: priorityMessage }
  }

  // Handle deal drop card image
  const dealDropImageFile = fileValue(formData, "deal_drop_image_file")
  const existingDealDropImageUrl = stringValue(
    formData,
    "existing_deal_drop_image_url",
  )
  const removeDealDropImage = checkboxValue(formData, "remove_deal_drop_image")
  // removed_media_urls is populated by MediaUploadField when user hits remove
  const removedMediaUrls = stringListValue(formData, "removed_media_urls")
  let dealDropImageUrl: string | null = existingDealDropImageUrl || null

  if (dealDropImageFile) {
    const mediaError = validateMediaFile(dealDropImageFile)

    if (mediaError) {
      return { ok: false, message: mediaError }
    }

    const dealId = id || "new"
    const partnerId = payload.partner_id
    const uploaded = await uploadPartnerFile(
      supabase,
      dealDropImageFile,
      partnerMediaSpecs.dealDrop,
      `deal-drops/${partnerId}/${dealId}-${Date.now()}-${safeFileName(dealDropImageFile.name)}`,
    )
    dealDropImageUrl = uploaded.url
  } else if (removeDealDropImage) {
    dealDropImageUrl = null
  }

  // Merge deal drop image URL into metadata
  const dealMetadata = metadataRecord(payload.metadata)

  if (dealDropImageUrl) {
    dealMetadata.card_image_url = dealDropImageUrl
  } else {
    delete dealMetadata.card_image_url
  }

  const mutationPayload = {
    ...payload,
    metadata: dealMetadata,
    updated_at: now,
    ...(id ? {} : { created_at: now }),
  }
  const mutationMessage = id
    ? await updateDeal(supabase, id, mutationPayload)
    : await insertDeals(supabase, [mutationPayload])

  if (mutationMessage) {
    return { ok: false, message: mutationMessage }
  }

  // Clean up replaced or removed deal drop images.
  // existingDealDropImageUrl covers the replace case (new file uploaded over old one).
  // removedMediaUrls covers the remove case (user hit remove without uploading a new file).
  const urlsToCleanup = [
    ...(existingDealDropImageUrl && existingDealDropImageUrl !== dealDropImageUrl
      ? [existingDealDropImageUrl]
      : []),
    ...removedMediaUrls.filter((url) => url !== dealDropImageUrl),
  ]

  if (urlsToCleanup.length > 0) {
    after(() => cleanupPublicMediaUrls(supabase, urlsToCleanup))
  }

  revalidatePath("/")

  return {
    ok: true,
    message: id ? "Deal updated." : "Deal added.",
  }
}

export async function saveRewardMilestone(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const now = new Date().toISOString()
  const payload = parseMilestonePayload(formData)
  const validationMessage = validateMilestonePayload(payload)

  if (validationMessage) {
    return { ok: false, message: validationMessage }
  }

  const mutationPayload = {
    ...payload,
    updated_at: now,
    ...(id ? {} : { created_at: now }),
  }
  const result = id
    ? await supabase
        .from("partner_reward_milestones")
        .update(mutationPayload)
        .eq("id", id)
    : await supabase.from("partner_reward_milestones").insert(mutationPayload)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")

  return {
    ok: true,
    message: id ? "Milestone updated." : "Milestone added.",
  }
}

export async function deleteRewardMilestone(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Milestone id is required." }
  }

  const result = await supabase
    .from("partner_reward_milestones")
    .delete()
    .eq("id", id)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")

  return { ok: true, message: "Milestone removed." }
}

export async function savePartnerStaff(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const now = new Date().toISOString()
  const payload = parsePartnerStaffPayload(formData)
  const validationMessage = validatePartnerStaffPayload(payload)

  if (validationMessage) {
    return { ok: false, message: validationMessage }
  }

  const mutationPayload = {
    ...payload,
    updated_at: now,
    ...(id ? {} : { created_at: now }),
  }
  const result = id
    ? await supabase.from("partner_staff").update(mutationPayload).eq("id", id)
    : await supabase.from("partner_staff").insert(mutationPayload)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")

  return {
    ok: true,
    message: id ? "Staff access updated." : "Staff access added.",
  }
}

export async function deletePartnerStaff(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Staff access id is required." }
  }

  const result = await supabase.from("partner_staff").delete().eq("id", id)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")

  return { ok: true, message: "Staff access removed." }
}

export async function saveOpeningHour(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const payload = parseOpeningHourPayload(formData)
  const validationMessage = validateOpeningHourPayload(payload)

  if (validationMessage) {
    return { ok: false, message: validationMessage }
  }

  const result = id
    ? await supabase.from("partner_opening_hours").update(payload).eq("id", id)
    : await supabase.from("partner_opening_hours").insert(payload)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")

  return {
    ok: true,
    message: id ? "Opening hours updated." : "Opening hours added.",
  }
}

export async function deleteOpeningHour(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Opening hour id is required." }
  }

  const result = await supabase.from("partner_opening_hours").delete().eq("id", id)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")

  return { ok: true, message: "Opening hours removed." }
}

export async function saveWeeklyOpeningHours(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const partnerId = stringValue(formData, "partner_id")

  if (!partnerId) {
    return { ok: false, message: "Opening hours must be attached to a partner." }
  }

  const rows = parseWeeklyOpeningHourRows(formData, partnerId)
  const invalidRow = invalidWeeklyOpeningHourRow(rows)
  const holidays = parsePartnerHolidays(formData, partnerId)
  const holidayValidation = validatePartnerHolidays(holidays)

  if (invalidRow) {
    return {
      ok: false,
      message: `${weekdayName(invalidRow.weekday)} needs opening and closing times, or mark it closed.`,
    }
  }

  const openingHourValidation = validateOpeningHourRows(rows)

  if (openingHourValidation) {
    return { ok: false, message: openingHourValidation }
  }

  if (holidayValidation) {
    return { ok: false, message: holidayValidation }
  }

  const deleteResult = await supabase
    .from("partner_opening_hours")
    .delete()
    .eq("partner_id", partnerId)

  if (deleteResult.error) {
    return { ok: false, message: deleteResult.error.message }
  }

  const insertResult = await supabase.from("partner_opening_hours").insert(rows)

  if (insertResult.error) {
    return { ok: false, message: insertResult.error.message }
  }

  const holidayMessage = await replacePartnerHolidays(
    supabase,
    partnerId,
    holidays,
  )

  if (holidayMessage) {
    revalidatePath("/")
    return {
      ok: false,
      message: `Weekly hours saved, but holiday hour exceptions could not be updated: ${holidayMessage}`,
    }
  }

  revalidatePath("/")

  return { ok: true, message: "Operating hours and holiday exceptions saved." }
}

export async function saveMenu(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const now = new Date().toISOString()
  const payload = parseMenuPayload(formData)
  const validationMessage = validateMenuPayload(payload)
  const importFiles = id ? [] : fileValues(formData, "menu_file")
  const expectedImportFileCount = id
    ? 0
    : integerValue(formData, "expected_menu_file_count") ?? 0
  const confirmedImportSignature = stringValue(
    formData,
    "confirm_import_signature",
  )

  if (validationMessage) {
    return { ok: false, message: validationMessage }
  }

  if (expectedImportFileCount > 0 && importFiles.length === 0) {
    return {
      ok: false,
      message:
        "The selected menu files did not reach the server. No menu was created; select the files again and retry.",
    }
  }

  if (importFiles.some(isZipImportFile)) {
    const zipPrepared = await readMenuZipFiles(importFiles.filter(isZipImportFile))
    if (zipPrepared.signature !== confirmedImportSignature) {
      return zipImportPreviewState(zipPrepared)
    }
  }

  let targetMenuId = id
  let reusedExistingMenu = false

  if (!targetMenuId) {
    const existingMenuResult = await supabase
      .from("menus")
      .select("id")
      .eq("partner_id", payload.partner_id)
      .order("created_at", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (existingMenuResult.error) {
      return { ok: false, message: existingMenuResult.error.message }
    }

    targetMenuId = existingMenuResult.data?.id ?? ""
    reusedExistingMenu = Boolean(targetMenuId)
  }

  const mutationPayload = {
    ...payload,
    updated_at: now,
    ...(targetMenuId ? {} : { created_at: now }),
  }
  const result = targetMenuId
    ? await supabase.from("menus").update(mutationPayload).eq("id", targetMenuId).select("id").single()
    : await supabase.from("menus").insert(mutationPayload).select("id").single()

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  const menuId = result.data.id
  const createdMenu = !targetMenuId

  if (importFiles.length) {
    const importResult = await importMenuIntoMenu(
      supabase,
      menuId,
      "append",
      importFiles,
      confirmedImportSignature,
    )

    if (!importResult.ok) {
      if (createdMenu) {
        await supabase.from("menus").delete().eq("id", menuId)
      }
      return {
        ok: false,
        message: `${createdMenu ? "The menu was not created" : "The existing menu was not populated"} because the import failed: ${importResult.message}`,
      }
    }

    revalidatePath("/")
    revalidatePath("/menu-approvals")
    return {
      ...importResult,
      menuId,
      message: `${createdMenu ? "Menu added" : "Menu updated"}. ${importResult.message}`,
    }
  }

  revalidatePath("/")
  revalidatePath("/menu-approvals")

  return {
    ok: true,
    message: id || reusedExistingMenu ? "Menu updated." : "Menu added.",
    menuId,
  }
}

export async function reorderMenuCategories(
  menuId: string,
  orderedIds: string[],
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const ids = uniqueOrderedIds(orderedIds)

  if (!menuId) {
    return { ok: false, message: "Menu id is required." }
  }

  if (!ids.length) {
    return { ok: false, message: "Choose at least one category to reorder." }
  }

  const message = await updateSortOrderRows(
    supabase,
    "menu_categories",
    "menu_id",
    menuId,
    ids,
  )

  if (message) {
    return { ok: false, message }
  }

  revalidatePath("/")

  return { ok: true, message: "Category order saved." }
}

export async function reorderMenuItems(
  menuId: string,
  orderedIds: string[],
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const ids = uniqueOrderedIds(orderedIds)

  if (!menuId) {
    return { ok: false, message: "Menu id is required." }
  }

  if (!ids.length) {
    return { ok: false, message: "Choose at least one item to reorder." }
  }

  const message = await updateSortOrderRows(
    supabase,
    "menu_items",
    "menu_id",
    menuId,
    ids,
  )

  if (message) {
    return { ok: false, message }
  }

  revalidatePath("/")

  return { ok: true, message: "Item order saved." }
}

export async function approveMenu(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Menu id is required." }
  }

  const result = await supabase
    .from("menus")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", id)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  revalidatePath("/")
  revalidatePath("/menu-approvals")

  return { ok: true, message: "Menu approved and published." }
}

export async function deleteMenu(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Menu id is required." }
  }

  const [itemMediaResult, categoryMediaResult] = await Promise.all([
    supabase.from("menu_items").select("image_url").eq("menu_id", id),
    supabase.from("menu_categories").select("image_url").eq("menu_id", id),
  ])

  if (itemMediaResult.error || categoryMediaResult.error) {
    return {
      ok: false,
      message:
        itemMediaResult.error?.message ||
        categoryMediaResult.error?.message ||
        "Unable to inspect menu media before deletion.",
    }
  }

  const itemsResult = await supabase.from("menu_items").delete().eq("menu_id", id)

  if (itemsResult.error) {
    return { ok: false, message: itemsResult.error.message }
  }

  const categoriesResult = await supabase
    .from("menu_categories")
    .delete()
    .eq("menu_id", id)

  if (categoriesResult.error) {
    return { ok: false, message: categoriesResult.error.message }
  }

  const menuResult = await supabase.from("menus").delete().eq("id", id)

  if (menuResult.error) {
    return { ok: false, message: menuResult.error.message }
  }

  const menuImageUrls = collectNonEmptyStrings([
    ...(itemMediaResult.data ?? []).map((row) => row.image_url),
    ...(categoryMediaResult.data ?? []).map((row) => row.image_url),
  ])
  if (menuImageUrls.length) {
    after(() => cleanupPublicMediaUrls(supabase, menuImageUrls))
  }

  revalidatePath("/")

  return { ok: true, message: "Menu removed." }
}

export async function saveMenuCategory(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const imageFile = fileValue(formData, "image_file")
  const existingImageUrl = stringValue(formData, "existing_image_url")
  const removeImage = checkboxValue(formData, "remove_image")
  const uploadedPaths: UploadedStoragePath[] = []
  const oldImageUrlsToCleanup: string[] = []
  let imageUrl = removeImage ? null : existingImageUrl || null
  const menuId = stringValue(formData, "menu_id")

  if (imageFile) {
    const mediaError = validateMediaFile(imageFile)

    if (mediaError) return { ok: false, message: mediaError }
    if (!menuId) {
      return { ok: false, message: "A menu category must be attached to a menu." }
    }
    try {
      const uploaded = await uploadPartnerFile(
        supabase,
        imageFile,
        partnerMediaSpecs.menuCategory,
        `menu-categories/${menuId}/${Date.now()}-${safeFileName(imageFile.name)}`,
      )
      imageUrl = uploaded.url
      uploadedPaths.push(uploaded)
      if (existingImageUrl) oldImageUrlsToCleanup.push(existingImageUrl)
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to upload the menu category image.",
      }
    }
  } else if (removeImage && existingImageUrl) {
    oldImageUrlsToCleanup.push(existingImageUrl)
  }

  const payload = parseMenuCategoryPayload(formData, imageUrl)
  const validationMessage = validateMenuCategoryPayload(payload)

  if (validationMessage) {
    await cleanupUploadedFiles(supabase, uploadedPaths)
    return { ok: false, message: validationMessage }
  }

  const positionMessage = await resolveMenuCategoryPosition(
    supabase,
    payload,
    id,
  )

  if (positionMessage) {
    await cleanupUploadedFiles(supabase, uploadedPaths)
    return { ok: false, message: positionMessage }
  }

  const result = id
    ? await supabase
        .from("menu_categories")
        .update(payload)
        .eq("id", id)
        .select("id,menu_id,name,slug,image_url,sort_order")
        .single()
    : await supabase
        .from("menu_categories")
        .insert(payload)
        .select("id,menu_id,name,slug,image_url,sort_order")
        .single()

  if (result.error) {
    await cleanupUploadedFiles(supabase, uploadedPaths)
    return { ok: false, message: result.error.message }
  }

  if (oldImageUrlsToCleanup.length) {
    after(() => cleanupPublicMediaUrls(supabase, oldImageUrlsToCleanup))
  }

  return {
    ok: true,
    message: id ? "Menu category updated." : "Menu category added.",
    menuCategory: result.data ?? undefined,
  }
}

export async function deleteMenuCategory(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Menu category id is required." }
  }

  const [existingResult, itemMediaResult] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("image_url")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("menu_items")
      .select("image_url")
      .eq("category_id", id),
  ])

  if (existingResult.error) {
    return { ok: false, message: existingResult.error.message }
  }

  if (itemMediaResult.error) {
    return { ok: false, message: itemMediaResult.error.message }
  }

  const itemsResult = await supabase
    .from("menu_items")
    .delete()
    .eq("category_id", id)

  if (itemsResult.error) {
    return { ok: false, message: itemsResult.error.message }
  }

  const categoryResult = await supabase
    .from("menu_categories")
    .delete()
    .eq("id", id)

  if (categoryResult.error) {
    return { ok: false, message: categoryResult.error.message }
  }

  const imageUrls = collectNonEmptyStrings([
    existingResult.data?.image_url,
    ...(itemMediaResult.data ?? []).map((item) => item.image_url),
  ])
  if (imageUrls.length) {
    after(() => cleanupPublicMediaUrls(supabase, imageUrls))
  }

  return {
    ok: true,
    message: "Menu category and its items removed.",
    deletedId: id,
  }
}

export async function saveMenuItem(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const now = new Date().toISOString()
  const imageFile = fileValue(formData, "image_file")
  const existingImageUrl = stringValue(formData, "existing_image_url")
  const removeImage = checkboxValue(formData, "remove_image")
  const uploadedPaths: UploadedStoragePath[] = []
  const oldImageUrlsToCleanup: string[] = []
  let imageUrl = removeImage ? null : existingImageUrl || null
  const menuId = stringValue(formData, "menu_id")

  if (imageFile) {
    const mediaError = validateMediaFile(imageFile)

    if (mediaError) {
      return { ok: false, message: mediaError }
    }

    if (!menuId) {
      return { ok: false, message: "A menu item must be attached to a menu." }
    }

    try {
      const uploaded = await uploadPartnerFile(
        supabase,
        imageFile,
        partnerMediaSpecs.menuItem,
        `menu-items/${menuId}/${Date.now()}-${safeFileName(imageFile.name)}`,
      )
      imageUrl = uploaded.url
      uploadedPaths.push(uploaded)
      if (existingImageUrl) oldImageUrlsToCleanup.push(existingImageUrl)
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to upload the menu item image.",
      }
    }
  } else if (removeImage && existingImageUrl) {
    oldImageUrlsToCleanup.push(existingImageUrl)
  }

  const payload = parseMenuItemPayload(formData, imageUrl)
  const validationMessage = validateMenuItemPayload(payload)

  if (validationMessage) {
    await cleanupUploadedFiles(supabase, uploadedPaths)
    return { ok: false, message: validationMessage }
  }

  const positionMessage = await resolveMenuItemPosition(
    supabase,
    payload,
    id,
  )

  if (positionMessage) {
    await cleanupUploadedFiles(supabase, uploadedPaths)
    return { ok: false, message: positionMessage }
  }

  const mutationPayload = {
    ...payload,
    updated_at: now,
    ...(id ? {} : { created_at: now }),
  }
  const result = id
    ? await supabase
        .from("menu_items")
        .update(mutationPayload)
        .eq("id", id)
        .select("id,menu_id,category_id,name,description,price,currency,image_url,tags,allergens,addons,is_popular,is_stamp_eligible,sort_order")
        .single()
    : await supabase
        .from("menu_items")
        .insert(mutationPayload)
        .select("id,menu_id,category_id,name,description,price,currency,image_url,tags,allergens,addons,is_popular,is_stamp_eligible,sort_order")
        .single()

  if (result.error) {
    await cleanupUploadedFiles(supabase, uploadedPaths)
    return { ok: false, message: result.error.message }
  }

  if (oldImageUrlsToCleanup.length) {
    after(() => cleanupPublicMediaUrls(supabase, oldImageUrlsToCleanup))
  }

  return {
    ok: true,
    message: id ? "Menu item updated." : "Menu item added.",
    menuItem: result.data ?? undefined,
  }
}

export async function saveMenuCategoryImage(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const menuId = stringValue(formData, "menu_id")
  const imageFile = fileValue(formData, "image_file")

  if (!id || !menuId || !imageFile) {
    return { ok: false, message: "A saved menu category and image are required." }
  }
  const mediaError = validateMediaFile(imageFile)
  if (mediaError) return { ok: false, message: mediaError }

  const existingResult = await supabase
    .from("menu_categories")
    .select("image_url")
    .eq("id", id)
    .eq("menu_id", menuId)
    .maybeSingle()
  if (existingResult.error || !existingResult.data) {
    return { ok: false, message: existingResult.error?.message ?? "Menu category not found." }
  }
  const previousImageUrl = existingResult.data.image_url

  let uploaded: (UploadedStoragePath & { url: string }) | null = null
  try {
    uploaded = await uploadPartnerFile(
      supabase,
      imageFile,
      partnerMediaSpecs.menuCategory,
      `menu-categories/${menuId}/${Date.now()}-${safeFileName(imageFile.name)}`,
    )
    const result = await supabase
      .from("menu_categories")
      .update({ image_url: uploaded.url })
      .eq("id", id)
      .eq("menu_id", menuId)
      .select("id,menu_id,name,slug,image_url,sort_order")
      .single()
    if (result.error) {
      await cleanupUploadedFiles(supabase, [uploaded])
      return { ok: false, message: result.error.message }
    }
    if (previousImageUrl) {
      after(() => cleanupPublicMediaUrls(supabase, [previousImageUrl]))
    }
    revalidatePath("/")
    revalidatePath("/menu-approvals")
    return {
      ok: true,
      message: "Menu category image uploaded.",
      menuCategory: result.data ?? undefined,
    }
  } catch (error) {
    if (uploaded) await cleanupUploadedFiles(supabase, [uploaded])
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to upload the menu category image.",
    }
  }
}

export async function saveMenuItemImage(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")
  const menuId = stringValue(formData, "menu_id")
  const imageFile = fileValue(formData, "image_file")

  if (!id || !menuId || !imageFile) {
    return { ok: false, message: "A saved menu item and image are required." }
  }
  const mediaError = validateMediaFile(imageFile)
  if (mediaError) return { ok: false, message: mediaError }

  const existingResult = await supabase
    .from("menu_items")
    .select("image_url")
    .eq("id", id)
    .eq("menu_id", menuId)
    .maybeSingle()
  if (existingResult.error || !existingResult.data) {
    return { ok: false, message: existingResult.error?.message ?? "Menu item not found." }
  }
  const previousImageUrl = existingResult.data.image_url

  let uploaded: (UploadedStoragePath & { url: string }) | null = null
  try {
    uploaded = await uploadPartnerFile(
      supabase,
      imageFile,
      partnerMediaSpecs.menuItem,
      `menu-items/${menuId}/${Date.now()}-${safeFileName(imageFile.name)}`,
    )
    const result = await supabase
      .from("menu_items")
      .update({ image_url: uploaded.url, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("menu_id", menuId)
      .select("id,menu_id,category_id,name,description,price,currency,image_url,tags,allergens,addons,is_popular,is_stamp_eligible,sort_order")
      .single()
    if (result.error) {
      await cleanupUploadedFiles(supabase, [uploaded])
      return { ok: false, message: result.error.message }
    }
    if (previousImageUrl) {
      after(() => cleanupPublicMediaUrls(supabase, [previousImageUrl]))
    }
    revalidatePath("/")
    revalidatePath("/menu-approvals")
    return {
      ok: true,
      message: "Menu item image uploaded.",
      menuItem: result.data ?? undefined,
    }
  } catch (error) {
    if (uploaded) await cleanupUploadedFiles(supabase, [uploaded])
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to upload the menu item image.",
    }
  }
}

export async function deleteMenuItem(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) {
    return { ok: false, message: "Menu item id is required." }
  }

  const existingResult = await supabase
    .from("menu_items")
    .select("image_url")
    .eq("id", id)
    .maybeSingle()

  if (existingResult.error) {
    return { ok: false, message: existingResult.error.message }
  }

  const result = await supabase.from("menu_items").delete().eq("id", id)

  if (result.error) {
    return { ok: false, message: result.error.message }
  }

  const imageUrl =
    typeof existingResult.data?.image_url === "string"
      ? existingResult.data.image_url
      : ""

  if (imageUrl) {
    after(() => cleanupPublicMediaUrls(supabase, [imageUrl]))
  }

  return { ok: true, message: "Menu item removed.", deletedId: id }
}

export async function duplicateMenuCategory(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const id = stringValue(formData, "id")

  if (!id) return { ok: false, message: "Menu category id is required." }

  const [categoryResult, itemsResult] = await Promise.all([
    supabase.from("menu_categories").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("menu_items")
      .select("*")
      .eq("category_id", id)
      .order("sort_order", { ascending: true }),
  ])

  if (categoryResult.error || !categoryResult.data) {
    return { ok: false, message: categoryResult.error?.message ?? "Menu category not found." }
  }
  if (itemsResult.error) return { ok: false, message: itemsResult.error.message }

  const category = categoryResult.data
  const orderResult = await supabase
    .from("menu_categories")
    .select("sort_order")
    .eq("menu_id", category.menu_id)
  if (orderResult.error) return { ok: false, message: orderResult.error.message }

  const copyResult = await supabase
    .from("menu_categories")
    .insert({
      menu_id: category.menu_id,
      name: `${category.name || "Category"} (copy)`,
      slug: `${category.slug || slugify(category.name || "category")}-copy-${Date.now()}`,
      image_url: category.image_url,
      sort_order: nextAvailableSortOrder(orderResult.data?.map((row) => row.sort_order) ?? []),
    })
    .select("id")
    .single()

  if (copyResult.error) return { ok: false, message: copyResult.error.message }

  const itemCopies = (itemsResult.data ?? []).map((item, index) => {
    const copy = { ...item }
    delete copy.id
    delete copy.created_at
    delete copy.updated_at
    return {
      ...copy,
      category_id: copyResult.data.id,
      sort_order: index,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  })

  if (itemCopies.length) {
    const insertItemsResult = await supabase.from("menu_items").insert(itemCopies)
    if (insertItemsResult.error) {
      await supabase.from("menu_categories").delete().eq("id", copyResult.data.id)
      return { ok: false, message: insertItemsResult.error.message }
    }
  }

  revalidatePath("/")
  return {
    ok: true,
    message: `Category duplicated with ${itemCopies.length} ${itemCopies.length === 1 ? "item" : "items"}.`,
  }
}

export async function importMenuFile(
  _prevState: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { supabase } = await requireAdmin()
  const menuId = stringValue(formData, "menu_id")
  const importMode = stringValue(formData, "import_mode")
  const files = fileValues(formData, "menu_file")
  const confirmedImportSignature = stringValue(
    formData,
    "confirm_import_signature",
  )

  if (!menuId) return { ok: false, message: "A menu is required for import." }
  if (!['append', 'replace', 'update_addons'].includes(importMode)) {
    return { ok: false, message: "Choose whether to append, replace, or update add-ons." }
  }
  if (!files.length) return { ok: false, message: "Choose one or more ZIP, JSON, or CSV files." }

  return importMenuIntoMenu(
    supabase,
    menuId,
    importMode,
    files,
    confirmedImportSignature,
  )
}

async function importMenuIntoMenu(
  supabase: SupabaseClient,
  menuId: string,
  importMode: string,
  files: File[],
  confirmedImportSignature = "",
): Promise<PartnerActionState> {
  const prepared = await prepareMenuImportFiles(files)
  if (
    prepared.zipPreview &&
    prepared.zipPreview.signature !== confirmedImportSignature
  ) {
    return zipImportPreviewState(prepared.zipPreview)
  }
  if (importMode === "update_addons") {
    return updateImportedMenuAddons(supabase, menuId, prepared)
  }
  const uploadedImageUrls = new Set<string>()
  const imageCopyPromises = new Map<string, Promise<string>>()

  const batch = await runMenuImportBatch(prepared, {
    mode: importMode,
    copyImage: async (url: string, context: ImportedImageContext) => {
      const copyKey = `${context.kind}:${url}`
      let copyPromise = imageCopyPromises.get(copyKey)
      if (!copyPromise) {
        const archiveAsset = prepared.imageAssets.get(url)
        copyPromise = archiveAsset
          ? copyImportedArchiveImage(supabase, menuId, archiveAsset, context)
          : copyImportedMenuImage(supabase, menuId, url, context)
        imageCopyPromises.set(copyKey, copyPromise)
      }
      const uploadedUrl = await copyPromise
      uploadedImageUrls.add(uploadedUrl)
      return uploadedUrl
    },
    saveMenu: async (
      menu: { filename: string; categories: ImportedMenuCategory[] },
      mode: string,
    ) => {
      const result = await saveImportedMenuCategories(
        supabase,
        menuId,
        mode,
        menu.categories,
      )
      if (!result.ok) {
        const failedUploadUrls = menu.categories
          .flatMap((category) => [
            category.image_url,
            ...category.items.map((item) => item.image_url),
          ])
          .filter((url): url is string => Boolean(url && uploadedImageUrls.has(url)))
        await cleanupPublicMediaUrls(supabase, failedUploadUrls)
        failedUploadUrls.forEach((url) => uploadedImageUrls.delete(url))
        throw new Error(result.message)
      }
      return {
        importedCategories: result.importedCategories ?? 0,
        importedItems: result.importedItems ?? 0,
        warnings: (result.importWarnings ?? []).map(
          (warning) => `${menu.filename}: ${warning}`,
        ),
      }
    },
  })

  const importedCategories = batch.successes.reduce(
    (total: number, result: { importedCategories?: number }) =>
      total + (result.importedCategories ?? 0),
    0,
  )
  const importedItems = batch.successes.reduce(
    (total: number, result: { importedItems?: number }) =>
      total + (result.importedItems ?? 0),
    0,
  )
  const details = [...batch.errors, ...batch.warnings]
  const summary = batch.successes.length
    ? `Imported ${batch.successes.length} menu file${batch.successes.length === 1 ? "" : "s"}: ${importedCategories} categories and ${importedItems} items.`
    : "No menu files were imported."

  revalidatePath("/")
  revalidatePath("/menu-approvals")
  return {
    ok: batch.successes.length > 0,
    issues: details.length > 0,
    message: [summary, ...details].join("\n"),
    importedCategories,
    importedItems,
  }
}

async function updateImportedMenuAddons(
  supabase: SupabaseClient,
  menuId: string,
  prepared: {
    menus: Array<{ filename: string; categories: ImportedMenuCategory[] }>
    errors: string[]
    warnings?: string[]
  },
): Promise<PartnerActionState> {
  const [categoriesResult, itemsResult] = await Promise.all([
    supabase.from("menu_categories").select("id,name").eq("menu_id", menuId),
    supabase
      .from("menu_items")
      .select("id,category_id,name,description,price,currency,image_url,tags,allergens,is_popular,addons")
      .eq("menu_id", menuId),
  ])
  if (categoriesResult.error || itemsResult.error) {
    return {
      ok: false,
      message:
        categoriesResult.error?.message ||
        itemsResult.error?.message ||
        "Unable to load the existing menu items.",
    }
  }

  const plan = createAddonUpdatePlan(
    prepared.menus,
    categoriesResult.data ?? [],
    itemsResult.data ?? [],
  )
  const applied = await applyMenuItemUpdatePlan(supabase, plan)
  const updatedItems = applied.successfulUpdates.length
  const updatedAddons = applied.successfulUpdates.map((update) => ({
    itemId: update.itemId,
    addons: update.values.addons,
  }))
  const details = [
    ...prepared.errors,
    ...(prepared.warnings ?? []),
    ...plan.warnings,
    ...applied.failures,
  ]
  const addonSummary = `${applied.addonChanges.created} created, ${applied.addonChanges.updated} updated, ${applied.addonChanges.removed} removed`

  return {
    ok: updatedItems > 0,
    issues: details.length > 0,
    importedItems: updatedItems,
    updatedAddons,
    message: [
      updatedItems > 0
        ? `Updated ${updatedItems} existing menu item${updatedItems === 1 ? "" : "s"}. Add-ons: ${addonSummary}.`
        : "No existing menu items were updated. Check that the category and item names match the imported file.",
      ...details,
    ].join("\n"),
  }
}

async function prepareMenuImportFiles(files: File[]) {
  const zipFiles = files.filter(isZipImportFile)
  const jsonFiles = files.filter(
    (file) => !isCsvImportFile(file) && !isZipImportFile(file),
  )
  const prepared = await readMenuImportFiles(jsonFiles)
  const zipPrepared = zipFiles.length
    ? await readMenuZipFiles(zipFiles)
    : null

  if (zipPrepared) {
    prepared.menus.push(...zipPrepared.menus)
    prepared.errors.push(...zipPrepared.errors)
  }
  const warnings = zipPrepared ? [...zipPrepared.warnings] : []
  const imageAssets = zipPrepared?.imageAssets ?? new Map()

  for (const file of files.filter(isCsvImportFile)) {
    try {
      const categories = parseImportedMenuCsv(await file.text())
      if (!categories.length) throw new Error("file does not contain any categories")
      prepared.menus.push(validateMenuDocument({ categories }, file.name))
    } catch (error) {
      prepared.errors.push(
        `${file.name}: ${error instanceof Error ? error.message : "unable to read CSV"}`,
      )
    }
  }

  return {
    ...prepared,
    warnings,
    imageAssets,
    zipPreview: zipPrepared,
  }
}

function zipImportPreviewState(prepared: {
  signature: string
  preview: Omit<NonNullable<PartnerActionState["importPreview"]>, "signature">
}): PartnerActionState {
  const preview = { signature: prepared.signature, ...prepared.preview }
  return {
    ok: false,
    issues: preview.errors.length > 0 || preview.warnings.length > 0,
    message: preview.ready
      ? "ZIP preview is ready. Review the counts and messages, then confirm the import."
      : "The ZIP cannot be imported. Review the validation errors below.",
    importPreview: preview,
  }
}

async function saveImportedMenuCategories(
  supabase: SupabaseClient,
  menuId: string,
  importMode: string,
  imported: ImportedMenuCategory[],
): Promise<PartnerActionState> {
  if (!imported.length) return { ok: false, message: "The file does not contain any categories." }
  const itemCount = imported.reduce((total, category) => total + category.items.length, 0)
  if (imported.length > 200 || itemCount > 2000) {
    return { ok: false, message: "Import up to 200 categories and 2,000 items at a time." }
  }

  for (const [categoryIndex, category] of imported.entries()) {
    const categoryValidation = validateMenuCategoryPayload({
      menu_id: menuId,
      name: category.name,
      slug: slugify(category.name),
      image_url: category.image_url,
      sort_order: categoryIndex,
    })
    if (categoryValidation) return { ok: false, message: categoryValidation }
    for (const item of category.items) {
      const itemValidation = validateMenuItemPayload({
        menu_id: menuId,
        category_id: "pending-import",
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        image_url: item.image_url,
        tags: item.tags,
        allergens: item.allergens,
        addons: item.addons,
        is_popular: item.is_popular,
        is_stamp_eligible: false,
        sort_order: 0,
      })
      if (itemValidation) return { ok: false, message: itemValidation }
    }
  }

  const [categoryOrderResult, existingCategoriesResult, existingItemsResult] = await Promise.all([
    supabase.from("menu_categories").select("sort_order").eq("menu_id", menuId),
    supabase.from("menu_categories").select("id,image_url").eq("menu_id", menuId),
    supabase.from("menu_items").select("id,image_url").eq("menu_id", menuId),
  ])
  if (categoryOrderResult.error || existingCategoriesResult.error || existingItemsResult.error) {
    return {
      ok: false,
      message:
        categoryOrderResult.error?.message ||
        existingCategoriesResult.error?.message ||
        existingItemsResult.error?.message ||
        "Unable to inspect the existing menu.",
    }
  }
  const firstCategoryOrder =
    importMode === "replace"
      ? 1_000_000
      : nextAvailableSortOrder(categoryOrderResult.data?.map((row) => row.sort_order) ?? [])
  const importToken = `${Date.now()}-${randomUUID()}`
  const categoryRows = imported.map((category, categoryIndex) => ({
    menu_id: menuId,
    name: category.name.trim(),
    slug: `${slugify(category.name)}-${importToken}-${categoryIndex}`,
    image_url: category.image_url || null,
    sort_order: firstCategoryOrder + categoryIndex,
  }))
  const invalidCategoryIndex = categoryRows.findIndex((category) => !category.name)
  if (invalidCategoryIndex >= 0) {
    return { ok: false, message: `Category ${invalidCategoryIndex + 1} needs a name.` }
  }

  const categoryInsert = await supabase
    .from("menu_categories")
    .insert(categoryRows)
    .select("id,slug")
  if (categoryInsert.error) return { ok: false, message: categoryInsert.error.message }

  const categoryIdsBySlug = new Map(
    (categoryInsert.data ?? []).map((category) => [category.slug, category.id]),
  )
  const createdCategoryIds = categoryRows
    .map((category) => categoryIdsBySlug.get(category.slug))
    .filter((id): id is string => Boolean(id))
  if (createdCategoryIds.length !== imported.length) {
    if (createdCategoryIds.length) await rollbackImportedMenu(supabase, createdCategoryIds)
    return { ok: false, message: "The imported categories could not be matched after saving." }
  }

  let skippedAddons = 0
  const items = imported.flatMap((category, categoryIndex) =>
    category.items.map((item, itemIndex) => ({
      menu_id: menuId,
      category_id: createdCategoryIds[categoryIndex],
      name: item.name.trim(),
      description: item.description,
      price: item.price,
      currency: item.currency,
      image_url: item.image_url || null,
      tags: item.tags,
      allergens: item.allergens,
      addons: item.addons,
      is_popular: item.is_popular,
      is_stamp_eligible: false,
      sort_order: itemIndex,
    })),
  )
  const invalidItem = items.find((item) => !item.name)
  if (invalidItem) {
    await rollbackImportedMenu(supabase, createdCategoryIds)
    return { ok: false, message: "Every imported menu item needs a name." }
  }
  if (items.length) {
    let itemInsert = await supabase.from("menu_items").insert(items)
    const addonsRetry = itemInsert.error
      ? prepareMissingAddonsRetry(items, itemInsert.error.message)
      : null

    if (addonsRetry?.rows) {
      skippedAddons += addonsRetry.skippedAddons ?? 0
      itemInsert = await supabase.from("menu_items").insert(addonsRetry.rows)
    }
    if (itemInsert.error) {
      await rollbackImportedMenu(supabase, createdCategoryIds)
      return { ok: false, message: itemInsert.error.message }
    }
  }

  if (importMode === "replace") {
    const oldItemIds = (existingItemsResult.data ?? []).map((item) => item.id)
    const oldCategoryIds = (existingCategoriesResult.data ?? []).map((category) => category.id)
    const deleteItemsResult = oldItemIds.length
      ? await supabase.from("menu_items").delete().in("id", oldItemIds)
      : { error: null }
    if (deleteItemsResult.error) {
      await rollbackImportedMenu(supabase, createdCategoryIds)
      return { ok: false, message: deleteItemsResult.error.message }
    }
    const deleteCategoriesResult = oldCategoryIds.length
      ? await supabase.from("menu_categories").delete().in("id", oldCategoryIds)
      : { error: null }
    if (deleteCategoriesResult.error) {
      return { ok: false, message: deleteCategoriesResult.error.message }
    }

    const orderResults = await Promise.all(
      createdCategoryIds.map((id, index) =>
        supabase.from("menu_categories").update({ sort_order: index }).eq("id", id),
      ),
    )
    const orderError = orderResults.find((result) => result.error)?.error
    if (orderError) return { ok: false, message: orderError.message }

    const importedImageUrls = new Set(
      imported.flatMap((category) => [
        category.image_url,
        ...category.items.map((item) => item.image_url),
      ]).filter((url): url is string => Boolean(url)),
    )
    const oldImageUrls = collectNonEmptyStrings([
      ...(existingCategoriesResult.data ?? []).map((category) => category.image_url),
      ...(existingItemsResult.data ?? []).map((item) => item.image_url),
    ]).filter((url) => !importedImageUrls.has(url))
    if (oldImageUrls.length) after(() => cleanupPublicMediaUrls(supabase, oldImageUrls))
  }

  revalidatePath("/")
  revalidatePath("/menu-approvals")
  return {
    ok: true,
    message: `${importMode === "replace" ? "Replaced the menu with" : "Appended"} ${imported.length} categories and ${itemCount} items.`,
    importedCategories: imported.length,
    importedItems: itemCount,
    importWarnings: skippedAddons
      ? [
          `${skippedAddons} add-on${skippedAddons === 1 ? " was" : "s were"} skipped because this database has not applied the existing add_menu_item_addons migration. The menu items were imported successfully.`,
        ]
      : [],
  }
}

type ParsedMenuItemAddon = {
  title: string
  description: string | null
  cost: number
}

type ImportedMenuItem = {
  name: string
  description: string | null
  price: number | null
  currency: string
  image_url: string | null
  tags: string[]
  allergens: string[]
  addons: ParsedMenuItemAddon[]
  is_popular: boolean
}

type ImportedMenuCategory = {
  name: string
  image_url: string | null
  items: ImportedMenuItem[]
}

type ImportedImageContext = {
  filename: string
  category: string
  categoryIndex: number
  item?: string
  itemIndex?: number
  kind: "category" | "item"
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

async function collectPartnerDeletionMediaUrls(
  supabase: SupabaseClient,
  partnerId: string,
) {
  const partnerResult = await supabase
    .from("partners")
    .select(
      "logo_url,feature_card_url,discover_card_image_url,cover_urls",
    )
    .eq("id", partnerId)
    .maybeSingle()

  if (partnerResult.error) {
    return {
      error: partnerResult.error.message,
      mediaUrls: [] as string[],
      menuIds: [] as string[],
    }
  }

  const menuResult = await supabase
    .from("menus")
    .select("id")
    .eq("partner_id", partnerId)

  if (menuResult.error) {
    return {
      error: menuResult.error.message,
      mediaUrls: [] as string[],
      menuIds: [] as string[],
    }
  }

  const menuIds = (menuResult.data ?? [])
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string" && Boolean(value))

  const menuItemResult = menuIds.length
    ? await supabase
        .from("menu_items")
        .select("image_url")
        .in("menu_id", menuIds)
    : { data: [], error: null }

  if (menuItemResult.error) {
    return {
      error: menuItemResult.error.message,
      mediaUrls: [] as string[],
      menuIds: [] as string[],
    }
  }

  const menuCategoryResult = menuIds.length
    ? await supabase
        .from("menu_categories")
        .select("image_url")
        .in("menu_id", menuIds)
    : { data: [], error: null }

  if (menuCategoryResult.error) {
    return {
      error: menuCategoryResult.error.message,
      mediaUrls: [] as string[],
      menuIds: [] as string[],
    }
  }

  const partnerUrls = collectNonEmptyStrings([
    partnerResult.data?.logo_url,
    partnerResult.data?.feature_card_url,
    partnerResult.data?.discover_card_image_url,
    ...stringArrayFromUnknown(partnerResult.data?.cover_urls),
  ])
  const menuItemUrls = collectNonEmptyStrings(
    (menuItemResult.data ?? []).map((row) => row.image_url),
  )

  const menuCategoryUrls = collectNonEmptyStrings(
    (menuCategoryResult.data ?? []).map((row) => row.image_url),
  )

  return {
    error: null,
    mediaUrls: [
      ...new Set([...partnerUrls, ...menuItemUrls, ...menuCategoryUrls]),
    ],
    menuIds,
  }
}

function validatePartnerForm(
  formData: FormData,
  mediaValues: PartnerMediaFormValues,
) {
  const isCreate = !stringValue(formData, "id")
  const requiredFields = [
    ["name", "Partner name is required."],
    ["city_id", "Partner city is required."],
    ["type", "Partner type is required."],
    ["email", "Email is required."],
    ["address", "Address is required."],
    ["coordinates", "Coordinates are required."],
    ["description", "Description is required."],
  ]

  if (
    !stringValue(formData, "owner_id") &&
    !normalizeEmail(stringValue(formData, "new_owner_email"))
  ) {
    return "Choose an existing partner owner or enter a new owner email."
  }

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

  const partnerTextValidation = validateTextLengthRules([
    ["Partner name", stringValue(formData, "name"), adminTextLimits.shortText],
    ["Email", stringValue(formData, "email"), adminTextLimits.email],
    ["Phone", stringValue(formData, "phone"), adminTextLimits.phone],
    ["Website", stringValue(formData, "website"), adminTextLimits.mediumText],
    [
      "Coordinates",
      stringValue(formData, "coordinates"),
      adminTextLimits.coordinates,
    ],
    ["Address", stringValue(formData, "address"), adminTextLimits.mediumText],
    [
      "Description",
      stringValue(formData, "description"),
      adminTextLimits.longText,
    ],
  ])

  if (partnerTextValidation) {
    return partnerTextValidation
  }

  const socialValidation = validatePartnerSocials(parsePartnerSocials(formData))

  if (socialValidation) {
    return socialValidation
  }

  if (isCreate) {
    const initialMilestoneValidation = validateInitialMilestones(
      parseInitialMilestones(formData, "validation"),
    )

    if (initialMilestoneValidation) {
      return initialMilestoneValidation
    }
  }

  if (isCreate || hasWeeklyOpeningHourFields(formData)) {
    const openingHourRows = parseWeeklyOpeningHourRows(formData, "validation")
    const invalidRow = invalidWeeklyOpeningHourRow(openingHourRows)

    if (invalidRow) {
      return `${weekdayName(invalidRow.weekday)} needs opening and closing times, or mark it closed.`
    }

    const openingHourValidation = validateOpeningHourRows(openingHourRows)

    if (openingHourValidation) {
      return openingHourValidation
    }
  }

  const holidayValidation = validatePartnerHolidays(
    parsePartnerHolidays(formData, "validation"),
  )

  if (holidayValidation) {
    return holidayValidation
  }

  if (
    partnerTypeSupportsMenu(stringValue(formData, "type")) &&
    checkboxValue(formData, "initial_menu_enabled")
  ) {
    const menuValidation = validateMenuPayload(
      parseMenuPayload(formData, "validation", "initial_menu_"),
    )

    if (menuValidation) {
      return menuValidation
    }

    const menuStructureValidation = validateInitialMenuStructure(formData)

    if (menuStructureValidation) {
      return menuStructureValidation
    }
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

function validateInitialMenuStructure(formData: FormData) {
  const categoryIds = new Set<string>()
  const categories = parseInitialMenuCategoryPayloads(formData, "validation")

  for (const category of categories) {
    const validationMessage = validateMenuCategoryPayload(category)

    if (validationMessage) {
      return validationMessage
    }

    categoryIds.add(category.draft_id)
  }

  const categoryIdsByDraft = new Map(
    Array.from(categoryIds).map((id) => [id, id] as const),
  )
  const items = parseInitialMenuItemPayloads(
    formData,
    "validation",
    categoryIdsByDraft,
    new Map(),
  )

  for (let index = 0; index < items.length; index += 1) {
    const categoryDraftId = nullableStringValue(
      formData,
      `initial_menu_item_${index}_category_draft_id`,
    )

    if (categoryDraftId && !categoryIds.has(categoryDraftId)) {
      return "Choose a valid category for starter menu items."
    }

    const validationMessage = validateMenuItemPayload(items[index])

    if (validationMessage) {
      return validationMessage
    }
  }

  const mediaError = validateInitialMenuItemImages(formData)

  if (mediaError) {
    return mediaError
  }

  return null
}

function hasWeeklyOpeningHourFields(formData: FormData) {
  return openingWeekdays.some(
    (weekday) =>
      formData.has(`opens_at_${weekday}`) ||
      formData.has(`closes_at_${weekday}`) ||
      formData.has(`is_closed_${weekday}`),
  )
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
  const active =
    stringValue(formData, "save_intent") === "later"
      ? false
      : checkboxValue(formData, "active")
  const stampTarget =
    positiveIntegerValue(formData, "stamp_target") ??
    positiveIntegerValue(formData, "existing_stamp_target") ??
    MAX_STAMP_CARD_STAMPS
  const partnerType = normalizePartnerTypeValue(stringValue(formData, "type"))

  return {
    owner_id: stringValue(formData, "owner_id"),
    city_id: stringValue(formData, "city_id"),
    name,
    slug,
    subdomain,
    short_name: stringValue(formData, "short_name") || createShortName(name),
    description: stringValue(formData, "description"),
    category: listValue(formData, "category"),
    type: partnerType,
    status: active ? "active" : isUpdate ? "paused" : "draft",
    is_featured: checkboxValue(formData, "is_featured"),
    stamp_target: stampTarget,
    loves: isUpdate ? integerValue(formData, "existing_loves") ?? 0 : 0,
    pin: null,
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
  const uploadTime = Date.now()
  const [logoUpload, featureUpload, discoverUpload, ...coverUploads] =
    await Promise.all([
      mediaValues.logoFile
        ? uploadPartnerFile(
            supabase,
            mediaValues.logoFile,
            partnerMediaSpecs.logo,
            `${partnerId}/logo-${uploadTime}-${safeFileName(mediaValues.logoFile.name)}`,
          )
        : Promise.resolve(null),
      mediaValues.featureFile
        ? uploadPartnerFile(
            supabase,
            mediaValues.featureFile,
            partnerMediaSpecs.feature,
            `${partnerId}/feature-${uploadTime}-${safeFileName(mediaValues.featureFile.name)}`,
          )
        : Promise.resolve(null),
      mediaValues.discoverFile
        ? uploadPartnerFile(
            supabase,
            mediaValues.discoverFile,
            partnerMediaSpecs.discover,
            `${partnerId}/discover-${uploadTime}-${safeFileName(mediaValues.discoverFile.name)}`,
          )
        : Promise.resolve(null),
      ...mediaValues.coverFiles.map((coverFile, index) =>
        uploadPartnerFile(
          supabase,
          coverFile,
          partnerMediaSpecs.cover,
          `${partnerId}/covers/${slug}-${uploadTime}-${index}-${safeFileName(coverFile.name)}`,
        ),
      ),
    ])
  const uploadedPaths: UploadedStoragePath[] = [
    logoUpload,
    featureUpload,
    discoverUpload,
    ...coverUploads,
  ].flatMap((upload) => (upload ? [upload] : []))
  const logoUrl =
    logoUpload?.url ??
    (mediaValues.removedMediaUrls.includes(mediaValues.existingLogoUrl)
      ? ""
      : mediaValues.existingLogoUrl)
  const featureCardUrl =
    featureUpload?.url ??
    (mediaValues.removedMediaUrls.includes(mediaValues.existingFeatureCardUrl)
      ? ""
      : mediaValues.existingFeatureCardUrl)
  const discoverCardUrl =
    discoverUpload?.url ??
    (mediaValues.removedMediaUrls.includes(mediaValues.existingDiscoverCardUrl)
      ? ""
      : mediaValues.existingDiscoverCardUrl)
  const fallbackOrder = [
    ...mediaValues.existingCoverUrls.map((_, index) => `existing:${index}`),
    ...coverUploads.map((_, index) => `upload:${index}`),
  ]
  const coverUrls = (mediaValues.coverOrder.length
    ? mediaValues.coverOrder
    : fallbackOrder
  ).flatMap((token) => {
    const [kind, rawIndex] = token.split(":")
    const index = Number(rawIndex)
    const url =
      kind === "existing"
        ? mediaValues.existingCoverUrls[index]
        : kind === "upload"
          ? coverUploads[index]?.url
          : undefined

    return url ? [url] : []
  })

  return {
    logoUrl,
    featureCardUrl,
    discoverCardUrl,
    coverUrls: coverUrls.slice(0, MAX_COVERS),
    uploadedPaths,
  }
}

async function uploadPartnerFile(
  supabase: SupabaseClient,
  file: File,
  spec: PartnerMediaSpec,
  path: string,
) {
  const preparedFile = await preparePartnerUploadFile(file, spec)
  const { data, error } = await supabase.storage
    .from(PARTNER_MEDIA_BUCKET)
    .upload(path, preparedFile, {
      cacheControl: "31536000",
      contentType:
        partnerMediaContentType(preparedFile) ?? "application/octet-stream",
      upsert: false,
    })

  if (error) {
    throw new Error(
      `Unable to upload "${preparedFile.name}" to Supabase Storage bucket "${PARTNER_MEDIA_BUCKET}": ${error.message}`,
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

async function preparePartnerUploadFile(
  file: File,
  spec: PartnerMediaSpec,
) {
  const contentType = partnerMediaContentType(file)

  if (!contentType) {
    throw new Error(`"${file.name}" must be a PNG, JPEG, WebP, or SVG image.`)
  }

  const input = Buffer.from(await file.arrayBuffer())
  const outputFormat = contentType === "image/jpeg" ? "jpeg" : "png"
  const outputExtension = outputFormat === "jpeg" ? "jpg" : "png"
  const outputType = outputFormat === "jpeg" ? "image/jpeg" : "image/png"

  try {
    const resized = await sharp(input)
      .rotate()
      .resize(spec.width, spec.height, {
        fit: "cover",
        position: "center",
      })
      .toFormat(outputFormat, outputFormat === "jpeg" ? { quality: 92 } : {})
      .toBuffer()

    return new File(
      [new Uint8Array(resized)],
      replaceFileExtension(file.name, `${spec.width}x${spec.height}.${outputExtension}`),
      {
        type: outputType,
        lastModified: Date.now(),
      },
    )
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Unable to resize "${file.name}": ${error.message}`
        : `Unable to resize "${file.name}".`,
    )
  }
}

async function uploadInitialMenuItemImages(
  supabase: SupabaseClient,
  formData: FormData,
  menuId: string,
) {
  const count = integerValue(formData, "initial_menu_item_count") ?? 0
  const uploadedPaths: UploadedStoragePath[] = []
  const imageUrlsByIndex = new Map<number, string>()

  try {
    for (let index = 0; index < count; index += 1) {
      const file = fileValue(formData, `initial_menu_item_${index}_image_file`)

      if (!file) {
        continue
      }

      const mediaError = validateMediaFile(file)

      if (mediaError) {
        throw new Error(mediaError)
      }

      const uploaded = await uploadPartnerFile(
        supabase,
        file,
        partnerMediaSpecs.menuItem,
        `menu-items/${menuId}/${Date.now()}-${index}-${safeFileName(file.name)}`,
      )

      imageUrlsByIndex.set(index, uploaded.url)
      uploadedPaths.push(uploaded)
    }
  } catch (error) {
    await cleanupUploadedFiles(supabase, uploadedPaths)
    throw error
  }

  return { imageUrlsByIndex, uploadedPaths }
}

async function cleanupUploadedFiles(
  supabase: SupabaseClient,
  uploadedPaths: UploadedStoragePath[],
) {
  await Promise.all(
    uploadedPaths.map(({ bucket, path }) =>
      supabase.storage.from(bucket).remove([path]),
    ),
  )
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

  return `Owner was selected, but could not be marked as partner: ${byId.error.message}`
}

async function uploadInitialMenuCategoryImages(
  supabase: SupabaseClient,
  formData: FormData,
  menuId: string,
) {
  const count = integerValue(formData, "initial_menu_category_count") ?? 0
  const uploadedPaths: UploadedStoragePath[] = []
  const imageUrlsByIndex = new Map<number, string>()

  try {
    for (let index = 0; index < count; index += 1) {
      const file = fileValue(
        formData,
        `initial_menu_category_${index}_image_file`,
      )
      if (!file) continue

      const mediaError = validateMediaFile(file)
      if (mediaError) throw new Error(mediaError)

      const uploaded = await uploadPartnerFile(
        supabase,
        file,
        partnerMediaSpecs.menuCategory,
        `menu-categories/${menuId}/${Date.now()}-${index}-${safeFileName(file.name)}`,
      )
      imageUrlsByIndex.set(index, uploaded.url)
      uploadedPaths.push(uploaded)
    }
  } catch (error) {
    await cleanupUploadedFiles(supabase, uploadedPaths)
    throw error
  }

  return { imageUrlsByIndex, uploadedPaths }
}

async function createInitialMenu(
  supabase: SupabaseClient,
  formData: FormData,
  partnerId: string,
) {
  const now = new Date().toISOString()
  const menuPayload = parseMenuPayload(formData, partnerId, "initial_menu_")
  const menuValidation = validateMenuPayload(menuPayload)

  if (menuValidation) {
    return `the starter menu was skipped: ${menuValidation}`
  }

  const menuResult = await supabase
    .from("menus")
    .insert({
      ...menuPayload,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single()

  if (menuResult.error) {
    return `the starter menu could not be added: ${menuResult.error.message}`
  }

  const menuId = menuResult.data?.id

  if (!menuId) {
    return "the starter menu could not be added: no menu id was returned."
  }

  const categoryIdsByDraft = new Map<string, string>()
  const categories = parseInitialMenuCategoryPayloads(formData, menuId)
  let categoryImageUploads: Awaited<
    ReturnType<typeof uploadInitialMenuCategoryImages>
  >

  try {
    categoryImageUploads = await uploadInitialMenuCategoryImages(
      supabase,
      formData,
      menuId,
    )
  } catch (error) {
    return `starter menu category images could not be uploaded: ${
      error instanceof Error ? error.message : "Unknown upload error."
    }`
  }

  for (const [categoryIndex, category] of categories.entries()) {
    category.image_url =
      categoryImageUploads.imageUrlsByIndex.get(categoryIndex) ?? null
    const categoryValidation = validateMenuCategoryPayload(category)

    if (categoryValidation) {
      await cleanupUploadedFiles(supabase, categoryImageUploads.uploadedPaths)
      return `starter menu categories were skipped: ${categoryValidation}`
    }

    const categoryResult = await supabase
      .from("menu_categories")
      .insert({
        menu_id: category.menu_id,
        name: category.name,
        slug: category.slug,
        image_url: category.image_url,
        sort_order: category.sort_order,
      })
      .select("id")
      .single()

    if (categoryResult.error) {
      await cleanupUploadedFiles(supabase, categoryImageUploads.uploadedPaths)
      return `starter menu categories could not be added: ${categoryResult.error.message}`
    }

    if (categoryResult.data?.id) {
      categoryIdsByDraft.set(category.draft_id, categoryResult.data.id)
    }
  }

  const dryRunItems = parseInitialMenuItemPayloads(
    formData,
    menuId,
    categoryIdsByDraft,
    new Map(),
  )
  const itemValidation = dryRunItems.map(validateMenuItemPayload).find(Boolean)

  if (itemValidation) {
    await cleanupUploadedFiles(supabase, categoryImageUploads.uploadedPaths)
    return `starter menu items were skipped: ${itemValidation}`
  }

  let imageUploads: Awaited<ReturnType<typeof uploadInitialMenuItemImages>>

  try {
    imageUploads = await uploadInitialMenuItemImages(
      supabase,
      formData,
      menuId,
    )
  } catch (error) {
    await cleanupUploadedFiles(supabase, categoryImageUploads.uploadedPaths)
    return `starter menu item images could not be uploaded: ${
      error instanceof Error ? error.message : "Unknown upload error."
    }`
  }

  const items = parseInitialMenuItemPayloads(
    formData,
    menuId,
    categoryIdsByDraft,
    imageUploads.imageUrlsByIndex,
  )

  if (items.length > 0) {
    const itemResult = await supabase.from("menu_items").insert(
      items.map((item) => ({
        menu_id: item.menu_id,
        category_id: item.category_id,
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        image_url: item.image_url,
        tags: item.tags,
        allergens: item.allergens,
        is_popular: item.is_popular,
        is_stamp_eligible: item.is_stamp_eligible,
        sort_order: item.sort_order,
        created_at: now,
        updated_at: now,
      })),
    )

    if (itemResult.error) {
      await cleanupUploadedFiles(supabase, [
        ...categoryImageUploads.uploadedPaths,
        ...imageUploads.uploadedPaths,
      ])
      return `starter menu items could not be added: ${itemResult.error.message}`
    }
  }

  const importFiles = fileValues(formData, "initial_menu_file")
  if (importFiles.length) {
    const importResult = await importMenuIntoMenu(
      supabase,
      menuId,
      "append",
      importFiles,
    )
    if (!importResult.ok) {
      return `starter menu import failed: ${importResult.message}`
    }
    if (importResult.issues) {
      return `the starter menu was created with import issues: ${importResult.message}`
    }
  }

  return null
}

function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ""
}

async function resolvePartnerOwner(
  formData: FormData,
): Promise<
  | { ok: true; ownerId: string }
  | { ok: false; message: string }
> {
  const existingOwnerId = stringValue(formData, "owner_id")
  const requestedEmail = normalizeEmail(stringValue(formData, "new_owner_email"))

  if (!requestedEmail) {
    return existingOwnerId
      ? { ok: true, ownerId: existingOwnerId }
      : { ok: false, message: "Choose a partner owner or enter a valid new owner email." }
  }

  const config = getSupabaseConfig()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!config.isConfigured || !serviceRoleKey) {
    return {
      ok: false,
      message:
        "New owner invitations require SUPABASE_SERVICE_ROLE_KEY on the server. No partner or account was created.",
    }
  }

  const adminClient = createSupabaseClient(config.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const existingProfile = await findOwnerProfileByEmail(adminClient, requestedEmail)

  if (existingProfile) {
    await markOwnerAsPartner(adminClient, existingProfile)
    return { ok: true, ownerId: existingProfile }
  }

  const existingAuthUserId = await findAuthUserIdByEmail(adminClient, requestedEmail)
  let authUserId = existingAuthUserId

  if (!authUserId) {
    const invitation = await adminClient.auth.admin.inviteUserByEmail(
      requestedEmail,
      { data: { account_type: "partner", display_name: requestedEmail.split("@")[0] } },
    )

    if (invitation.error || !invitation.data.user) {
      return {
        ok: false,
        message: `Unable to create the partner owner account: ${invitation.error?.message ?? "No user was returned."}`,
      }
    }

    authUserId = invitation.data.user.id
  }

  const profileId = await ensureOwnerProfile(
    adminClient,
    authUserId,
    requestedEmail,
  )

  if (!profileId) {
    return {
      ok: false,
      message:
        "The login account was created, but its partner profile could not be created. Check the users table schema before retrying.",
    }
  }

  return { ok: true, ownerId: profileId }
}

async function findOwnerProfileByEmail(
  supabase: SupabaseClient,
  email: string,
) {
  for (const columns of ["id,uid", "id", "uid"]) {
    const result = await supabase
      .from("users")
      .select(columns)
      .ilike("email", email)
      .limit(1)
      .maybeSingle()

    if (!result.error && result.data) {
      const row = result.data as unknown as { id?: string | null; uid?: string | null }
      return row.id || row.uid || null
    }
  }

  return null
}

async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (result.error) return null

    const match = result.data.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    )
    if (match) return match.id
    if (result.data.users.length < 1000) break
  }

  return null
}

async function ensureOwnerProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string,
) {
  const displayName = email.split("@")[0]
  const attempts = [
    { conflict: "id", payload: { id: userId, email, display_name: displayName, is_partner: true } },
    { conflict: "uid", payload: { uid: userId, email, display_name: displayName, is_partner: true } },
  ]

  for (const attempt of attempts) {
    const result = await supabase
      .from("users")
      .upsert(attempt.payload as never, { onConflict: attempt.conflict })

    if (!result.error) return userId
  }

  return findOwnerProfileByEmail(supabase, email)
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

async function insertDeals(
  supabase: SupabaseClient,
  deals: Array<ParsedDeal & { created_at?: string; updated_at?: string }>,
) {
  return await mutateDealPayloadWithSchemaRetry(
    deals.map((deal) => ({ ...deal })),
    (payload) => supabase.from("deals").insert(payload),
  )
}

async function updateDeal(
  supabase: SupabaseClient,
  id: string,
  deal: ParsedDeal & { created_at?: string; updated_at?: string },
) {
  return await mutateDealPayloadWithSchemaRetry({ ...deal }, (payload) =>
    supabase.from("deals").update(payload).eq("id", id),
  )
}

async function mutateDealPayloadWithSchemaRetry<
  TPayload extends Record<string, unknown> | Array<Record<string, unknown>>,
>(
  payload: TPayload,
  mutate: (payload: TPayload) => PromiseLike<{ error: { message: string } | null }>,
) {
  const removedColumns = new Set<string>()

  while (true) {
    const result = await mutate(payload)

    if (!result.error) {
      return null
    }

    const missingColumn = missingSchemaCacheColumn(result.error.message)

    if (!missingColumn || removedColumns.has(missingColumn)) {
      return result.error.message
    }

    if (missingColumn === "valid_weekdays") {
      mirrorValidWeekdaysToWeekdays(payload)
    }

    removeMutationColumn(payload, missingColumn)
    removedColumns.add(missingColumn)
  }
}

function missingSchemaCacheColumn(message: string) {
  return (
    message.match(/Could not find the '([^']+)' column/)?.[1] ??
    message.match(/column "([^"]+)" of relation "[^"]+" does not exist/)?.[1] ??
    null
  )
}

function removeMutationColumn(
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
  column: string,
) {
  if (Array.isArray(payload)) {
    for (const row of payload) {
      delete row[column]
    }

    return
  }

  delete payload[column]
}

function mirrorValidWeekdaysToWeekdays(
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
) {
  const rows = Array.isArray(payload) ? payload : [payload]

  for (const row of rows) {
    const validWeekdays = row.valid_weekdays
    const existingWeekdays = row.weekdays

    if (
      !Array.isArray(validWeekdays) ||
      validWeekdays.some((weekday) => typeof weekday !== "number")
    ) {
      continue
    }

    if (Array.isArray(existingWeekdays) && existingWeekdays.length > 0) {
      continue
    }

    row.weekdays = [...validWeekdays]
  }
}

function parseDealPayload(
  formData: FormData,
  prefix = "",
  partnerId = stringValue(formData, `${prefix}partner_id`),
): ParsedDeal {
  const submittedType = stringValue(formData, `${prefix}type`)
  const dealConcept = normalizeDealConcept(
    stringValue(formData, `${prefix}deal_concept`),
    submittedType,
  )
  const type = backendDealTypeForDealConcept(dealConcept)
  const isLimitedDrop = type === "limited_drop"
  const isDurationBonus = dealConcept === DURATION_BONUS_DEAL
  const isComebackInactive = dealConcept === COMEBACK_INACTIVE_DEAL
  const rawDiscountType = stringValue(formData, `${prefix}discount_type`)
  const discountType = normalizeDealDiscountType(type, rawDiscountType)
  const isWelcomeDeal = type === "welcome"
  const benefitCategory = normalizeBenefitCategory(
    type,
    discountType,
    stringValue(formData, `${prefix}benefit_category`),
  )
  const benefitCount = integerValue(formData, `${prefix}benefit_count`)
  const audience =
    normalizeChoice(stringValue(formData, `${prefix}audience`), isAudience) ??
    DEFAULT_AUDIENCE
  const stockTotal = integerValue(formData, `${prefix}stock_total`)
  const stockRemaining =
    isLimitedDrop &&
    stockTotal !== null &&
    !stringValue(formData, `${prefix}stock_remaining`)
      ? stockTotal
      : integerValue(formData, `${prefix}stock_remaining`)
  const startsAt = nullableStringValue(formData, `${prefix}starts_at`)
  const endsAt = nullableStringValue(formData, `${prefix}ends_at`)
  const usesDiscountValue =
    discountType === "fixed" || discountType === "percent"
  const usesRewardItem = discountType === "item"
  const usesBenefitCount = discountType === "bonus_stamp"
  const usesHappyHour = type === "happy_hour"
  const usesTriggerValue =
    type === "streak" || type === "comeback" || type === "challenge"
  const durationValue = integerValue(formData, `${prefix}duration_value`)
  const inactivityValue = integerValue(formData, `${prefix}inactivity_value`)
  const triggerValue = isDurationBonus
    ? durationValue
    : isComebackInactive
      ? inactivityValue
      : usesTriggerValue
        ? integerValue(formData, `${prefix}trigger_value`)
        : null
  const discountValue = usesDiscountValue
    ? numberValue(formData, `${prefix}discount_value`)
    : null
  const manualEstimatedSavings = numberValue(
    formData,
    `${prefix}estimated_savings`,
  )
  const estimatedSavings =
    discountType === "fixed"
      ? discountValue
      : discountType === "percent"
        ? null
        : manualEstimatedSavings
  const validWeekdays = integerListValue(formData, `${prefix}valid_weekdays`)
  const hasWeekdaySelector = formData.has(`${prefix}valid_weekdays_present`)
  const allowFreeTrial =
    isLimitedDrop &&
    discountType === "2for1" &&
    checkboxValue(formData, `${prefix}allow_free_trial`)
  const baseMetadata = jsonValue(formData, `${prefix}metadata`)
  const metadata = buildDealMetadata(
    formData,
    prefix,
    type,
    dealConcept,
    baseMetadata,
  )

  const payload: ParsedDeal = {
    partner_id: partnerId,
    type,
    discount_type: discountType,
    premium_only: audience === "premium",
    benefit_category: isLimitedDrop ? "direct_selectable" : benefitCategory,
    audience,
    activation_required: isLimitedDrop
      ? true
      : activationRequiredForCategory(benefitCategory),
    active: checkboxValue(formData, `${prefix}active`),
    discount_value: discountValue,
    reward_item: usesRewardItem
      ? nullableStringValue(formData, `${prefix}reward_item`)
      : null,
    benefit_count:
      !isLimitedDrop && usesBenefitCount && benefitCount === null
        ? 1
        : !usesBenefitCount
          ? null
          : benefitCount,
    estimated_savings: estimatedSavings,
    customer_description: nullableStringValue(
      formData,
      `${prefix}customer_description`,
    ),
    staff_instructions: nullableStringValue(
      formData,
      `${prefix}staff_instructions`,
    ),
    terms: nullableStringValue(formData, `${prefix}terms`),
    trigger_value: triggerValue,
    expiry_days:
      type === "streak" || type === "comeback"
        ? integerValue(formData, `${prefix}expiry_days`)
        : null,
    happy_hour_start: usesHappyHour
      ? nullableStringValue(formData, `${prefix}happy_hour_start`)
      : null,
    happy_hour_end: usesHappyHour
      ? nullableStringValue(formData, `${prefix}happy_hour_end`)
      : null,
    starts_at: isLimitedDrop ? startsAt : null,
    ends_at: isLimitedDrop ? endsAt : null,
    valid_from: isLimitedDrop
      ? startsAt
      : nullableStringValue(formData, `${prefix}valid_from`),
    valid_until: isLimitedDrop
      ? endsAt
      : nullableStringValue(formData, `${prefix}valid_until`),
    valid_weekdays:
      isLimitedDrop
        ? validWeekdays.length
          ? validWeekdays
          : hasWeekdaySelector
            ? []
            : [...DEFAULT_DEAL_DROP_WEEKDAYS]
        : validWeekdays,
    max_redemptions_global: isWelcomeDeal
      ? null
      : integerValue(formData, `${prefix}max_redemptions_global`),
    max_redemptions_per_user: isWelcomeDeal
      ? null
      : integerValue(formData, `${prefix}max_redemptions_per_user`),
    cooldown_hours: isWelcomeDeal
      ? null
      : integerValue(formData, `${prefix}cooldown_hours`),
    stock_total: isLimitedDrop ? stockTotal : null,
    stock_remaining: isLimitedDrop ? stockRemaining : null,
    selection_expires_minutes: DEFAULT_SELECTION_EXPIRES_MINUTES,
    priority:
      integerValue(formData, `${prefix}priority`) ??
      (isLimitedDrop ? DEFAULT_DEAL_DROP_PRIORITY : null),
    min_spend: numberValue(formData, `${prefix}min_spend`),
    max_discount_amount: numberValue(formData, `${prefix}max_discount_amount`),
    allow_free_trial: allowFreeTrial,
    reward_track_target:
      stringValue(formData, `${prefix}reward_track_target`) ||
      DEFAULT_REWARD_TRACK_TARGET,
    timezone:
      stringValue(formData, `${prefix}timezone`) || DEFAULT_TIMEZONE,
    weekdays: listValue(formData, `${prefix}weekdays`),
    // TODO: Backend selection handling must expire reserved stock holds.
    reserve_on_selection:
      isLimitedDrop &&
      checkboxValue(formData, `${prefix}reserve_on_selection`),
    metadata,
  }

  return preserveDealCopyFields(formData, prefix, payload, {
    preserveRewardItem: usesRewardItem,
  })
}

function normalizeDealConcept(value: string, submittedType: string) {
  if (value === DURATION_BONUS_DEAL || value === COMEBACK_INACTIVE_DEAL) {
    return value
  }

  if (submittedType === DURATION_BONUS_DEAL || submittedType === "comeback") {
    return DURATION_BONUS_DEAL
  }

  if (submittedType === COMEBACK_INACTIVE_DEAL) {
    return COMEBACK_INACTIVE_DEAL
  }

  return submittedType
}

function backendDealTypeForDealConcept(concept: string) {
  return concept === DURATION_BONUS_DEAL || concept === COMEBACK_INACTIVE_DEAL
    ? "comeback"
    : concept
}

function buildDealMetadata(
  formData: FormData,
  prefix: string,
  type: string,
  dealConcept: string,
  baseMetadata: unknown,
) {
  const metadata = metadataRecord(baseMetadata)

  for (const key of [
    "bonus_mode",
    "duration_value",
    "duration_unit",
    "inactivity_value",
    "inactivity_unit",
    "min_visit_count",
    "max_visit_count",
    "candidate_filter",
    "challenge_name",
  ]) {
    delete metadata[key]
  }

  // Admin separates Duration Bonus and Comeback Deal, while the backend
  // currently stores both with type = comeback and distinguishes via metadata.
  if (type === "comeback") {
    if (dealConcept === COMEBACK_INACTIVE_DEAL) {
      const inactivityValue = integerValue(formData, `${prefix}inactivity_value`)
      const inactivityUnit = normalizedUnit(
        stringValue(formData, `${prefix}inactivity_unit`),
        ["days", "weeks", "months"],
        "weeks",
      )
      const minVisitCount = integerValue(formData, `${prefix}min_visit_count`)
      const maxVisitCount = integerValue(formData, `${prefix}max_visit_count`)
      const candidateFilter: Record<string, number | string> = {
        inactivity_value: inactivityValue ?? 0,
        inactivity_unit: inactivityUnit,
      }

      metadata.bonus_mode = COMEBACK_INACTIVE_MODE
      metadata.inactivity_value = inactivityValue
      metadata.inactivity_unit = inactivityUnit

      if (minVisitCount !== null) {
        metadata.min_visit_count = minVisitCount
        candidateFilter.min_visit_count = minVisitCount
      }

      if (maxVisitCount !== null) {
        metadata.max_visit_count = maxVisitCount
        candidateFilter.max_visit_count = maxVisitCount
      }

      metadata.candidate_filter = candidateFilter
      return metadata
    }

    metadata.bonus_mode = DURATION_BONUS_MODE
    metadata.duration_value = integerValue(formData, `${prefix}duration_value`)
    metadata.duration_unit = normalizedUnit(
      stringValue(formData, `${prefix}duration_unit`),
      ["hours", "days", "weeks"],
      "hours",
    )
    return metadata
  }

  if (type === "challenge") {
    const challengeName = nullableStringValue(formData, `${prefix}challenge_name`)

    if (challengeName) {
      metadata.challenge_name = challengeName
    }
  }

  return metadata
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function normalizedUnit(
  value: string,
  allowedValues: string[],
  fallback: string,
) {
  return allowedValues.includes(value) ? value : fallback
}

function preserveDealCopyFields(
  formData: FormData,
  prefix: string,
  payload: ParsedDeal,
  {
    preserveRewardItem,
  }: {
    preserveRewardItem: boolean
  },
): ParsedDeal {
  return {
    ...payload,
    customer_description: savedDealCopyValue(
      formData,
      prefix,
      "customer_description",
      payload.customer_description,
    ),
    staff_instructions: savedDealCopyValue(
      formData,
      prefix,
      "staff_instructions",
      payload.staff_instructions,
    ),
    terms: savedDealCopyValue(formData, prefix, "terms", payload.terms),
    reward_item: preserveRewardItem
      ? savedDealCopyValue(formData, prefix, "reward_item", payload.reward_item)
      : null,
  }
}

function savedDealCopyValue(
  formData: FormData,
  prefix: string,
  field: "customer_description" | "staff_instructions" | "terms" | "reward_item",
  currentValue: string | null,
) {
  const dirtyKey = `${prefix}${field}_dirty`

  if (!formData.has(dirtyKey) || stringValue(formData, dirtyKey) === "true") {
    return currentValue
  }

  return nullableStringValue(formData, `${prefix}original_${field}`)
}

async function preserveExistingDealCopy(
  supabase: SupabaseClient,
  id: string,
  formData: FormData,
  prefix: string,
  payload: ParsedDeal,
) {
  const result = await supabase
    .from("deals")
    .select("customer_description,staff_instructions,terms,reward_item")
    .eq("id", id)
    .single()

  if (result.error) {
    return result.error.message
  }

  const current = result.data as {
    customer_description: string | null
    staff_instructions: string | null
    terms: string | null
    reward_item: string | null
  }

  if (
    !dealCopyFieldChanged(
      formData,
      prefix,
      "customer_description",
      current.customer_description,
    )
  ) {
    payload.customer_description = current.customer_description
  }

  if (
    !dealCopyFieldChanged(
      formData,
      prefix,
      "staff_instructions",
      current.staff_instructions,
    )
  ) {
    payload.staff_instructions = current.staff_instructions
  }

  if (!dealCopyFieldChanged(formData, prefix, "terms", current.terms)) {
    payload.terms = current.terms
  }

  if (
    payload.discount_type === "item" &&
    !dealCopyFieldChanged(formData, prefix, "reward_item", current.reward_item)
  ) {
    payload.reward_item = current.reward_item
  }

  return null
}

function dealCopyFieldChanged(
  formData: FormData,
  prefix: string,
  field: "customer_description" | "staff_instructions" | "terms" | "reward_item",
  existingValue: string | null,
) {
  const dirtyKey = `${prefix}${field}_dirty`

  if (formData.has(dirtyKey) && stringValue(formData, dirtyKey) === "true") {
    return true
  }

  return nullableStringValue(formData, `${prefix}${field}`) !== existingValue
}

function normalizeDealDiscountType(type: string, discountType: string) {
  if (type === "limited_drop") {
    if (!discountType) {
      return "item"
    }

    return discountType === "twoforone" ? "2for1" : discountType
  }

  if (type === "two_for_one") {
    return "2for1"
  }

  if (type === "bonus_stamp") {
    return "bonus_stamp"
  }

  if (type === "free_item") {
    return "item"
  }

  if (type === "permanent_discount" || type === "discount") {
    return discountType === "fixed" || discountType === "percent"
      ? discountType
      : "percent"
  }

  if (type === "happy_hour") {
    return ["fixed", "percent", "item", "2for1"].includes(discountType)
      ? discountType
      : "percent"
  }

  return discountType === "twoforone"
    ? "2for1"
    : discountType || "bonus_stamp"
}

function validateDealPayload(payload: ParsedDeal) {
  if (!payload.partner_id) {
    return "A deal must be attached to a partner."
  }

  if (!isDealType(payload.type)) {
    return "Deal type is required."
  }

  if (!isDiscountType(payload.discount_type)) {
    return "Discount type is required."
  }

  if (!isAudience(payload.audience)) {
    return "Audience is required."
  }

  const challengeName = metadataRecord(payload.metadata).challenge_name
  const textValidation = validateTextLengthRules([
    ["Reward item", payload.reward_item, adminTextLimits.shortText],
    [
      "Customer description",
      payload.customer_description,
      adminTextLimits.longText,
    ],
    [
      "Staff instructions",
      payload.staff_instructions,
      adminTextLimits.longText,
    ],
    ["Terms", payload.terms, adminTextLimits.longText],
    [
      "Challenge name",
      typeof challengeName === "string" ? challengeName : null,
      adminTextLimits.shortText,
    ],
  ])

  if (textValidation) {
    return textValidation
  }

  if (payload.type === "limited_drop") {
    const allowedDropDiscountTypes = [
      "item",
      "fixed",
      "percent",
      "2for1",
    ]

    if (payload.benefit_category !== "direct_selectable") {
      return "Deal Drop benefit category must be direct selectable."
    }

    if (!payload.activation_required) {
      return "Deal Drops must require activation."
    }

    if (!allowedDropDiscountTypes.includes(payload.discount_type)) {
      return "Deal Drops must use item, fixed, percent, or 2-for-1 discounts."
    }

    if (payload.valid_weekdays.length === 0) {
      return "Choose at least one valid weekday for the Deal Drop."
    }

    if (
      payload.valid_weekdays.some((weekday) => weekday < 1 || weekday > 7)
    ) {
      return "Deal Drop weekdays must be between Monday and Sunday."
    }
  }

  if (
    payload.type === "two_for_one" &&
    payload.discount_type !== "2for1"
  ) {
    return "2-for-1 deals must use the 2-for-1 reward type."
  }

  if (payload.type === "permanent_discount") {
    if (payload.benefit_category !== "automatic_fallback") {
      return "Permanent fallback discounts must apply only if no selected deal."
    }

    if (payload.activation_required) {
      return "Permanent fallback discounts must not require activation."
    }

    if (
      payload.discount_type !== "fixed" &&
      payload.discount_type !== "percent"
    ) {
      return "Permanent fallback discounts must use fixed or percentage discounts."
    }
  }

  if (payload.type === "discount") {
    if (payload.benefit_category !== "direct_selectable") {
      return "Selectable discounts must be selected before visit."
    }

    if (
      payload.discount_type !== "fixed" &&
      payload.discount_type !== "percent"
    ) {
      return "Selectable discounts must use fixed or percentage discounts."
    }
  }

  if (
    payload.type === "bonus_stamp" &&
    (payload.discount_type !== "bonus_stamp" ||
      payload.benefit_category !== "automatic_background" ||
      payload.activation_required)
  ) {
    return "Automatic bonus stamp deals must use bonus stamp, apply automatically, and not require activation."
  }

  if (payload.type === "free_item" && payload.discount_type !== "item") {
    return "Free item deals must use the free item reward type."
  }

  if (payload.type === "happy_hour") {
    if (payload.benefit_category !== "direct_selectable") {
      return "Happy Hour deals must be selected before visit."
    }

    if (payload.discount_type === "bonus_stamp") {
      return "Happy Hour deals cannot use automatic bonus stamps."
    }

    if (
      payload.valid_weekdays.some((weekday) => weekday < 1 || weekday > 7)
    ) {
      return "Happy Hour weekdays must be between Monday and Sunday."
    }
  }

  if (
    payload.activation_required !==
    activationRequiredForCategory(payload.benefit_category)
  ) {
    return "Activation must match the benefit category."
  }

  if (
    payload.discount_type === "bonus_stamp" &&
    (!payload.benefit_count || payload.benefit_count < 1)
  ) {
    return "Bonus stamp deals require a benefit count."
  }

  if (payload.discount_type === "item" && !payload.reward_item) {
    return "Item rewards require a reward item."
  }

  if (payload.discount_type === "2for1" && !payload.reward_item) {
    return "2-for-1 rewards require an item name."
  }

  if (
    (payload.discount_type === "fixed" ||
      payload.discount_type === "percent") &&
    (payload.discount_value === null || payload.discount_value <= 0)
  ) {
    return "Fixed and percent discounts require a discount value greater than 0."
  }

  if (
    payload.discount_type === "percent" &&
    payload.discount_value !== null &&
    payload.discount_value > 100
  ) {
    return "Percent discounts cannot exceed 100."
  }

  if (
    payload.type === "happy_hour" &&
    (!payload.happy_hour_start || !payload.happy_hour_end)
  ) {
    return "Happy hour deals require start and end times."
  }

  if (
    payload.type === "streak" &&
    (!payload.trigger_value || payload.trigger_value <= 0)
  ) {
    return "Streak deals require a trigger value greater than 0."
  }

  if (payload.type === "challenge") {
    const metadata = metadataRecord(payload.metadata)
    const challengeName = metadata.challenge_name

    if (typeof challengeName !== "string" || !challengeName.trim()) {
      return "Challenge rewards require a challenge name."
    }

    if (!payload.trigger_value || payload.trigger_value <= 0) {
      return "Challenge rewards require a trigger value greater than 0."
    }
  }

  if (payload.type === "comeback") {
    const metadata = metadataRecord(payload.metadata)
    const bonusMode = metadata.bonus_mode

    if (bonusMode === COMEBACK_INACTIVE_MODE) {
      const inactivityUnit = metadata.inactivity_unit
      const minVisitCount =
        typeof metadata.min_visit_count === "number"
          ? metadata.min_visit_count
          : null
      const maxVisitCount =
        typeof metadata.max_visit_count === "number"
          ? metadata.max_visit_count
          : null

      if (!payload.trigger_value || payload.trigger_value <= 0) {
        return "Comeback Deals require an inactivity period greater than 0."
      }

      if (
        typeof inactivityUnit !== "string" ||
        !["days", "weeks", "months"].includes(inactivityUnit)
      ) {
        return "Comeback Deals require days, weeks, or months as the inactivity unit."
      }

      if (
        (minVisitCount !== null && minVisitCount < 0) ||
        (maxVisitCount !== null && maxVisitCount < 0)
      ) {
        return "Comeback Deal visit filters cannot be negative."
      }

      if (
        minVisitCount !== null &&
        maxVisitCount !== null &&
        maxVisitCount < minVisitCount
      ) {
        return "Maximum visits must be at least minimum visits."
      }
    } else {
      const durationUnit = metadata.duration_unit

      if (!payload.trigger_value || payload.trigger_value <= 0) {
        return "Duration Bonus deals require a duration greater than 0."
      }

      if (
        typeof durationUnit !== "string" ||
        !["hours", "days", "weeks"].includes(durationUnit)
      ) {
        return "Duration Bonus deals require hours, days, or weeks as the duration unit."
      }
    }
  }

  if (payload.selection_expires_minutes < 1) {
    return "Selection expiry must be at least 1 minute."
  }

  if (
    payload.starts_at &&
    payload.ends_at &&
    compareDateTimeInput(payload.starts_at, payload.ends_at) >= 0
  ) {
    return "Deal Drop start date/time must be before the end date/time."
  }

  if (payload.stock_total !== null && payload.stock_total < 0) {
    return "Stock total cannot be negative."
  }

  if (payload.stock_remaining !== null && payload.stock_remaining < 0) {
    return "Stock remaining cannot be negative."
  }

  if (
    payload.stock_total !== null &&
    payload.stock_remaining !== null &&
    payload.stock_remaining > payload.stock_total
  ) {
    return "Stock remaining cannot be higher than stock total."
  }

  if (
    payload.max_redemptions_global !== null &&
    payload.max_redemptions_global < 0
  ) {
    return "Max redemptions globally cannot be negative."
  }

  if (
    payload.max_redemptions_per_user !== null &&
    payload.max_redemptions_per_user < 0
  ) {
    return "Max redemptions per user cannot be negative."
  }

  if (payload.cooldown_hours !== null && payload.cooldown_hours < 0) {
    return "Cooldown hours cannot be negative."
  }

  return null
}

function withDefaultMilestoneCopy(payload: ParsedMilestone): ParsedMilestone {
  const reward = describeDealReward(
    payload.reward_type,
    payload.discount_value,
    payload.reward_item,
    payload.reward_type === "bonus_stamp" ? payload.discount_value : null,
  )

  return {
    ...payload,
    customer_description:
      payload.customer_description ||
      `Reach ${payload.required_stamps ?? "the required"} stamps to receive ${reward}.`,
    staff_instructions:
      payload.staff_instructions ||
      `Verify the milestone reward in the app, then apply ${reward}.`,
    terms:
      payload.terms ||
      "Subject to availability. Cannot be combined with other offers unless stated.",
  }
}

function describeDealReward(
  discountType: string,
  discountValue: number | null,
  rewardItem: string | null,
  benefitCount: number | null,
) {
  if (discountType === "percent") {
    return discountValue !== null ? `${discountValue}% off` : "a percentage discount"
  }

  if (discountType === "fixed") {
    return discountValue !== null ? `€${discountValue} off` : "a fixed discount"
  }

  if (discountType === "item") {
    return rewardItem || "a free item"
  }

  if (discountType === "bonus_stamp") {
    const count = benefitCount ?? 1

    return `+${count} bonus ${count === 1 ? "stamp" : "stamps"}`
  }

  if (discountType === "2for1") {
    return "a 2-for-1 reward"
  }

  return "the configured reward"
}

const automaticBenefitCategories = [
  "automatic_background",
  "automatic_fallback",
] as const

function isAutomaticBenefitCategory(category: string) {
  return automaticBenefitCategories.includes(
    category as (typeof automaticBenefitCategories)[number],
  )
}

function validateUniqueInitialAutomaticDealPriorities(deals: ParsedDeal[]) {
  const usedPriorities = new Set<number>()

  for (const deal of deals) {
    if (
      !isAutomaticBenefitCategory(deal.benefit_category) ||
      deal.priority === null
    ) {
      continue
    }

    if (usedPriorities.has(deal.priority)) {
      return `Automatic deals cannot share priority ${deal.priority}.`
    }

    usedPriorities.add(deal.priority)
  }

  return null
}

async function validateUniqueAutomaticDealPriority(
  supabase: SupabaseClient,
  payload: ParsedDeal,
  id?: string,
) {
  if (
    !isAutomaticBenefitCategory(payload.benefit_category) ||
    payload.priority === null
  ) {
    return null
  }

  let query = supabase
    .from("deals")
    .select("id")
    .eq("partner_id", payload.partner_id)
    .eq("priority", payload.priority)
    .in("benefit_category", [...automaticBenefitCategories])
    .limit(1)

  if (id) {
    query = query.neq("id", id)
  }

  const result = await query

  if (result.error) {
    return result.error.message
  }

  if (result.data?.length) {
    return `Another automatic deal already uses priority ${payload.priority}.`
  }

  return null
}

function parseInitialMilestones(formData: FormData, partnerId: string) {
  const count = integerValue(formData, "initial_milestone_count") ?? 0
  const milestones: ParsedMilestone[] = []

  for (let index = 0; index < count; index += 1) {
    const prefix = `initial_milestone_${index}_`
    const rewardType = stringValue(formData, `${prefix}reward_type`)

    milestones.push(
      withDefaultMilestoneCopy({
        partner_id: partnerId,
        required_stamps: integerValue(formData, `${prefix}required_stamps`),
        reward_type: rewardType,
        reward_item: nullableStringValue(formData, `${prefix}reward_item`),
        discount_type: rewardType,
        discount_value: numberValue(formData, `${prefix}discount_value`),
        estimated_savings: numberValue(
          formData,
          `${prefix}estimated_savings`,
        ),
        title: nullableStringValue(formData, `${prefix}title`),
        customer_description: nullableStringValue(
          formData,
          `${prefix}customer_description`,
        ),
        staff_instructions: nullableStringValue(
          formData,
          `${prefix}staff_instructions`,
        ),
        terms: nullableStringValue(formData, `${prefix}terms`),
        audience:
          normalizeChoice(
            stringValue(formData, `${prefix}audience`),
            isMilestoneAudience,
          ) ?? DEFAULT_AUDIENCE,
        active: checkboxValue(formData, `${prefix}active`),
        reward_track_target: DEFAULT_REWARD_TRACK_TARGET,
      }),
    )
  }

  return milestones
}

function validateInitialMilestones(milestones: ParsedMilestone[]) {
  if (milestones.length === 0) {
    return "At least one stamp-card milestone is required before creating a partner."
  }

  for (let index = 0; index < milestones.length; index += 1) {
    const validationMessage = validateMilestonePayload(milestones[index])

    if (validationMessage) {
      return `Milestone ${index + 1}: ${validationMessage}`
    }
  }

  return null
}

function parseMilestonePayload(formData: FormData): ParsedMilestone {
  const rewardType = stringValue(formData, "reward_type")

  return withDefaultMilestoneCopy({
    partner_id: stringValue(formData, "partner_id"),
    required_stamps: integerValue(formData, "required_stamps"),
    reward_type: rewardType,
    reward_item: nullableStringValue(formData, "reward_item"),
    discount_type: stringValue(formData, "discount_type") || rewardType,
    discount_value: numberValue(formData, "discount_value"),
    estimated_savings: numberValue(formData, "estimated_savings"),
    title: nullableStringValue(formData, "title"),
    customer_description: nullableStringValue(
      formData,
      "customer_description",
    ),
    staff_instructions: nullableStringValue(formData, "staff_instructions"),
    terms: nullableStringValue(formData, "terms"),
    audience:
      normalizeChoice(
        stringValue(formData, "audience"),
        isMilestoneAudience,
      ) ?? DEFAULT_AUDIENCE,
    active: checkboxValue(formData, "active"),
    reward_track_target:
      stringValue(formData, "reward_track_target") ||
      DEFAULT_REWARD_TRACK_TARGET,
  })
}

function validateMilestonePayload(payload: ParsedMilestone) {
  if (!payload.partner_id) {
    return "A milestone must be attached to a partner."
  }

  if (!payload.required_stamps || payload.required_stamps < 1) {
    return "Required stamps must be at least 1."
  }

  if (!isRewardType(payload.reward_type)) {
    return "Milestone reward type is required."
  }

  if (!isMilestoneAudience(payload.audience)) {
    return "Milestone audience is required."
  }

  if (payload.reward_type === "item" && !payload.reward_item) {
    return "Item milestones require a reward item."
  }

  if (
    (payload.reward_type === "fixed" || payload.reward_type === "percent") &&
    payload.discount_value === null
  ) {
    return "Fixed and percent milestones require a discount value."
  }

  if (payload.required_stamps > MAX_STAMP_CARD_STAMPS) {
    return `Required stamps must be ${MAX_STAMP_CARD_STAMPS} or lower.`
  }

  const textValidation = validateTextLengthRules([
    ["Reward item", payload.reward_item, adminTextLimits.shortText],
    ["Title", payload.title, adminTextLimits.shortText],
    [
      "Customer description",
      payload.customer_description,
      adminTextLimits.longText,
    ],
    [
      "Staff instructions",
      payload.staff_instructions,
      adminTextLimits.longText,
    ],
    ["Terms", payload.terms, adminTextLimits.longText],
  ])

  if (textValidation) {
    return textValidation
  }

  return null
}

function parsePartnerSocials(formData: FormData): ParsedPartnerSocial[] {
  const count = integerValue(formData, "social_count") ?? 0
  const socials: ParsedPartnerSocial[] = []

  for (let index = 0; index < count; index += 1) {
    const platform = stringValue(formData, `social_${index}_platform`)
    const handle = normalizePartnerSocialHandle(
      stringValue(formData, `social_${index}_handle`),
    )

    if (!platform && !handle) {
      continue
    }

    socials.push({
      platform,
      handle,
      sort_order: socials.length,
      url: platform && handle ? buildPartnerSocialUrl(platform, handle) : "",
    })
  }

  return socials
}

function validatePartnerSocials(socials: ParsedPartnerSocial[]) {
  if (socials.length > MAX_PARTNER_SOCIALS) {
    return `Add up to ${MAX_PARTNER_SOCIALS} social media handles.`
  }

  const seenPlatforms = new Set<string>()

  for (const social of socials) {
    if (!isPartnerSocialPlatform(social.platform)) {
      return "Choose a valid social media platform."
    }

    if (!social.handle) {
      return "Enter a social media handle or remove the empty row."
    }

    const handleValidation = validateTextLength(
      "Social media handle",
      social.handle,
      adminTextLimits.socialHandle,
    )

    if (handleValidation) {
      return handleValidation
    }

    if (seenPlatforms.has(social.platform)) {
      return "Use each social media platform only once per partner."
    }

    seenPlatforms.add(social.platform)
  }

  return null
}

async function replacePartnerSocials(
  supabase: SupabaseClient,
  partnerId: string,
  socials: ParsedPartnerSocial[],
) {
  const deleteResult = await supabase
    .from("partner_socials")
    .delete()
    .eq("partner_id", partnerId)

  if (deleteResult.error) {
    return deleteResult.error.message
  }

  if (!socials.length) {
    return null
  }

  const insertResult = await supabase.from("partner_socials").insert(
    socials.map((social) => ({
      partner_id: partnerId,
      platform: social.platform,
      handle: social.handle,
      sort_order: social.sort_order,
      url: social.url,
    })),
  )

  return insertResult.error?.message ?? null
}

async function replacePartnerHolidays(
  supabase: SupabaseClient,
  partnerId: string,
  holidays: ParsedPartnerHoliday[],
) {
  const deleteResult = await supabase
    .from("partner_holidays")
    .delete()
    .eq("partner_id", partnerId)

  if (deleteResult.error) {
    return deleteResult.error.message
  }

  if (!holidays.length) {
    return null
  }

  const now = new Date().toISOString()
  const insertResult = await supabase.from("partner_holidays").insert(
    holidays.map((holiday) => ({
      ...holiday,
      created_at: now,
      updated_at: now,
    })),
  )

  return insertResult.error?.message ?? null
}

async function rollbackCreatedPartner(
  supabase: SupabaseClient,
  partnerId: string,
) {
  await supabase.from("partner_socials").delete().eq("partner_id", partnerId)
  await supabase.from("partner_holidays").delete().eq("partner_id", partnerId)
  await supabase
    .from("partner_reward_milestones")
    .delete()
    .eq("partner_id", partnerId)
  await supabase.from("partner_opening_hours").delete().eq("partner_id", partnerId)
  await supabase.from("partners").delete().eq("id", partnerId)
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string => typeof entry === "string" && Boolean(entry),
      )
    : []
}

function collectNonEmptyStrings(values: unknown[]) {
  return values.filter(
    (value): value is string => typeof value === "string" && Boolean(value),
  )
}

function parsePartnerStaffPayload(formData: FormData): ParsedPartnerStaff {
  return {
    partner_id: stringValue(formData, "partner_id"),
    user_id: stringValue(formData, "user_id"),
    role: stringValue(formData, "role") || "scanner",
    active: true,
  }
}

function validatePartnerStaffPayload(payload: ParsedPartnerStaff) {
  if (!payload.partner_id) {
    return "Staff access must be attached to a partner."
  }

  if (!payload.user_id) {
    return "Choose a staff user."
  }

  if (!isPartnerStaffRole(payload.role)) {
    return "Choose a valid staff role."
  }

  return null
}

function parseOpeningHourPayload(formData: FormData): ParsedOpeningHour {
  const weekday = integerValue(formData, "weekday")
  const isClosed = checkboxValue(formData, "is_closed")

  return {
    partner_id: stringValue(formData, "partner_id"),
    weekday,
    opens_at: isClosed ? null : nullableStringValue(formData, "opens_at"),
    closes_at: isClosed ? null : nullableStringValue(formData, "closes_at"),
    label: nullableStringValue(formData, "label"),
    is_closed: isClosed,
    sort_order: integerValue(formData, "sort_order") ?? weekday,
  }
}

function validateOpeningHourPayload(payload: ParsedOpeningHour) {
  if (!payload.partner_id) {
    return "Opening hours must be attached to a partner."
  }

  if (
    payload.weekday === null ||
    payload.weekday < 0 ||
    payload.weekday > 7
  ) {
    return "Choose a valid weekday."
  }

  if (!payload.is_closed && (!payload.opens_at || !payload.closes_at)) {
    return "Open days require opening and closing times."
  }

  const labelValidation = validateTextLength(
    "Opening hour note",
    payload.label,
    adminTextLimits.label,
  )

  if (labelValidation) {
    return labelValidation
  }

  return null
}

function parseWeeklyOpeningHourRows(
  formData: FormData,
  partnerId: string,
): ParsedOpeningHour[] {
  return openingWeekdays.map((weekday) => {
    const isClosed = checkboxValue(formData, `is_closed_${weekday}`)

    return {
      partner_id: partnerId,
      weekday,
      opens_at: isClosed
        ? null
        : nullableStringValue(formData, `opens_at_${weekday}`),
      closes_at: isClosed
        ? null
        : nullableStringValue(formData, `closes_at_${weekday}`),
      label: nullableStringValue(formData, `label_${weekday}`),
      is_closed: isClosed,
      sort_order: weekday,
    }
  })
}

function invalidWeeklyOpeningHourRow(rows: ParsedOpeningHour[]) {
  return rows.find(
    (row) => !row.is_closed && (!row.opens_at || !row.closes_at),
  )
}

function validateOpeningHourRows(rows: ParsedOpeningHour[]) {
  for (const row of rows) {
    const labelValidation = validateTextLength(
      `${weekdayName(row.weekday)} note`,
      row.label,
      adminTextLimits.label,
    )

    if (labelValidation) {
      return labelValidation
    }
  }

  return null
}

function parsePartnerHolidays(
  formData: FormData,
  partnerId: string,
): ParsedPartnerHoliday[] {
  const count = integerValue(formData, "holiday_count") ?? 0
  const holidays: ParsedPartnerHoliday[] = []
  const seenDates = new Set<string>()

  for (let index = 0; index < count; index += 1) {
    const holidayDate = normalizeHolidayDate(
      stringValue(formData, `holiday_${index}_date`),
    )

    if (!holidayDate || seenDates.has(holidayDate)) {
      continue
    }

    seenDates.add(holidayDate)
    const isClosed = stringValue(formData, `holiday_${index}_kind`) !== "hours"
    holidays.push({
      partner_id: partnerId,
      holiday_date: holidayDate,
      label: nullableStringValue(formData, `holiday_${index}_label`),
      is_closed: isClosed,
      opens_at: isClosed
        ? null
        : nullableStringValue(formData, `holiday_${index}_opens_at`),
      closes_at: isClosed
        ? null
        : nullableStringValue(formData, `holiday_${index}_closes_at`),
      repeats_yearly: checkboxValue(
        formData,
        `holiday_${index}_repeats_yearly`,
      ),
    })
  }

  return holidays.sort((first, second) =>
    first.holiday_date.localeCompare(second.holiday_date),
  )
}

function validatePartnerHolidays(holidays: ParsedPartnerHoliday[]) {
  for (const holiday of holidays) {
    if (!holiday.partner_id) {
      return "Holiday hour exceptions must be attached to a partner."
    }

    if (!normalizeHolidayDate(holiday.holiday_date)) {
      return "Choose a valid holiday date."
    }

    if (
      !holiday.is_closed &&
      (!holiday.opens_at ||
        !holiday.closes_at ||
        holiday.opens_at === holiday.closes_at)
    ) {
      return "Holiday replacement hours need different opening and closing times."
    }

    const labelValidation = validateTextLength(
      "Holiday label",
      holiday.label,
      adminTextLimits.label,
    )

    if (labelValidation) {
      return labelValidation
    }
  }

  return null
}

function parseInitialMenuCategoryPayloads(
  formData: FormData,
  menuId: string,
): ParsedInitialMenuCategory[] {
  const count = integerValue(formData, "initial_menu_category_count") ?? 0
  const categories: ParsedInitialMenuCategory[] = []

  for (let index = 0; index < count; index += 1) {
    const prefix = `initial_menu_category_${index}_`
    const name = stringValue(formData, `${prefix}name`)

    categories.push({
      draft_id: stringValue(formData, `${prefix}draft_id`) || String(index),
      menu_id: menuId,
      name,
      slug: stringValue(formData, `${prefix}slug`) || slugify(name),
      image_url: null,
      sort_order: integerValue(formData, `${prefix}sort_order`) ?? index,
      image_file: fileValue(formData, `${prefix}image_file`),
    })
  }

  return normalizeSortOrdersByScope(categories, () => "menu")
}

function parseInitialMenuItemPayloads(
  formData: FormData,
  menuId: string,
  categoryIdsByDraft: Map<string, string>,
  imageUrlsByIndex: Map<number, string>,
): ParsedInitialMenuItem[] {
  const count = integerValue(formData, "initial_menu_item_count") ?? 0
  const items: ParsedInitialMenuItem[] = []

  for (let index = 0; index < count; index += 1) {
    const prefix = `initial_menu_item_${index}_`
    const categoryDraftId = nullableStringValue(
      formData,
      `${prefix}category_draft_id`,
    )

    items.push({
      menu_id: menuId,
      category_id: categoryDraftId
        ? categoryIdsByDraft.get(categoryDraftId) ?? null
        : null,
      name: stringValue(formData, `${prefix}name`),
      description: nullableStringValue(formData, `${prefix}description`),
      price: numberValue(formData, `${prefix}price`),
      currency: stringValue(formData, `${prefix}currency`) || "EUR",
      image_url: imageUrlsByIndex.get(index) ?? null,
      tags: listValue(formData, `${prefix}tags`),
      allergens: listValue(formData, `${prefix}allergens`),
      addons: parseMenuItemAddons(jsonValue(formData, `${prefix}addons`)),
      is_popular: checkboxValue(formData, `${prefix}is_popular`),
      is_stamp_eligible: checkboxValue(
        formData,
        `${prefix}is_stamp_eligible`,
      ),
      sort_order: integerValue(formData, `${prefix}sort_order`) ?? index,
      image_file: fileValue(formData, `${prefix}image_file`),
    })
  }

  return normalizeSortOrdersByScope(
    items,
    (item) => item.category_id ?? "uncategorized",
  )
}

function parseMenuPayload(
  formData: FormData,
  partnerId = stringValue(formData, "partner_id"),
  prefix = "",
): ParsedMenu {
  return {
    partner_id: partnerId,
    name: stringValue(formData, `${prefix}name`) || "Speisekarte",
    description: nullableStringValue(formData, `${prefix}description`),
    status: stringValue(formData, `${prefix}status`) || DEFAULT_MENU_STATUS,
  }
}

function validateMenuPayload(payload: ParsedMenu) {
  if (!payload.partner_id) {
    return "A menu must be attached to a partner."
  }

  if (!payload.name) {
    return "Menu name is required."
  }

  if (!["draft", "review", "published", "archived"].includes(payload.status)) {
    return "Choose a valid menu status."
  }

  const textValidation = validateTextLengthRules([
    ["Menu name", payload.name, adminTextLimits.shortText],
    ["Menu description", payload.description, adminTextLimits.longText],
  ])

  if (textValidation) {
    return textValidation
  }

  return null
}

function parseMenuCategoryPayload(
  formData: FormData,
  imageUrl: string | null,
): ParsedMenuCategory {
  const name = stringValue(formData, "name")

  return {
    menu_id: stringValue(formData, "menu_id"),
    name,
    slug: stringValue(formData, "slug") || slugify(name),
    image_url: imageUrl,
    sort_order: integerValue(formData, "sort_order") ?? 0,
  }
}

function validateMenuCategoryPayload(payload: ParsedMenuCategory) {
  if (!payload.menu_id) {
    return "A menu category must be attached to a menu."
  }

  if (!payload.name) {
    return "Category name is required."
  }

  if (!payload.slug) {
    return "Category slug is required."
  }

  const textValidation = validateTextLengthRules([
    ["Category name", payload.name, adminTextLimits.shortText],
    ["Category slug", payload.slug, adminTextLimits.shortText],
  ])

  if (textValidation) {
    return textValidation
  }

  return null
}

function parseMenuItemPayload(
  formData: FormData,
  imageUrl: string | null,
): ParsedMenuItem {
  return {
    menu_id: stringValue(formData, "menu_id"),
    category_id: nullableStringValue(formData, "category_id"),
    name: stringValue(formData, "name"),
    description: nullableStringValue(formData, "description"),
    price: numberValue(formData, "price"),
    currency: stringValue(formData, "currency") || "EUR",
    image_url: imageUrl,
    tags: listValue(formData, "tags"),
    allergens: listValue(formData, "allergens"),
    addons: parseMenuItemAddons(jsonValue(formData, "addons")),
    is_popular: checkboxValue(formData, "is_popular"),
    is_stamp_eligible: checkboxValue(formData, "is_stamp_eligible"),
    sort_order: integerValue(formData, "sort_order") ?? 0,
  }
}

function validateMenuItemPayload(payload: ParsedMenuItem) {
  if (!payload.menu_id) {
    return "A menu item must be attached to a menu."
  }

  if (!payload.name) {
    return "Menu item name is required."
  }

  if (payload.price !== null && payload.price < 0) {
    return "Menu item price cannot be negative."
  }

  const textValidation = validateTextLengthRules([
    ["Menu item name", payload.name, adminTextLimits.shortText],
    ["Menu item description", payload.description, adminTextLimits.longText],
    ["Currency", payload.currency, adminTextLimits.currency],
  ])

  if (textValidation) {
    return textValidation
  }

  const tagValidation = validateListTextLengths("Tags", payload.tags)

  if (tagValidation) {
    return tagValidation
  }

  const allergenValidation = validateListTextLengths(
    "Allergens",
    payload.allergens,
  )

  if (allergenValidation) {
    return allergenValidation
  }

  if (payload.currency !== "EUR") {
    return "Choose a supported currency."
  }

  for (const [index, addon] of payload.addons.entries()) {
    if (!addon.title) return `Add-on ${index + 1} needs a title.`
    if (!Number.isFinite(addon.cost) || addon.cost < 0) {
      return `Add-on ${index + 1} needs a valid non-negative cost.`
    }
    const addonTextValidation = validateTextLengthRules([
      [`Add-on ${index + 1} title`, addon.title, adminTextLimits.shortText],
      [`Add-on ${index + 1} description`, addon.description, adminTextLimits.longText],
    ])
    if (addonTextValidation) return addonTextValidation
  }

  return null
}

function parseMenuItemAddons(value: unknown): ParsedMenuItemAddon[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return []
    const record = entry as Record<string, unknown>
    const title = typeof record.title === "string" ? record.title.trim() : ""
    const description =
      typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : null
    const numericCost =
      typeof record.cost === "number" ? record.cost : Number(record.cost)

    return [{ title, description, cost: numericCost }]
  })
}

async function resolveMenuCategoryPosition(
  supabase: SupabaseClient,
  payload: ParsedMenuCategory,
  id: string,
) {
  if (payload.sort_order === null) {
    return null
  }

  let query = supabase
    .from("menu_categories")
    .select("id,sort_order")
    .eq("menu_id", payload.menu_id)

  if (id) {
    query = query.neq("id", id)
  }

  const result = await query

  if (result.error) {
    return result.error.message
  }

  payload.sort_order = nextOpenSortOrder(
    payload.sort_order,
    result.data?.map((row) => row.sort_order) ?? [],
  )

  return null
}

async function resolveMenuItemPosition(
  supabase: SupabaseClient,
  payload: ParsedMenuItem,
  id: string,
) {
  if (payload.sort_order === null) {
    return null
  }

  let query = supabase
    .from("menu_items")
    .select("id,sort_order")
    .eq("menu_id", payload.menu_id)

  query = payload.category_id
    ? query.eq("category_id", payload.category_id)
    : query.is("category_id", null)

  if (id) {
    query = query.neq("id", id)
  }

  const result = await query

  if (result.error) {
    return result.error.message
  }

  payload.sort_order = nextOpenSortOrder(
    payload.sort_order,
    result.data?.map((row) => row.sort_order) ?? [],
  )

  return null
}

function normalizeSortOrdersByScope<T extends { sort_order: number | null }>(
  rows: T[],
  scopeForRow: (row: T) => string,
) {
  const usedByScope = new Map<string, Set<number>>()

  return rows.map((row, index) => {
    const scope = scopeForRow(row)
    const used = usedByScope.get(scope) ?? new Set<number>()
    const sortOrder = nextOpenSortOrder(row.sort_order ?? index, [
      ...used,
    ])

    used.add(sortOrder)
    usedByScope.set(scope, used)

    return {
      ...row,
      sort_order: sortOrder,
    }
  })
}

function nextOpenSortOrder(
  requestedSortOrder: number | null,
  usedSortOrders: Array<number | null>,
) {
  const used = new Set(
    usedSortOrders.filter(
      (sortOrder): sortOrder is number =>
        sortOrder !== null && Number.isInteger(sortOrder),
    ),
  )
  let sortOrder =
    requestedSortOrder !== null && requestedSortOrder >= 0
      ? requestedSortOrder
      : 0

  while (used.has(sortOrder)) {
    sortOrder += 1
  }

  return sortOrder
}

function nextAvailableSortOrder(usedSortOrders: Array<number | null>) {
  const values = usedSortOrders.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  return values.length ? Math.max(...values) + 1 : 0
}

async function rollbackImportedMenu(
  supabase: SupabaseClient,
  categoryIds: string[],
) {
  await supabase.from("menu_items").delete().in("category_id", categoryIds)
  await supabase.from("menu_categories").delete().in("id", categoryIds)
}

function isCsvImportFile(file: File) {
  return file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv")
}

function isZipImportFile(file: File) {
  return (
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    file.name.toLowerCase().endsWith(".zip")
  )
}

async function copyImportedArchiveImage(
  supabase: SupabaseClient,
  menuId: string,
  asset: { bytes: Uint8Array; contentType: string; filename: string },
  context: ImportedImageContext,
) {
  const copiedBytes = new Uint8Array(asset.bytes.byteLength)
  copiedBytes.set(asset.bytes)
  const file = new File([copiedBytes], asset.filename, {
    type: asset.contentType,
    lastModified: Date.now(),
  })
  const mediaError = validateMediaFile(file)

  if (mediaError) throw new Error(mediaError)

  const folder = context.kind === "category" ? "menu-categories" : "menu-items"
  const spec = context.kind === "category"
    ? partnerMediaSpecs.menuCategory
    : partnerMediaSpecs.menuItem
  const uploaded = await uploadPartnerFile(
    supabase,
    file,
    spec,
    `${folder}/${menuId}/${Date.now()}-${randomUUID()}-${safeFileName(file.name)}`,
  )

  return uploaded.url
}

async function copyImportedMenuImage(
  supabase: SupabaseClient,
  menuId: string,
  imageUrl: string,
  context: ImportedImageContext,
) {
  const downloaded = await downloadRemoteImage(imageUrl)
  const file = new File(
    [new Uint8Array(downloaded.bytes)],
    downloaded.filename,
    { type: downloaded.contentType, lastModified: Date.now() },
  )
  const mediaError = validateMediaFile(file)

  if (mediaError) throw new Error(mediaError)

  const folder = context.kind === "category" ? "menu-categories" : "menu-items"
  const spec = context.kind === "category"
    ? partnerMediaSpecs.menuCategory
    : partnerMediaSpecs.menuItem
  const uploaded = await uploadPartnerFile(
    supabase,
    file,
    spec,
    `${folder}/${menuId}/${Date.now()}-${randomUUID()}-${safeFileName(file.name)}`,
  )

  return uploaded.url
}

function parseImportedMenuCsv(text: string): ImportedMenuCategory[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error("The CSV file needs a header and at least one data row.")
  const headers = rows[0].map((header) => header.trim().toLowerCase())
  const requiredHeaders = ["category", "item_name"]
  if (requiredHeaders.some((header) => !headers.includes(header))) {
    throw new Error('CSV headers must include "category" and "item_name".')
  }
  const categories = new Map<string, ImportedMenuCategory>()

  for (const values of rows.slice(1)) {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]))
    if (!row.category && !row.item_name) continue
    if (!row.category) throw new Error("Every CSV row needs a category.")
    let category = categories.get(row.category)
    if (!category) {
      category = { name: row.category, image_url: row.category_image_url || null, items: [] }
      categories.set(row.category, category)
    }
    if (row.item_name) {
      let addons: unknown = []
      if (row.addons) {
        try { addons = JSON.parse(row.addons) } catch { throw new Error(`Add-ons for "${row.item_name}" must be valid JSON.`) }
      }
      category.items.push({
        name: row.item_name,
        description: row.description || null,
        price: importedNumber(row.price),
        currency: row.currency || "EUR",
        image_url: row.image_url || null,
        tags: splitImportedList(row.tags),
        allergens: splitImportedList(row.allergens),
        addons: parseMenuItemAddons(addons),
        is_popular: /^(true|1|yes)$/i.test(row.is_popular),
      })
    }
  }
  return [...categories.values()]
}

function importedNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid price value "${String(value)}".`)
  return number
}

function splitImportedList(value: string) {
  return value.split(/[|;]/).map((entry) => entry.trim()).filter(Boolean)
}

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === "," && !quoted) {
      row.push(field)
      field = ""
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ""
    } else {
      field += character
    }
  }
  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "")
  return rows
}

function uniqueOrderedIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
}

async function updateSortOrderRows(
  supabase: SupabaseClient,
  table: "menu_categories" | "menu_items",
  scopeColumn: "menu_id",
  scopeId: string,
  orderedIds: string[],
) {
  const temporaryBase = 1_000_000
  const temporaryResults = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from(table)
        .update({ sort_order: temporaryBase + index })
        .eq("id", id)
        .eq(scopeColumn, scopeId),
    ),
  )
  const temporaryError = temporaryResults.find((result) => result.error)?.error

  if (temporaryError) {
    return temporaryError.message
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from(table)
        .update({ sort_order: index })
        .eq("id", id)
        .eq(scopeColumn, scopeId),
    ),
  )
  const error = results.find((result) => result.error)?.error

  if (error) {
    return error.message
  }

  return null
}

function collectPartnerMedia(formData: FormData): PartnerMediaFormValues {
  return {
    logoFile: fileValue(formData, "logo_file"),
    featureFile: fileValue(formData, "feature_card_file"),
    discoverFile: fileValue(formData, "discover_card_file"),
    coverFiles: fileValues(formData, "cover_files"),
    coverOrder: stringListValue(formData, "cover_order"),
    existingLogoUrl: stringValue(formData, "existing_logo_url"),
    existingFeatureCardUrl: stringValue(formData, "existing_feature_card_url"),
    existingDiscoverCardUrl: stringValue(
      formData,
      "existing_discover_card_image_url",
    ),
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

function normalizePartnerSocialHandle(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ""
  }

  try {
    const parsed = new URL(trimmed)
    const queryId = parsed.searchParams.get("id")

    if (queryId) {
      return sanitizePartnerSocialHandle(queryId)
    }

    const [firstSegment = ""] = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)

    return sanitizePartnerSocialHandle(firstSegment)
  } catch {
    return sanitizePartnerSocialHandle(trimmed)
  }
}

function sanitizePartnerSocialHandle(value: string) {
  const trimmed = value.trim().replace(/^@+/, "").replace(/^\/+/, "").replace(/\/+$/, "")

  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

function buildPartnerSocialUrl(platform: string, handle: string) {
  const normalizedHandle = sanitizePartnerSocialHandle(handle)

  switch (platform) {
    case "facebook":
      return `https://www.facebook.com/${normalizedHandle}`
    case "instagram":
      return `https://www.instagram.com/${normalizedHandle}`
    case "tiktok":
      return `https://www.tiktok.com/@${normalizedHandle}`
    case "x":
      return `https://x.com/${normalizedHandle}`
    default:
      return ""
  }
}

function normalizeHolidayDate(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ""
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return ""
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : ""
}

function validateTextLength(
  label: string,
  value: string | null | undefined,
  maxLength: number,
) {
  if ((value ?? "").length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`
  }

  return null
}

function validateTextLengthRules(
  rules: Array<[label: string, value: string | null | undefined, maxLength: number]>,
) {
  for (const [label, value, maxLength] of rules) {
    const message = validateTextLength(label, value, maxLength)

    if (message) {
      return message
    }
  }

  return null
}

function validateListTextLengths(
  label: string,
  values: string[] | null | undefined,
) {
  const items = values ?? []

  for (const item of items) {
    const itemValidation = validateTextLength(
      `${label} entry`,
      item,
      adminTextLimits.shortText,
    )

    if (itemValidation) {
      return itemValidation
    }
  }

  return validateTextLength(label, items.join(", "), adminTextLimits.tagList)
}

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key)

  return typeof value === "string" ? value.trim() : ""
}

function nullableStringValue(formData: FormData, key: string) {
  const value = stringValue(formData, key)

  return value || null
}

function integerValue(formData: FormData, key: string) {
  const value = stringValue(formData, key)

  if (!value) {
    return null
  }

  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? number : null
}

function positiveIntegerValue(formData: FormData, key: string) {
  const value = integerValue(formData, key)

  return value !== null && value > 0 ? value : null
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

function jsonValue(formData: FormData, key: string) {
  const value = stringValue(formData, key)

  if (!value) {
    return {}
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error("Metadata must be valid JSON.")
  }
}

function normalizeChoice<T extends string>(
  value: string,
  predicate: (value: string) => value is T,
) {
  return predicate(value) ? value : null
}

function compareDateTimeInput(start: string, end: string) {
  const startTime = new Date(start).getTime()
  const endTime = new Date(end).getTime()

  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return -1
  }

  return startTime - endTime
}

function listValue(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .filter(Boolean)
    .map((item) => item.trim())
    .filter(Boolean)
}

function integerListValue(formData: FormData, key: string) {
  return listValue(formData, key)
    .map((item) => Number.parseInt(item, 10))
    .filter((value) => Number.isInteger(value))
}

function stringListValue(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value && !isUploadPlaceholderUrl(value))
}

function validateInitialMenuItemImages(formData: FormData) {
  const count = integerValue(formData, "initial_menu_item_count") ?? 0

  for (let index = 0; index < count; index += 1) {
    const file = fileValue(formData, `initial_menu_item_${index}_image_file`)

    if (!file) {
      continue
    }

    const mediaError = validateMediaFile(file)

    if (mediaError) {
      return mediaError
    }
  }

  return null
}

function validatePartnerMediaFiles(mediaValues: PartnerMediaFormValues) {
  const files = [
    mediaValues.logoFile,
    mediaValues.featureFile,
    mediaValues.discoverFile,
    ...mediaValues.coverFiles,
  ].filter((file): file is File => Boolean(file))

  for (const file of files) {
    const mediaError = validateMediaFile(file)

    if (mediaError) {
      return mediaError
    }
  }

  return null
}

function validateMediaFile(file: File) {
  const contentType = partnerMediaContentType(file)

  if (!contentType || !ALLOWED_PARTNER_MEDIA_TYPES.has(contentType)) {
    return `"${file.name}" must be a PNG, JPEG, WebP, or SVG image.`
  }

  if (file.size > MAX_PARTNER_MEDIA_BYTES) {
    return `"${file.name}" must be 10 MB or smaller.`
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

function normalizePartnerTypeValue(value: string) {
  const normalized = value.trim().toLowerCase()

  return normalized === "restaurant" || normalized === "restuarant"
    ? "Food & Drink"
    : value
}

function partnerTypeSupportsMenu(value: string) {
  return normalizePartnerTypeValue(value) === "Food & Drink"
}

function createShortName(name: string) {
  const firstNamePart = name.split(/[,-]/)[0]?.trim()

  return (firstNamePart || name).slice(0, 32)
}

function createUuidV4() {
  const id = randomUUID()

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Unable to generate a valid partner UUID.")
  }

  return id
}

function weekdayName(weekday: number | null) {
  if (weekday === null) {
    return "That day"
  }

  return (
    [
      "",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ][weekday] ?? "That day"
  )
}

function safeFileName(name: string) {
  const extension = name.includes(".") ? name.split(".").pop() : ""
  const baseName = name.replace(/\.[^.]+$/, "")
  const safeBaseName = slugify(baseName) || "image"

  return extension ? `${safeBaseName}.${extension.toLowerCase()}` : safeBaseName
}

function replaceFileExtension(name: string, nextExtension: string) {
  const normalizedExtension = nextExtension.replace(/^\.+/, "")
  const baseName = name.replace(/\.[^.]+$/, "")
  const safeBaseName = slugify(baseName) || "image"

  return normalizedExtension
    ? `${safeBaseName}.${normalizedExtension}`
    : safeBaseName
}
