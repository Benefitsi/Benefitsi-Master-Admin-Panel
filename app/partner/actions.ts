"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"

export async function signOutPartner() {
  if (getSupabaseConfig().isConfigured) {
    const supabase = await createClient()
    await supabase.auth.signOut()
  }

  revalidatePath("/", "layout")
  redirect("/partner/login")
}
