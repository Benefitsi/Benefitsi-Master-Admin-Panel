import {
  type BatchKnowledgeSyncInput,
  jsonResponse,
  KnowledgeIngestionInputError,
  hashIngestionToken,
  parseBatchPayload,
  parseCompletePayload,
  parseFailPayload,
  parseStartPayload,
  readIngestionToken,
} from "./ingestion"
import { KNOWLEDGE_SOURCE_KEY, type KnowledgeRpcOperation } from "./rpc"

type KnowledgeRpcResult = {
  data: unknown
  error: { code?: string | null; message?: string | null } | null
}

type KnowledgeRpcCaller = (
  operation: KnowledgeRpcOperation,
  args: Record<string, unknown>,
) => Promise<KnowledgeRpcResult>

type KnowledgeLog = {
  runId: string | null
  sourceKey: typeof KNOWLEDGE_SOURCE_KEY
  durationMs: number
  acceptedCount?: number
  newCount?: number
  updatedCount?: number
  unchangedCount?: number
  deletedCount?: number
  restoredCount?: number
  errorCode?: string
}

export type KnowledgeServiceDependencies = {
  rpc: KnowledgeRpcCaller
  logger?: (event: KnowledgeLog) => void
  now?: () => number
}

const defaultLogger = (event: KnowledgeLog) => {
  console.info("knowledge_sync", event)
}

export async function handleStartKnowledgeSync(
  request: Request,
  dependencies: KnowledgeServiceDependencies,
) {
  const startedAt = (dependencies.now ?? Date.now)()
  const logger = dependencies.logger ?? defaultLogger
  let runId: string | null = null

  try {
    const token = readIngestionToken(request.headers)
    const body = await readJson(request)
    const input = parseStartPayload(body)
    const result = await dependencies.rpc("start", {
      p_token_hash: hashIngestionToken(token),
      p_idempotency_key: input.idempotencyKey,
    })
    if (result.error) return rpcFailure("sync_start_failed", logger, startedAt, runId)
    const start = readStartState(result.data)
    runId = start.runId
    if (!runId) return rpcFailure("sync_start_failed", logger, startedAt, runId)
    log(logger, startedAt, { runId })
    return jsonResponse({
      runId,
      status: start.status,
      idempotent: start.idempotent,
    })
  } catch (error) {
    return inputFailure(error, logger, startedAt, runId)
  }
}

export async function handleBatchKnowledgeSync(
  request: Request,
  dependencies: KnowledgeServiceDependencies,
) {
  const startedAt = (dependencies.now ?? Date.now)()
  const logger = dependencies.logger ?? defaultLogger
  let runId: string | null = null

  try {
    const token = readIngestionToken(request.headers)
    const body = await readJson(request)
    const input = parseBatchPayload(body)
    runId = input.runId
    const result = await dependencies.rpc("batch", {
      p_token_hash: hashIngestionToken(token),
      p_run_id: input.runId,
      p_documents: input.documents.map(toRpcDocument),
    })
    if (result.error) return rpcFailure("sync_batch_failed", logger, startedAt, runId)
    const acceptedCount = readCount(result.data, "accepted_count")
    if (acceptedCount === null) return rpcFailure("sync_batch_failed", logger, startedAt, runId)
    log(logger, startedAt, { runId, acceptedCount })
    return jsonResponse({ acceptedCount })
  } catch (error) {
    return inputFailure(error, logger, startedAt, runId)
  }
}

export async function handleCompleteKnowledgeSync(
  request: Request,
  dependencies: KnowledgeServiceDependencies,
) {
  const startedAt = (dependencies.now ?? Date.now)()
  const logger = dependencies.logger ?? defaultLogger
  let runId: string | null = null

  try {
    const token = readIngestionToken(request.headers)
    const body = await readJson(request)
    const input = parseCompletePayload(body)
    runId = input.runId
    const result = await dependencies.rpc("complete", {
      p_token_hash: hashIngestionToken(token),
      p_run_id: input.runId,
    })
    if (result.error) return rpcFailure("sync_complete_failed", logger, startedAt, runId)
    const counts = readSyncCounts(result.data)
    if (!counts) return rpcFailure("sync_complete_failed", logger, startedAt, runId)
    log(logger, startedAt, { runId, ...counts })
    return jsonResponse({ counts })
  } catch (error) {
    return inputFailure(error, logger, startedAt, runId)
  }
}

export async function handleFailKnowledgeSync(
  request: Request,
  dependencies: KnowledgeServiceDependencies,
) {
  const startedAt = (dependencies.now ?? Date.now)()
  const logger = dependencies.logger ?? defaultLogger
  let runId: string | null = null

  try {
    const token = readIngestionToken(request.headers)
    const body = await readJson(request)
    const input = parseFailPayload(body)
    runId = input.runId
    const result = await dependencies.rpc("fail", {
      p_token_hash: hashIngestionToken(token),
      p_run_id: input.runId,
      p_error_code: input.errorCode,
    })
    if (result.error) return rpcFailure("sync_fail_failed", logger, startedAt, runId)
    log(logger, startedAt, { runId, errorCode: input.errorCode })
    return jsonResponse({ status: "failed" })
  } catch (error) {
    return inputFailure(error, logger, startedAt, runId)
  }
}

async function readJson(request: Request) {
  try {
    return await request.json()
  } catch {
    throw new KnowledgeIngestionInputError("json_invalid")
  }
}

function toRpcDocument(document: BatchKnowledgeSyncInput["documents"][number]) {
  return {
    relative_path: document.relativePath,
    title: document.title,
    content: document.content,
    content_hash: document.contentHash,
    hash_version: "sha256-lf-v1",
    source_modified_at: document.sourceModifiedAt ?? null,
    metadata: document.metadata ?? {},
  }
}

function readRunId(data: unknown) {
  const row = firstRow(data)
  const value = row?.run_id ?? row?.runId
  return typeof value === "string" && value.length > 0 ? value : null
}

function readStartState(data: unknown) {
  const row = firstRow(data)
  const status = row?.status
  return {
    runId: readRunId(data),
    status: status === "succeeded" || status === "failed" || status === "aborted"
      ? status
      : "running",
    idempotent: row?.idempotent === true,
  } as const
}

function readCount(data: unknown, key: string) {
  const row = firstRow(data)
  const value = row?.[key] ?? row?.[camelize(key)]
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function readSyncCounts(data: unknown) {
  const row = firstRow(data)
  if (!row) return null
  const counts = {
    newCount: readRowCount(row, "new_count", "newCount"),
    updatedCount: readRowCount(row, "updated_count", "updatedCount"),
    unchangedCount: readRowCount(row, "unchanged_count", "unchangedCount"),
    deletedCount: readRowCount(row, "deleted_count", "deletedCount"),
    restoredCount: readRowCount(row, "restored_count", "restoredCount"),
  }
  return Object.values(counts).every((value) => value !== null)
    ? counts as {
        newCount: number
        updatedCount: number
        unchangedCount: number
        deletedCount: number
        restoredCount: number
      }
    : null
}

function readRowCount(row: Record<string, unknown>, snakeKey: string, camelKey: string) {
  const value = row[snakeKey] ?? row[camelKey]
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function camelize(value: string) {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function log(
  logger: (event: KnowledgeLog) => void,
  startedAt: number,
  fields: Omit<KnowledgeLog, "sourceKey" | "durationMs">,
) {
  logger({
    sourceKey: KNOWLEDGE_SOURCE_KEY,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...fields,
  })
}

function inputFailure(
  error: unknown,
  logger: (event: KnowledgeLog) => void,
  startedAt: number,
  runId: string | null,
) {
  if (error instanceof KnowledgeIngestionInputError) {
    log(logger, startedAt, { runId, errorCode: error.code })
    return jsonResponse({ error: error.code }, error.status)
  }
  log(logger, startedAt, { runId, errorCode: "request_invalid" })
  return jsonResponse({ error: "request_invalid" }, 400)
}

function rpcFailure(
  errorCode: string,
  logger: (event: KnowledgeLog) => void,
  startedAt: number,
  runId: string | null,
) {
  log(logger, startedAt, { runId, errorCode })
  return jsonResponse({ error: errorCode }, 502)
}
