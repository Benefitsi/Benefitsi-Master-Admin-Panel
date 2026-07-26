"use server"

import { requireAdmin } from "@/lib/admin"
import {
  enrichPartnerWithGemini,
  type PartnerEnrichmentInput,
  type PartnerEnrichmentState,
} from "@/lib/partner-enrichment"

export async function researchPartner(
  input: PartnerEnrichmentInput,
): Promise<PartnerEnrichmentState> {
  await requireAdmin()
  return enrichPartnerWithGemini(input)
}
