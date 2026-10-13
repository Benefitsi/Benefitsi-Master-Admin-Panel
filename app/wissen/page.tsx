import { BenefitsiKnowledgeEntry } from "@/components/knowledge/benefitsi-knowledge-entry"
import { AdminTranslationBoundary } from "@/components/admin-translation-boundary"
import type { Metadata } from "next"

import { AdminShell } from "@/app/admin-shell"
import { ManagedNoteDetail, type ManagedNoteResult } from "@/components/knowledge/benefitsi-note-detail"
import { KnowledgeControlError, parseKnowledgeNoteRead } from "@/lib/benefitsi-knowledge-controls"
import { requestKnowledgeNote } from "@/lib/benefitsi-knowledge-controls-server"
import { requireAdmin } from "@/lib/admin"
import {
  getBenefitsiKnowledgeDocument,
  getBenefitsiKnowledgeStatus,
  searchBenefitsiKnowledge,
  type KnowledgeDocumentDetail,
} from "@/lib/knowledge/read"
import { KnowledgeBrowser } from "./knowledge-browser"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Wissen | Benefitsi Admin",
  description: "Privater, schreibgeschützter Benefitsi-Wissensspiegel.",
}

const PAGE_SIZE = 50

type SearchParams = Record<string, string | string[] | undefined>

export default async function WissenPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { adminSession } = await requireAdmin()
  const params = await searchParams
  const query = singleQueryValue(params.q).trim().slice(0, 200)
  const page = readPage(singleQueryValue(params.page))
  const documentId = singleQueryValue(params.document)
  const offset = page * PAGE_SIZE
  const [status, search, managedNote] = await Promise.all([
    getBenefitsiKnowledgeStatus(),
    searchBenefitsiKnowledge({ query, limit: PAGE_SIZE, offset }),
    readManagedNote(params.note),
  ])
  const detail: KnowledgeDocumentDetail | null = documentId
    ? await getBenefitsiKnowledgeDocument(documentId)
    : null
  const adminName =
    adminSession.profile?.display_name ||
    adminSession.profile?.email ||
    adminSession.user.email ||
    "Admin"

  return (
    <AdminShell
      adminName={adminName}
      title="Wissensspiegel"
      subtitle="Privater Benefitsi-Wissensstand – schreibgeschützte Ansicht"
    >
      <AdminTranslationBoundary><details className="mb-5 rounded-2xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Aufgabe oder Wissen speichern</summary><BenefitsiKnowledgeEntry /></details></AdminTranslationBoundary>
      {managedNote ? <AdminTranslationBoundary><ManagedNoteDetail result={managedNote} /></AdminTranslationBoundary> : null}
      <KnowledgeBrowser
        query={query}
        page={page}
        status={status}
        search={search}
        detail={detail}
      />
    </AdminShell>
  )
}

function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function readPage(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0
  return Math.min(parsed, 10_000)
}

async function readManagedNote(value: string | string[] | undefined): Promise<ManagedNoteResult | null> {
  if (value === undefined) return null
  if (typeof value !== "string") return { state: "invalid" }
  try {
    const { id } = parseKnowledgeNoteRead({ id: value })
    return { state: "ready", note: await requestKnowledgeNote(id) }
  } catch (error) {
    const code = error instanceof KnowledgeControlError ? error.code : "unavailable"
    return { state: code === "permission_denied" ? "forbidden" : code === "invalid_request" || code === "invalid_response" ? "invalid" : "unavailable" }
  }
}
