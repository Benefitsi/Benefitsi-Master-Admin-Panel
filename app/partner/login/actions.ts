"use server"

import { headers } from "next/headers"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getPartnerPortalSession } from "@/lib/partner-portal"
import { createClient } from "@/lib/supabase/server"
import { getSupabaseConfig } from "@/lib/supabase/config"
export type PartnerLoginActionState = { message: string }

export async function partnerLogin(_previous: PartnerLoginActionState, formData: FormData): Promise<PartnerLoginActionState> {
  const host = (await headers()).get("host") ?? ""
  if (host.split(":")[0] === "admin.benefitsi.de") return {message:"Bitte auf partner.benefitsi.de anmelden."}
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  if (!email || !password) return {message:"Bitte E-Mail und Passwort eingeben."}
  if (!getSupabaseConfig().isConfigured) return {message:"Die Anmeldung ist vorübergehend nicht verfügbar."}
  const supabase = await createClient()
  const {error} = await supabase.auth.signInWithPassword({email,password})
  if (error) return {message:"E-Mail oder Passwort ist nicht korrekt."}
  const session = await getPartnerPortalSession(supabase)
  if (!session || (!session.isAdmin && session.partnerIds.length === 0)) {
    await supabase.auth.signOut({scope:"local"})
    return {message:"Für dieses Konto ist kein berechtigter Betrieb hinterlegt. Scannerzugänge verwenden die Benefitsi App."}
  }
  revalidatePath("/", "layout")
  redirect("/partner")
}
