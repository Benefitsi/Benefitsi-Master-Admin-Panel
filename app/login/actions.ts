"use server"

import { headers } from "next/headers"
import { isAuthRetryableFetchError } from "@supabase/supabase-js"
import { isPartnerHost } from "@/lib/portal-routing"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export type LoginActionState = {
  message: string
}

const AUTH_UNAVAILABLE_MESSAGE = "Sign-in is temporarily unavailable. Please try again."

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
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const unavailable = isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500
        || error.name === "TimeoutError" || error.name === "AbortError" || error.code === "request_timeout"
      return { message: unavailable ? AUTH_UNAVAILABLE_MESSAGE : "Invalid email or password." }
    }
  } catch {
    return { message: AUTH_UNAVAILABLE_MESSAGE }
  }

  const adminSession = await getAdminSession(supabase)

  if (!adminSession?.isAdmin) {
    await supabase.auth.signOut({ scope: "local" })
    return { message: "This account is not authorized for the Benefitsi admin panel." }
  }

  revalidatePath("/", "layout")
  redirect("/")
}
