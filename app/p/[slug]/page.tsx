import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { MicrositeRenderer } from "@/components/microsite/microsite-renderer"
import { getPublishedMicrositePage } from "@/lib/public-microsite"
import {
  createMicrositeMetadata,
  createMicrositeStructuredData,
} from "@/lib/microsite-seo"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const microsite = await getPublishedMicrositePage(supabase, slug)

  if (!microsite) {
    return {
      title: "Partnerseite nicht gefunden | Benefitsi",
      robots: { index: false, follow: false },
    }
  }

  return createMicrositeMetadata({
    partner: microsite.partner,
    config: microsite.config,
    slug,
  })
}

export default async function PublishedPartnerMicrositePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const microsite = await getPublishedMicrositePage(supabase, slug)

  if (!microsite) {
    notFound()
  }

  const structuredData = createMicrositeStructuredData({
    partner: microsite.partner,
    config: microsite.config,
    slug,
  })

  return (
    <main className="min-h-screen bg-[#f7f6f3] px-0 py-0 sm:px-4 sm:py-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <MicrositeRenderer partner={microsite.partner} config={microsite.config} />
    </main>
  )
}
