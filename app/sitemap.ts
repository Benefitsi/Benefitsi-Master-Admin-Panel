import type { MetadataRoute } from "next"
import { createClient } from "@/lib/supabase/server"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://benefitsi.de"
  const supabase = await createClient()
  const result = await supabase
    .from("microsites")
    .select("slug,updated_at")
    .not("published_version_id", "is", null)

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
