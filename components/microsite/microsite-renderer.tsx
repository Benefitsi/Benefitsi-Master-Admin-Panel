"use client"

import type { PartnerWithDeals } from "@/lib/admin-data"
import type { MicrositeConfig } from "@/lib/microsites"
import { RestaurantPremiumMicrosite } from "./restaurant-premium-microsite"
import { CategoryPremiumMicrosite } from "./category-premium-microsite"

export function MicrositeRenderer({
  partner,
  config,
  showAppDownloadPopup = true,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  showAppDownloadPopup?: boolean
}) {
  if (config.template !== "restaurant-premium") {
    return <CategoryPremiumMicrosite key={`${partner.id || partner.slug || "partner"}-${config.language}-${config.template}`} partner={partner} config={config} template={config.template} showAppDownloadPopup={showAppDownloadPopup} />
  }
  return (
    <RestaurantPremiumMicrosite
      key={`${partner.id || partner.slug || "partner"}-${config.language}`}
      partner={partner}
      config={config}
      showAppDownloadPopup={showAppDownloadPopup}
    />
  )
}
