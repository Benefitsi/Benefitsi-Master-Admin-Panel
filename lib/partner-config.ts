export type PartnerMediaSpec = {
  label: string
  previewAspectHeight?: number
  previewAspectWidth?: number
  width: number
  height: number
  previewMaxWidth: number
  previewFit: "contain" | "cover"
}

export const DEFAULT_MENU_STATUS = "published"

export const partnerMediaSpecs = {
  logo: {
    label: "Logo",
    width: 380,
    height: 380,
    previewAspectWidth: 1170,
    previewAspectHeight: 1200,
    previewMaxWidth: 260,
    previewFit: "contain",
  },
  feature: {
    label: "Feature",
    width: 720,
    height: 470,
    previewAspectWidth: 720,
    previewAspectHeight: 470,
    previewMaxWidth: 260,
    previewFit: "cover",
  },
  discover: {
    label: "Discover",
    width: 384,
    height: 420,
    previewAspectWidth: 384,
    previewAspectHeight: 420,
    previewMaxWidth: 240,
    previewFit: "cover",
  },
  cover: {
    label: "Cover",
    width: 1200,
    height: 1200,
    previewMaxWidth: 260,
    previewFit: "cover",
  },
  menuItem: {
    label: "Menu item",
    width: 384,
    height: 384,
    previewMaxWidth: 240,
    previewFit: "cover",
  },
  menuCategory: {
    label: "Menu category",
    width: 1200,
    height: 504,
    previewMaxWidth: 240,
    previewFit: "cover",
  },
  dealDrop: {
    label: "Deal Drop card",
    width: 710,
    height: 400,
    previewAspectWidth: 710,
    previewAspectHeight: 400,
    previewMaxWidth: 260,
    previewFit: "cover",
  },
} satisfies Record<string, PartnerMediaSpec>

export const partnerSocialPlatformOptions = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
] as const

export const partnerSocialPlatforms = partnerSocialPlatformOptions.map(
  (option) => option.value,
)

export type PartnerSocialPlatform =
  (typeof partnerSocialPlatformOptions)[number]["value"]

export const MAX_PARTNER_SOCIALS = partnerSocialPlatforms.length

export const adminTextLimits = {
  coordinates: 64,
  currency: 8,
  email: 160,
  label: 80,
  longText: 2000,
  mediumText: 300,
  metadata: 4000,
  phone: 40,
  shortText: 120,
  socialHandle: 200,
  tagList: 250,
} as const

export function isPartnerSocialPlatform(
  value: string,
): value is PartnerSocialPlatform {
  return partnerSocialPlatforms.includes(value as PartnerSocialPlatform)
}
