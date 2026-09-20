import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import { MediaInventory } from "@/components/city-media/media-inventory"
import { requireAdmin } from "@/lib/admin"
import { loadMediaInventory } from "@/lib/city-media/inventory-data"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Medien | Benefitsi Admin", description: "Bilder und Stadt-Zuordnungen prüfen." }

type Params = { q?: string | string[]; city?: string | string[]; status?: string | string[] }
const parameter = (value: string | string[] | undefined) => typeof value === "string" ? value.slice(0, 200) : ""

export default async function MediaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, adminSession } = await requireAdmin()
  const params = await searchParams
  const data = await loadMediaInventory(supabase)
  return <AdminShell adminName={adminSession.profile?.display_name || adminSession.user.email || "Admin"} title="Medien" subtitle="Bestand und öffentliche Einsatzorte prüfen">
    <MediaInventory data={data} query={parameter(params.q)} cityId={parameter(params.city)} status={parameter(params.status)} />
  </AdminShell>
}
