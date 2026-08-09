import type { MetadataRoute } from "next"
import { createServiceRoleClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://benefitsi.de"
  const supabase = createServiceRoleClient()
  const versionsResult = await supabase
    .from("microsite_versions")
    .select("id")
    .eq("status", "published")

  if (versionsResult.error) {
    return []
  }

  const versionIds = (versionsResult.data ?? [])
    .map((version) => version.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  if (versionIds.length === 0) {
    return []
  }

  const result = await supabase
    .from("microsites")
    .select("slug,updated_at")
    .in("published_version_id", versionIds)

  if (result.error) {
    return []
  }

  return (result.data ?? [])
    .filter((row) => typeof row.slug === "string" && row.slug)
    .map((row) => ({
      url: `${origin}/p/${encodeURIComponent(row.slug as string)}`,
      lastModified: row.updated_at ? new Date(row.updated_at as string) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))
}
