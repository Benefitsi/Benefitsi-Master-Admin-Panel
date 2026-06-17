export type PartnerMediaSpec = {
  label: string
  previewAspectHeight?: number
  previewAspectWidth?: number
  width: number
  height: number
  previewMaxWidth: number
  previewFit: "contain" | "cover"
}

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
    width: 440,
    height: 500,
    previewAspectWidth: 440,
    previewAspectHeight: 500,
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
    width: 720,
    height: 490,
    previewMaxWidth: 240,
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
