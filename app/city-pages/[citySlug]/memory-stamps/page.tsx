import Link from 'next/link'
import 'leaflet/dist/leaflet.css'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { AdminShell } from '@/app/admin-shell'
import { requireAdmin } from '@/lib/admin'
import { loadCityMemoryCatalog } from '@/lib/city-pages/memory-stamps-data'
import { MemoryStampEditor } from '@/components/city-pages/memory-stamp-editor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Entdeckerstempel verwalten' }

export default async function MemoryStampsPage({ params, searchParams }: {
  params: Promise<{ citySlug: string }>
  searchParams: Promise<{ stamp?: string }>
}) {
  const { supabase, adminSession } = await requireAdmin()
  const [{ citySlug }, query] = await Promise.all([params, searchParams])
  const catalog = await loadCityMemoryCatalog(citySlug, supabase)
  if (!catalog) notFound()
  return <AdminShell title="Entdeckerstempel" subtitle={catalog.city.name} adminName={adminSession.profile?.display_name || adminSession.user.email || 'Admin'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={`/city-pages/${citySlug}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#0b75d9]"><ArrowLeft size={16} aria-hidden />Zum Stadtportal</Link>
      <a href={`https://benefitsi.de/stadt/${citySlug}#entdeckerstempel`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#0b75d9]">Öffentlich ansehen<ExternalLink size={16} aria-hidden /></a>
    </div>
    <p className="max-w-3xl text-sm leading-6 text-slate-600">Verwalte die ortsgebundenen Stempel für diese Stadt. Freigegebene Stempel erscheinen in der Benefitsi-App und auf der Stadtseite. Änderungen am Sammelort oder Standortnachweis benötigen eine neue Prüfung. Bereits gesammelte Erinnerungen bleiben erhalten.</p>
    <MemoryStampEditor catalog={catalog} selectedId={query.stamp} />
  </AdminShell>
}
