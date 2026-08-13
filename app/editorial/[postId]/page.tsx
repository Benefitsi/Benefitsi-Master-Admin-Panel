import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminShell } from "@/app/admin-shell"
import { updateEditorialPost } from "@/app/editorial/actions"
import { EditorialForm } from "@/app/editorial/editorial-form"
import { requireAdmin } from "@/lib/admin"
import { loadEditorialPost, loadEditorialWorkspace } from "@/lib/editorial"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Magazinbeitrag bearbeiten",
  description: "Editorialbeitrag prüfen und veröffentlichen.",
}

type SearchParams = { error?: string }

export default async function EditorialDetailPage({ params, searchParams }: { params: Promise<{ postId: string }>; searchParams: Promise<SearchParams> }) {
  const { adminSession } = await requireAdmin()
  const { postId } = await params
  const query = await searchParams
  const [post, workspace] = await Promise.all([loadEditorialPost(postId), loadEditorialWorkspace()])
  if (!post) notFound()
  const adminName = adminSession.profile?.display_name || adminSession.profile?.email || adminSession.user.email || "Admin"

  return (
    <AdminShell adminName={adminName} title="Magazinbeitrag bearbeiten" subtitle={`${post.title} · ${post.status === "active" ? "öffentlich aktiv" : "noch nicht öffentlich"}`}>
      <Link href="/editorial" className="inline-flex items-center text-sm font-black text-[#0b75d9] hover:text-[#075eae]">← Zur Editorial-Übersicht</Link>
      {query.error ? <ErrorMessage code={query.error} /> : null}
      {workspace.warnings.map((warning) => <Warning key={warning}>{warning}</Warning>)}
      <EditorialForm action={updateEditorialPost} initial={post} cities={workspace.cities} partners={workspace.partners} />
    </AdminShell>
  )
}

function ErrorMessage({ code }: { code: string }) {
  const message = code === "duplicate_slug" ? "Dieser Slug ist im gewählten Bereich bereits vergeben." : "Der Beitrag konnte nicht gespeichert werden. Bitte Pflichtfelder und JSON-Strukturen prüfen."
  return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{message}</div>
}

function Warning({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">{children}</div>
}
