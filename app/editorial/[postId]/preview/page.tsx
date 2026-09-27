import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EditorialPreview } from "@/app/editorial/editorial-preview"
import { requireAdmin } from "@/lib/admin"
import { loadEditorialPost } from "@/lib/editorial"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Beitragsvorschau", robots: { index: false, follow: false, nocache: true } }

export default async function EditorialPreviewPage({ params }: { params: Promise<{ postId: string }> }) {
  await requireAdmin()
  const { postId } = await params
  const post = await loadEditorialPost(postId)
  if (!post) notFound()

  return <main className="min-h-screen bg-white">
    <div className="border-b border-[#dbe4ee] bg-[#f3f8ff] px-5 py-4">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3">
        <div><Link href="/editorial" className="text-sm font-bold text-[#086fcc] hover:underline">← Alle Beiträge</Link><p className="mt-1 text-sm font-semibold text-[#061829]">Vorschau · Gespeicherter Stand</p><p className="mt-1 text-xs text-[#526170]">Nur im Admin sichtbar. Das Öffnen der Vorschau veröffentlicht nichts.</p></div>
        <Link href={`/editorial/${post.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-[#118cff] px-4 text-sm font-bold text-white hover:bg-[#0878df]">Beitrag bearbeiten</Link>
      </div>
    </div>
    <EditorialPreview post={post} />
  </main>
}
