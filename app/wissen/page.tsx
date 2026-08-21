import type { Metadata } from "next"

import { AdminShell } from "@/app/admin-shell"
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
  const [status, search] = await Promise.all([
    getBenefitsiKnowledgeStatus(),
    searchBenefitsiKnowledge({ query, limit: PAGE_SIZE, offset }),
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
