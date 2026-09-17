import "server-only"
import { requestPublicCityRevalidation } from "./public-revalidation-request"

export function refreshPublicCity(citySlug: string, cityId: string) {
  return requestPublicCityRevalidation({ citySlug, cityId }, {
    secret: process.env.BENEFITSI_ADMIN_REVALIDATION_SECRET || process.env.BENEFITSI_WEB_REVALIDATION_SECRET,
    baseUrl: process.env.BENEFITSI_WEB_URL,
  })
}
