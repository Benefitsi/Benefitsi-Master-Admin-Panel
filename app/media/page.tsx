import type { Metadata } from "next"
import { AdminShell } from "@/app/admin-shell"
import { CityMediaLibrary } from "@/components/city-media/media-library"
import { requireAdmin } from "@/lib/admin"
import { loadCityMediaLibraryData } from "@/lib/city-media/data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Media Library",
  description: "City-Media-Assets zentral hochladen, zuweisen und kontrollieren.",
}

type SearchParams = {
  city?: string
  entityType?: string
  entityId?: string
  entityKey?: string
}

export default async function MediaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { adminSession } = await requireAdmin()
  const params = await searchParams
  const data = await loadCityMediaLibraryData()
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"

  return (
    <AdminShell adminName={adminName} title="Media Library" subtitle="City-Bilder, Rollen, Provenance und manuelle Auswahl zentral verwalten">
      <CityMediaLibrary initialData={data} initialCitySlug={params.city} initialEntityType={params.entityType} initialEntityId={params.entityId} initialEntityKey={params.entityKey} />
    </AdminShell>
  )
}
