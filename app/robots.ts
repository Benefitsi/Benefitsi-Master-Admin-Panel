import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://benefitsi.de"

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/p/"],
        disallow: ["/", "/login", "/microsite-preview/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  }
}
