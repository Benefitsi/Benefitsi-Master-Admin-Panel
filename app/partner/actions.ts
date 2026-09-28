"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
export async function signOutPartner() {
  const supabase = await createClient()
  await supabase.auth.signOut({scope:"local"})
  revalidatePath("/", "layout")
  redirect("/partner/login")
}
