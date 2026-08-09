"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getPartnerPortalSession } from "@/lib/partner-portal"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export type LoginActionState = {
  message: string
}

export async function login(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { message: "Email and password are required." }
  }

  if (!getSupabaseConfig().isConfigured) {
    return { message: "Supabase is missing its URL or publishable key." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { message: "Invalid email or password." }
  }

  const portalSession = await getPartnerPortalSession(supabase)

  if (
    !portalSession ||
    (!portalSession.isAdmin && portalSession.partnerIds.length === 0)
  ) {
    await supabase.auth.signOut()

    return {
      message:
        "This account is not authorized for the Benefitsi admin or partner panel.",
    }
  }

  revalidatePath("/", "layout")
  redirect(portalSession.isAdmin ? "/" : "/partner")
}
