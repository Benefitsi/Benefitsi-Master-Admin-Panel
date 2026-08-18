import type { CityReviewRecord } from "./contracts"

export function draftPreviewPath(record: Pick<CityReviewRecord, "contentType" | "id">) {
  return `/city-operations/${encodeURIComponent(record.contentType)}/${encodeURIComponent(record.id)}/draft-preview`
}

export function publicCityContentPath(
  record: Pick<CityReviewRecord, "citySlug" | "contentType" | "id" | "publicSlug">,
) {
  const slug = encodeURIComponent(record.publicSlug || record.id)
  const base = `/stadt/${encodeURIComponent(record.citySlug)}`

  switch (record.contentType) {
    case "places":
      return `${base}/entdecken/ort/${slug}`
    case "events":
      return `${base}/entdecken/event/${slug}`
    case "routes":
      return `${base}/entdecken/route/${slug}`
    case "guides":
      return `${base}/${slug}`
    case "playgrounds":
      return `${base}/entdecken/spielplatz/${slug}`
    case "clubs":
      return `${base}/entdecken/verein/${slug}`
    default:
      return `${base}/${record.contentType}`
  }
}

export function publicCityContentUrl(
  record: Pick<CityReviewRecord, "citySlug" | "contentType" | "id" | "publicSlug">,
) {
  const configuredBase =
    process.env.NEXT_PUBLIC_BENEFITSI_CITY_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BENEFITSI_WEB_URL?.trim() ||
    "https://benefitsi.de"

  return `${configuredBase.replace(/\/$/, "")}${publicCityContentPath(record)}`
}
