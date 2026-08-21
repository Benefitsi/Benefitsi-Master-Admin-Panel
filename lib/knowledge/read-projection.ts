import { isValidRelativePath } from "./ingestion"
import { KNOWLEDGE_SOURCE_KEY } from "./rpc"

export type KnowledgeDocumentListItem = {
  id: string
  relativePath: string
  title: string
  sourceModifiedAt: string | null
  syncedAt: string | null
  isDeleted: boolean
}

export type KnowledgeDocumentDetail = KnowledgeDocumentListItem & {
  content: string
}

export type BenefitsiKnowledgeStatus = {
  status: string
  lastSuccessfulSyncAt: string | null
  documentCount: number
  lastErrorCode: string | null
}

export type KnowledgeSearchResult = {
  items: KnowledgeDocumentListItem[]
  totalCount: number
  hasMore: boolean
  offset: number
  errorCode?: string
}

export function projectKnowledgeListRow(value: unknown): KnowledgeDocumentListItem | null {
  const row = asRecord(value)
  if (!row || !isBenefitsiRow(row)) return null

  const id = safeId(row.id ?? row.document_id)
  const relativePath = safeRelativePath(row.relative_path ?? row.relativePath)
  if (!id || !relativePath) return null

  return {
    id,
    relativePath,
    title: safeTitle(row.title, relativePath),
    sourceModifiedAt: safeIso(row.source_modified_at ?? row.sourceModifiedAt),
    syncedAt: safeIso(row.synced_at ?? row.syncedAt ?? row.last_synced_at ?? row.lastSyncedAt ?? row.updated_at ?? row.updatedAt),
    isDeleted: row.is_deleted === true || row.isDeleted === true,
  }
}

export function projectKnowledgeDetailRow(value: unknown): KnowledgeDocumentDetail | null {
  const listItem = projectKnowledgeListRow(value)
  const row = asRecord(value)
  if (!listItem || !row || typeof row.content !== "string") return null
  return {
    ...listItem,
    content: row.content,
  }
}

export function projectKnowledgeStatus(value: unknown): BenefitsiKnowledgeStatus | null {
  const row = asRecord(Array.isArray(value) ? value[0] : value)
  if (!row || !isBenefitsiRow(row)) return null

  const latestStatus = asRecord(row.latest_run ?? row.latestRun)?.status
  const status = row.status ?? (
    latestStatus === "succeeded"
      ? "healthy"
      : latestStatus === "running"
        ? "syncing"
        : latestStatus === "failed" || latestStatus === "aborted"
          ? "failed"
          : "unknown"
  )
  return {
    status: safeStatus(status),
    lastSuccessfulSyncAt: safeIso(
      row.last_successful_sync_at ?? row.lastSuccessfulSyncAt,
    ),
    documentCount: safeCount(row.document_count ?? row.documentCount ?? row.active_document_count ?? row.activeDocumentCount),
    lastErrorCode: safeErrorCode(row.last_error_code ?? row.lastErrorCode),
  }
}

export function normalizeKnowledgeSearch(
  value: unknown,
  offset: number,
): KnowledgeSearchResult {
  const record = asRecord(value)
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(record?.documents)
      ? record.documents
      : Array.isArray(record?.items)
        ? record.items
        : Array.isArray(record?.rows)
          ? record.rows
          : []
  const items = rows
    .map(projectKnowledgeListRow)
    .filter((item): item is KnowledgeDocumentListItem => item !== null)
  const totalCount = safeCount(
    record?.total_count ?? record?.totalCount ?? record?.count,
    safeCount(rows[0] && asRecord(rows[0])?.total_count, offset + items.length),
  )
  const hasMore = typeof record?.has_more === "boolean"
    ? record.has_more
    : typeof record?.hasMore === "boolean"
      ? record.hasMore
      : offset + items.length < totalCount

  return { items, totalCount, hasMore, offset }
}

function isBenefitsiRow(row: Record<string, unknown>) {
  const source = row.source_key ?? row.sourceKey
  return source === undefined || source === KNOWLEDGE_SOURCE_KEY
}

function safeId(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(trimmed) ? trimmed : null
}

function safeRelativePath(value: unknown) {
  return isValidRelativePath(value) ? value : null
}

function safeTitle(value: unknown, relativePath: string) {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500)
  return relativePath.split("/").at(-1) ?? relativePath
}

function safeIso(value: unknown) {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) {
    return null
  }
  return value
}

function safeCount(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback
}

function safeStatus(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(value)) {
    return "unknown"
  }
  return value
}

function safeErrorCode(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_.:-]{0,79}$/i.test(value)) {
    return null
  }
  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
