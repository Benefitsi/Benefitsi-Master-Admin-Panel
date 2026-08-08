"use server"

import { signOut } from "@/app/actions"

export async function signOutPartner() {
  return signOut()
}
