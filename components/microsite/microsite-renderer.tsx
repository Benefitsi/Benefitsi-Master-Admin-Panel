"use client"

import type { PartnerWithDeals } from "@/lib/admin-data"
import type { MicrositeConfig } from "@/lib/microsites"
import { PartnerSignatureMicrosite } from "./partner-signature-microsite"
import { RestaurantPremiumMicrosite } from "./restaurant-premium-microsite"

export function MicrositeRenderer({
  partner,
  config,
}: {
  partner: PartnerWithDeals
  config: MicrositeConfig
}) {
  if (
    config.template === "salon-editorial" ||
    config.template === "atelier-noir" ||
    config.template === "wellness-serene" ||
    config.template === "cinema-spotlight" ||
    config.template === "festival-neon"
  ) {
    return <PartnerSignatureMicrosite partner={partner} config={config} />
  }

  return <RestaurantPremiumMicrosite partner={partner} config={config} />
}
