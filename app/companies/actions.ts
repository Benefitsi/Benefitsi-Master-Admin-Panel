"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin"
import { saveCorporateRequest, type CorporateUpdateState } from "@/lib/corporate/requests"

export async function updateCorporateRequest(_previous: CorporateUpdateState, formData: FormData): Promise<CorporateUpdateState> {
  const { supabase } = await requireAdmin()
  const result = await saveCorporateRequest(supabase, formData)
  if (result.status === "updated") revalidatePath("/companies")
  return result
}
