"use server"

import { createCompany, updateCompany, issueInvitation, revokeInvitation, removeMember } from "@/lib/corporate/company-mutations"
import { isUuid, type CompanyMutationState } from "@/lib/corporate/companies"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin"
import { saveCorporateRequest, type CorporateUpdateState } from "@/lib/corporate/requests"

export async function updateCorporateRequest(_previous: CorporateUpdateState, formData: FormData): Promise<CorporateUpdateState> {
  const { supabase } = await requireAdmin()
  const result = await saveCorporateRequest(supabase, formData)
  if (result.status === "updated") revalidatePath("/companies")
  return result
}

export async function createCorporateCompany(formData: FormData): Promise<CompanyMutationState> {
  const { supabase } = await requireAdmin()
  const result = await createCompany(supabase, formData)
  if (result.status === "created" && result.companyId) {
    revalidatePath("/companies")
    revalidatePath(`/companies/${result.companyId}`)
  }
  return result
}
export async function updateCorporateCompany(formData: FormData): Promise<CompanyMutationState> {
  const { supabase } = await requireAdmin()
  const result = await updateCompany(supabase, formData)
  if (result.status === "updated") refreshCompany(formData)
  return result
}
export async function issueCorporateInvitation(formData: FormData): Promise<CompanyMutationState> {
  const { supabase } = await requireAdmin()
  const result = await issueInvitation(supabase, formData)
  if (result.status === "issued") refreshCompany(formData)
  return result
}
export async function revokeCorporateInvitation(formData: FormData): Promise<CompanyMutationState> {
  const { supabase } = await requireAdmin()
  const result = await revokeInvitation(supabase, formData)
  if (result.status === "revoked") refreshCompany(formData)
  return result
}
export async function removeCorporateMember(formData: FormData): Promise<CompanyMutationState> {
  const { supabase } = await requireAdmin()
  const result = await removeMember(supabase, formData)
  if (result.status === "removed") refreshCompany(formData)
  return result
}
function refreshCompany(data: FormData) {
  const id = data.get("companyId")
  if (isUuid(id)) {
    revalidatePath("/companies")
    revalidatePath(`/companies/${id}`)
  }
}
