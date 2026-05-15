"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getAdminProfileForIdentity, isAdminProfile } from "@/lib/admin"
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
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { message: "Invalid email or password." }
  }

  const profile = data.user
    ? await getAdminProfileForIdentity(supabase, {
        id: data.user.id,
        email: data.user.email ?? email,
      })
    : null

  if (!isAdminProfile(profile)) {
    await supabase.auth.signOut()

    return {
      message: profile
        ? "This account is not authorized for the admin panel."
        : "No admin profile was found for this account. Check that users.uid or users.email matches this login.",
    }
  }

  revalidatePath("/", "layout")
  redirect("/")
}
