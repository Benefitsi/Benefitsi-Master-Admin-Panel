"use server"

import { headers } from "next/headers"
import { isPartnerHost } from "@/lib/portal-routing"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export type LoginActionState = {
  message: string
}

export async function login(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  if (isPartnerHost((await headers()).get("host") ?? "")) return {message:"Admin sign-in is unavailable on the partner portal."}
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

  const adminSession = await getAdminSession(supabase)

  if (!adminSession?.isAdmin) {
    await supabase.auth.signOut({ scope: "local" })
    return { message: "This account is not authorized for the Benefitsi admin panel." }
  }

  revalidatePath("/", "layout")
  redirect("/")
}
