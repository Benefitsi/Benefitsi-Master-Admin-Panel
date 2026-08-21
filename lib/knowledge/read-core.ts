import {
  normalizeKnowledgeSearch,
  projectKnowledgeDetailRow,
  projectKnowledgeStatus,
  type BenefitsiKnowledgeStatus,
  type KnowledgeDocumentDetail,
  type KnowledgeSearchResult,
} from "./read-projection"
import { type KnowledgeRpcOperation } from "./rpc"

export type KnowledgeReadRpcResult = {
  data: unknown
  error: { code?: string | null; message?: string | null } | null
}

export type KnowledgeReadRpcCaller = (
  operation: KnowledgeRpcOperation,
  args: Record<string, unknown>,
) => Promise<KnowledgeReadRpcResult>

export type KnowledgeSearchOptions = {
  query: string
  limit?: number
  offset?: number
}

export type KnowledgeReadClient = {
  searchBenefitsiKnowledge(options: KnowledgeSearchOptions): Promise<KnowledgeSearchResult>
  getBenefitsiKnowledgeDocument(documentId: string): Promise<KnowledgeDocumentDetail | null>
  getBenefitsiKnowledgeStatus(): Promise<BenefitsiKnowledgeStatus>
}

export function createKnowledgeReadClient(rpc: KnowledgeReadRpcCaller): KnowledgeReadClient {
  return {
    async searchBenefitsiKnowledge({ query, limit = 50, offset = 0 }) {
      const safeQuery = typeof query === "string" ? query.trim().slice(0, 200) : ""
      const safeLimit = clampInteger(limit, 50, 1, 50)
      const safeOffset = clampInteger(offset, 0, 0, Number.MAX_SAFE_INTEGER)
      const result = await rpc("search", {
        p_query: safeQuery,
        p_limit: safeLimit,
        p_offset: safeOffset,
      })
      if (result.error) {
        return {
          items: [],
          totalCount: 0,
          hasMore: false,
          offset: safeOffset,
          errorCode: "knowledge_search_unavailable",
        }
      }
      return normalizeKnowledgeSearch(result.data, safeOffset)
    },

    async getBenefitsiKnowledgeDocument(documentId) {
      const safeId = typeof documentId === "string" ? documentId.trim() : ""
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(safeId)) return null
      const result = await rpc("detail", { p_document_id: safeId })
      if (result.error) return null
      return projectKnowledgeDetailRow(firstRow(result.data))
    },

    async getBenefitsiKnowledgeStatus() {
      const result = await rpc("status", {})
      if (result.error) {
        return {
          status: "unavailable",
          lastSuccessfulSyncAt: null,
          documentCount: 0,
          lastErrorCode: "knowledge_status_unavailable",
        }
      }
      return projectKnowledgeStatus(firstRow(result.data)) ?? {
        status: "unknown",
        lastSuccessfulSyncAt: null,
        documentCount: 0,
        lastErrorCode: "knowledge_status_invalid",
      }
    },
  }
}

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] ?? null : value
}

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return fallback
  return Math.min(maximum, Math.max(minimum, value))
}
