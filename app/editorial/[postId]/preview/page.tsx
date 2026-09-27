import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EditorialPreview } from "@/app/editorial/editorial-preview"
import { publishEditorialPost } from "@/app/editorial/actions"
import { PendingSubmitButton } from "@/components/pending-submit-button"
import { requireAdmin } from "@/lib/admin"
import { loadEditorialPost } from "@/lib/editorial"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Beitragsvorschau", robots: { index: false, follow: false, nocache: true } }

export default async function EditorialPreviewPage({ params, searchParams }: { params: Promise<{ postId: string }>; searchParams?: Promise<{error?:string}> }) {
  await requireAdmin()
  const { postId } = await params
  const post = await loadEditorialPost(postId)
  if (!post) notFound()
  const error = (await searchParams)?.error
  // eslint-disable-next-line react-hooks/purity -- This dynamic server route checks the publication time for the current request.
  const isPublished = post.status === "active" && post.published_at !== null && Date.parse(post.published_at) <= Date.now()

  return <main className="min-h-screen bg-white">
    <div className="border-b border-[#dbe4ee] bg-[#f3f8ff] px-5 py-4">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3">
        <div><Link href="/editorial" className="text-sm font-bold text-[#086fcc] hover:underline">← Alle Beiträge</Link><p className="mt-1 text-sm font-semibold text-[#061829]">Vorschau · Gespeicherter Stand</p><p className="mt-1 text-xs text-[#526170]">Nur im Admin sichtbar. Das Öffnen der Vorschau veröffentlicht nichts.</p></div>
        <Link href={`/editorial/${post.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-[#118cff] px-4 text-sm font-bold text-white hover:bg-[#0878df]">Beitrag bearbeiten</Link>
      </div>
    </div>
    {error ? <p role="alert" className="mx-auto my-5 max-w-[1180px] rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{error === "changed" ? "Der Beitrag wurde inzwischen geändert. Bitte prüfe die aktualisierte Vorschau vor der Veröffentlichung." : error === "sources_required" ? "Zum Veröffentlichen fehlt eine Quelle mit gültiger Webadresse. Ergänze sie unter „Beitrag bearbeiten“." : "Der Beitrag konnte nicht veröffentlicht werden. Bitte prüfe die Pflichtfelder unter „Beitrag bearbeiten“ und versuche es erneut."}</p> : null}
    <EditorialPreview post={post} />
    <div className="border-t border-[#dbe4ee] bg-[#f3f8ff] px-5 py-6">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4">
        <div><p className="font-bold text-[#061829]">{isPublished ? "Dieser Beitrag ist veröffentlicht." : "Bereit zur Veröffentlichung?"}</p><p className="mt-1 text-sm text-[#526170]">{isPublished ? "Änderungen kannst du über „Beitrag bearbeiten“ vornehmen." : "Mit einem Klick wird der geprüfte Beitrag auf der Website sichtbar."}</p></div>
        {!isPublished ? <form action={publishEditorialPost}>
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="expectedUpdatedAt" value={post.updated_at} />
          <PendingSubmitButton name="intent" value="publish_now" pendingLabel="Wird veröffentlicht…" className="min-h-11 rounded-xl bg-[#118cff] px-5 text-sm font-bold text-white hover:bg-[#0878df]">Jetzt veröffentlichen</PendingSubmitButton>
        </form> : null}
      </div>
    </div>
  </main>
}
