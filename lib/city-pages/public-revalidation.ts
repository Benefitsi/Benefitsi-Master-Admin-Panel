import "server-only"
import { requestPublicCityRevalidation } from "./public-revalidation-request"

export function refreshPublicCity(citySlug: string, cityId: string) {
  const publisherSecret = process.env.BENEFITSI_PUBLISHER_REVALIDATION_SECRET?.trim()
  if (publisherSecret && (publisherSecret.length < 32 || !/^[!-~]+$/.test(publisherSecret))) {
    return Promise.resolve("not_configured" as const)
  }
  return requestPublicCityRevalidation({ citySlug, cityId }, {
    secret: publisherSecret || process.env.BENEFITSI_ADMIN_REVALIDATION_SECRET?.trim() || process.env.BENEFITSI_WEB_REVALIDATION_SECRET,
    endpoint: process.env.BENEFITSI_WEB_REVALIDATION_URL,
    vercelEnv: process.env.VERCEL_ENV,
    protectionBypassSecret: process.env.BENEFITSI_WEB_PROTECTION_BYPASS_SECRET,
  })
}
