"use client"

import type { PartnerWithDeals } from "@/lib/admin-data"
import type { MicrositeConfig } from "@/lib/microsites"
import { RestaurantPremiumMicrosite } from "./restaurant-premium-microsite"

export function MicrositeRenderer({
  partner,
  config,
  showAppDownloadPopup = true,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
  showAppDownloadPopup?: boolean
}) {
  return (
    <RestaurantPremiumMicrosite
      key={`${partner.id || partner.slug || "partner"}-${config.language}`}
      partner={partner}
      config={config}
      showAppDownloadPopup={showAppDownloadPopup}
    />
  )
}
