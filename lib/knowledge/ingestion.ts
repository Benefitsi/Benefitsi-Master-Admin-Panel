import { createHash } from "node:crypto"

export const KNOWLEDGE_MAX_BATCH_DOCUMENTS = 20
export const KNOWLEDGE_MAX_BATCH_BYTES = 4 * 1024 * 1024

const MIN_TOKEN_LENGTH = 32
const MAX_TOKEN_LENGTH = 512
const MAX_IDEMPOTENCY_KEY_LENGTH = 200
const MAX_RUN_ID_LENGTH = 128
const MAX_RELATIVE_PATH_LENGTH = 1_000
const MAX_TITLE_LENGTH = 500
const MAX_ERROR_CODE_LENGTH = 80
const FORBIDDEN_SOURCE_KEYS = new Set([
  "source",
  "sourceid",
  "sourcekey",
  "source_id",
  "source_key",
  "ownership",
  "ownershiptype",
  "ownership_type",
  "owner",
  "ownerid",
  "owner_id",
  "m1path",
  "m1_path",
  "absolutepath",
  "absolute_path",
])

export type KnowledgeDocumentInput = {
  relativePath: string
  title: string
  content: string
  contentHash: string
  sourceModifiedAt?: string
  metadata?: Record<string, unknown>
}

export type StartKnowledgeSyncInput = {
  idempotencyKey: string
}

export type BatchKnowledgeSyncInput = {
  runId: string
  documents: KnowledgeDocumentInput[]
}

export type CompleteKnowledgeSyncInput = {
  runId: string
}

export type FailKnowledgeSyncInput = {
  runId: string
  errorCode: string
}

export class KnowledgeIngestionInputError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status = 400) {
    super(code)
    this.name = "KnowledgeIngestionInputError"
    this.code = code
    this.status = status
  }
}

export function hashIngestionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function readIngestionToken(headers: Headers) {
  const token = headers.get("x-knowledge-ingestion-token")?.trim() ?? ""
  if (
    token.length < MIN_TOKEN_LENGTH ||
    token.length > MAX_TOKEN_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(token)
  ) {
    throw new KnowledgeIngestionInputError("token_invalid", 401)
  }
  return token
}

export function isValidRelativePath(value: unknown): value is string {
  if (typeof value !== "string") return false
  if (!value || value.length > MAX_RELATIVE_PATH_LENGTH) return false
  if (value !== value.normalize("NFC")) return false
  if (value.includes("\u0000") || value.includes("\\")) return false
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false
  const segments = value.split("/")
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}

export function isValidContentHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

export function parseStartPayload(body: unknown): StartKnowledgeSyncInput {
  const record = assertSafeRecord(body)
  const idempotencyKey = readText(record, ["idempotencyKey", "idempotency_key"], MAX_IDEMPOTENCY_KEY_LENGTH)
  if (!idempotencyKey) {
    throw new KnowledgeIngestionInputError("idempotency_key_required")
  }
  return { idempotencyKey }
}

export function parseBatchPayload(body: unknown): BatchKnowledgeSyncInput {
  const record = assertSafeRecord(body)
  const runId = readRunId(record)
  const documents = record.documents
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new KnowledgeIngestionInputError("documents_required")
  }
  if (documents.length > KNOWLEDGE_MAX_BATCH_DOCUMENTS) {
    throw new KnowledgeIngestionInputError("batch_too_large", 413)
  }

  const normalizedDocuments = documents.map((document) => parseDocument(document))
  const serializedBytes = Buffer.byteLength(JSON.stringify(normalizedDocuments), "utf8")
  if (serializedBytes > KNOWLEDGE_MAX_BATCH_BYTES) {
    throw new KnowledgeIngestionInputError("batch_too_large", 413)
  }

  return { runId, documents: normalizedDocuments }
}

export function parseCompletePayload(body: unknown): CompleteKnowledgeSyncInput {
  const record = assertSafeRecord(body)
  return { runId: readRunId(record) }
}

export function parseFailPayload(body: unknown): FailKnowledgeSyncInput {
  const record = assertSafeRecord(body)
  const runId = readRunId(record)
  const errorCode = readText(record, ["errorCode", "error_code"], MAX_ERROR_CODE_LENGTH)
  const normalizedErrorCode = errorCode?.toLowerCase() ?? ""
  if (!errorCode || !/^[a-z0-9][a-z0-9_.:-]*$/.test(normalizedErrorCode)) {
    throw new KnowledgeIngestionInputError("error_code_invalid")
  }
  if (normalizedErrorCode === "arc_private" || normalizedErrorCode === "benefitsi_external") {
    throw new KnowledgeIngestionInputError("ownership_not_allowed")
  }
  return { runId, errorCode }
}

export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

function parseDocument(value: unknown): KnowledgeDocumentInput {
  const record = assertSafeRecord(value)
  const relativePath = readText(record, ["relativePath", "relative_path"], MAX_RELATIVE_PATH_LENGTH)
  if (!isValidRelativePath(relativePath)) {
    throw new KnowledgeIngestionInputError("relative_path_invalid")
  }

  const title = readText(record, ["title"], MAX_TITLE_LENGTH)
  if (!title) throw new KnowledgeIngestionInputError("title_required")

  const content = readContent(record)

  const contentHash = readText(record, ["contentHash", "content_hash"], 64)
  if (!isValidContentHash(contentHash)) {
    throw new KnowledgeIngestionInputError("content_hash_invalid")
  }

  const sourceModifiedAt = readOptionalTimestamp(record, ["sourceModifiedAt", "source_modified_at"])
  const metadata = record.metadata
  if (metadata !== undefined && !isPlainRecord(metadata)) {
    throw new KnowledgeIngestionInputError("metadata_invalid")
  }

  return {
    relativePath,
    title,
    content,
    contentHash,
    ...(sourceModifiedAt ? { sourceModifiedAt } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

function assertSafeRecord(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new KnowledgeIngestionInputError("json_object_required")
  }
  rejectForbiddenFields(value)
  return value
}

function rejectForbiddenFields(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenFields)
    return
  }
  if (!isPlainRecord(value)) return

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replaceAll("-", "").toLowerCase()
    if (FORBIDDEN_SOURCE_KEYS.has(key.toLowerCase()) || FORBIDDEN_SOURCE_KEYS.has(normalizedKey)) {
      if (normalizedKey.includes("source")) {
        throw new KnowledgeIngestionInputError("source_not_allowed")
      }
      throw new KnowledgeIngestionInputError("ownership_not_allowed")
    }
    if (typeof child === "string" && ["ARC_PRIVATE", "BENEFITSI_EXTERNAL"].includes(child)) {
      throw new KnowledgeIngestionInputError("ownership_not_allowed")
    }
    rejectForbiddenFields(child)
  }
}

function readRunId(record: Record<string, unknown>) {
  const runId = readText(record, ["runId", "run_id"], MAX_RUN_ID_LENGTH)
  if (!runId || !/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new KnowledgeIngestionInputError("run_id_invalid")
  }
  return runId
}

function readText(
  record: Record<string, unknown>,
  keys: string[],
  maxLength: number,
) {
  const key = keys.find((candidate) => candidate in record)
  if (!key) return null
  const value = record[key]
  if (typeof value !== "string") {
    throw new KnowledgeIngestionInputError(`${keys[0]}_invalid`)
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new KnowledgeIngestionInputError(`${keys[0]}_too_long`)
  }
  return trimmed
}

function readContent(record: Record<string, unknown>) {
  if (!("content" in record)) {
    throw new KnowledgeIngestionInputError("content_required")
  }
  const value = record.content
  if (typeof value !== "string") {
    throw new KnowledgeIngestionInputError("content_invalid")
  }
  if (Buffer.byteLength(value, "utf8") > KNOWLEDGE_MAX_BATCH_BYTES) {
    throw new KnowledgeIngestionInputError("content_too_long")
  }
  return value
}

function readOptionalTimestamp(record: Record<string, unknown>, keys: string[]) {
  const value = readText(record, keys, 80)
  if (!value) return undefined
  if (!Number.isFinite(Date.parse(value))) {
    throw new KnowledgeIngestionInputError("source_modified_at_invalid")
  }
  return value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
