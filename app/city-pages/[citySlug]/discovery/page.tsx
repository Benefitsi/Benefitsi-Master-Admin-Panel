import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { AdminShell } from "@/app/admin-shell"
import { requireAdmin } from "@/lib/admin"
import { loadDiscoveryImages } from "@/lib/city-pages/discovery-images-data"
import { DiscoveryImageEditor } from "@/components/city-pages/discovery-image-editor"

export const dynamic = "force-dynamic"
export const metadata = { title: "Startseitenbilder", description: "Vorschaubilder und Bildausschnitte für die Entdecken-Themen der Stadtseite auswählen." }

export default async function DiscoveryImagesPage({ params }: { params: Promise<{ citySlug: string }> }) {
  const { adminSession } = await requireAdmin()
  const { citySlug } = await params
  const data = await loadDiscoveryImages(citySlug)
  if (!data) notFound()
  return <AdminShell title="Startseitenbilder" subtitle={`${data.city.name} · Entdecken-Themen`} adminName={adminSession.profile?.display_name || adminSession.user.email || "Admin"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={`/city-pages/${data.city.slug}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#0b75d9]"><ArrowLeft className="size-4" aria-hidden />Zur Stadtverwaltung</Link>
      <a href={`https://benefitsi.de/stadt/${data.city.slug}#entdecken`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#061829]/15 bg-white px-4 text-sm font-bold">Startseite ansehen<ExternalLink className="size-4" aria-hidden /></a>
    </div>
    <section className="rounded-2xl border border-[#0b75d9]/15 bg-[#edf6ff] p-5 sm:p-6">
      <h2 className="text-2xl font-black tracking-tight">Die passenden Bilder für deine Stadt</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#45647e]">Hier bestimmst du die sechs Vorschaubilder im Bereich „{data.city.name.replace(" am Trifels", "")} entdecken“. Wähle ein freigegebenes Bild und passe den Ausschnitt an. Deine Auswahl bleibt bestehen, bis du sie änderst oder zur Automatik zurückkehrst.</p>
    </section>
    <DiscoveryImageEditor cityId={data.city.id} assets={data.assets} assignments={data.assignments} />
  </AdminShell>
}
