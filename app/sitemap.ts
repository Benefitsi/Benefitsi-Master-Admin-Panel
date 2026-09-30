import type { MetadataRoute } from "next"
import { createServiceRoleClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://benefitsi.de"
  const supabase = createServiceRoleClient()
  const result = await supabase.rpc("get_public_microsites_v1")
  if (result.error) {
    return []
  }

  return ((result.data ?? []) as Array<{slug:string;updated_at:string}>)
    .filter((row) => typeof row.slug === "string" && row.slug)
    .map((row) => ({
      url: `${origin}/p/${encodeURIComponent(row.slug as string)}`,
      lastModified: row.updated_at ? new Date(row.updated_at as string) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))
}
