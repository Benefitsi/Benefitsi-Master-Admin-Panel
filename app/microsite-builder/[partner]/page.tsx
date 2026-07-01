import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getAdminSession } from "@/lib/admin"
import { getDashboardData } from "@/lib/admin-data"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { MicrositePanel } from "../../microsite-panel"

export const dynamic = "force-dynamic"

type PageProps = {
  params: Promise<{ partner: string }>
}

export default async function MicrositeBuilderPage({ params }: PageProps) {
  const config = getSupabaseConfig()

  if (!config.isConfigured) {
    redirect("/login")
  }

  const supabase = await createClient()
  const adminSession = await getAdminSession(supabase)

  if (!adminSession?.isAdmin) {
    redirect("/login")
  }

  const { partner: identifier } = await params
  const dashboard = await getDashboardData(supabase)
  const partner = dashboard.partners.find(
    (item) =>
      item.id === identifier ||
      item.slug === identifier ||
      item.subdomain === identifier ||
      item.microsite?.slug === identifier,
  )

  if (!partner) {
    notFound()
  }

  const previewIdentifier = partner.slug || partner.subdomain || partner.id || identifier

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f3efe7] text-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
              Microsite PageBuilder · Vollbild
            </p>
            <h1 className="mt-1 text-xl font-black tracking-[-0.04em] text-zinc-950">
              {partner.name || "Partner"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50"
            >
              Zurück zum Admin
            </Link>
            <Link
              href={`/microsite-preview/${encodeURIComponent(previewIdentifier)}?source=builder`}
              target="_blank"
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800"
            >
              Live-Vorschau öffnen
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1800px] min-w-0 p-3 sm:p-5">
        <MicrositePanel
          key={`${partner.id ?? partner.name ?? "microsite"}-${partner.microsite?.draftVersion?.id ?? partner.microsite?.publishedVersion?.id ?? "new"}`}
          partner={partner}
          fullscreen
        />
      </section>
    </main>
  )
}
