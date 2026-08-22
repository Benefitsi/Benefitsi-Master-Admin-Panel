import assert from "node:assert/strict"
import test from "node:test"

import {
  KNOWLEDGE_MAX_BATCH_BYTES,
  KNOWLEDGE_MAX_BATCH_DOCUMENTS,
  hashIngestionToken,
  isValidContentHash,
  isValidRelativePath,
  parseBatchPayload,
  parseCompletePayload,
  parseFailPayload,
  parseStartPayload,
  readIngestionToken,
} from "../lib/knowledge/ingestion.ts"
import {
  handleBatchKnowledgeSync,
  handleCompleteKnowledgeSync,
  handleFailKnowledgeSync,
  handleStartKnowledgeSync,
} from "../lib/knowledge/ingestion-service.ts"
import { KNOWLEDGE_RPC_NAMES } from "../lib/knowledge/rpc.ts"

const token = "benefitsi-ingestion-token-with-more-than-32-bytes"
const runId = "11111111-1111-4111-8111-111111111111"

function request(path, body, headers = {}) {
  return new Request(`https://admin.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-knowledge-ingestion-token": token,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function rpcFor(operation, calls) {
  return async (name, args) => {
    calls.push({ name, args })
    if (operation === "start") return { data: { run_id: runId }, error: null }
    if (operation === "batch") return { data: { accepted_count: 2 }, error: null }
    if (operation === "complete") {
      return {
        data: {
          new_count: 1,
          updated_count: 2,
          unchanged_count: 3,
          deleted_count: 4,
          restored_count: 5,
        },
        error: null,
      }
    }
    return { data: { status: "failed" }, error: null }
  }
}

function validDocument(overrides = {}) {
  return {
    relativePath: "handbook/onboarding.md",
    title: "Onboarding",
    content: "# Onboarding\n\nInhalt",
    contentHash: "a".repeat(64),
    sourceModifiedAt: "2026-08-21T12:00:00.000Z",
    ...overrides,
  }
}

test("hashes the raw ingestion token before it can enter the RPC boundary", () => {
  assert.equal(
    hashIngestionToken("secret-token"),
    "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
  )
})

test("rejects absent and short ingestion tokens", () => {
  assert.throws(() => readIngestionToken(new Headers()), /token_invalid/)
  assert.throws(
    () => readIngestionToken(new Headers([["x-knowledge-ingestion-token", "short"]])),
    /token_invalid/,
  )
})

test("accepts only safe relative paths and canonical SHA-256 document hashes", () => {
  assert.equal(isValidRelativePath("handbook/onboarding.md"), true)
  assert.equal(isValidRelativePath("../private.md"), false)
  assert.equal(isValidRelativePath("/absolute.md"), false)
  assert.equal(isValidRelativePath("C:\\absolute.md"), false)
  assert.equal(isValidRelativePath("handbook/\u0000.md"), false)
  assert.equal(isValidRelativePath("handbook/./draft.md"), false)
  assert.equal(isValidContentHash("a".repeat(64)), true)
  assert.equal(isValidContentHash("A".repeat(64)), false)
  assert.equal(isValidContentHash("not-a-hash"), false)
})

test("preserves Markdown content whitespace for the worker-provided hash", () => {
  const parsed = parseBatchPayload({
    runId,
    documents: [validDocument({ content: "\n# Heading\n\nBody\n" })],
  })
  assert.equal(parsed.documents[0].content, "\n# Heading\n\nBody\n")
})

test("rejects client ownership fields and ARC_PRIVATE in every sync payload", () => {
  assert.throws(
    () => parseStartPayload({ idempotencyKey: "sync-1", ownership: "BENEFITSI_EXTERNAL" }),
    /ownership_not_allowed/,
  )
  assert.throws(
    () => parseBatchPayload({ runId, documents: [validDocument({ metadata: { ownership: "ARC_PRIVATE" } })] }),
    /ownership_not_allowed/,
  )
  assert.throws(
    () => parseCompletePayload({ runId, sourceKey: "benefitsi-obsidian" }),
    /source_not_allowed/,
  )
  assert.throws(
    () => parseFailPayload({ runId, errorCode: "ARC_PRIVATE" }),
    /ownership_not_allowed/,
  )
})

test("rejects batches above both document-count and serialized-size limits", () => {
  const tooMany = Array.from(
    { length: KNOWLEDGE_MAX_BATCH_DOCUMENTS + 1 },
    (_, index) => validDocument({ relativePath: `notes/${index}.md` }),
  )
  assert.throws(() => parseBatchPayload({ runId, documents: tooMany }), /batch_too_large/)

  const huge = validDocument({ content: "x".repeat(KNOWLEDGE_MAX_BATCH_BYTES) })
  assert.throws(() => parseBatchPayload({ runId, documents: [huge] }), /batch_too_large/)
})

test("returns the exact safe JSON shapes for start, batch, complete, and fail", async () => {
  const calls = []

  const start = await handleStartKnowledgeSync(request("/start", { idempotencyKey: "sync-1" }), {
    rpc: rpcFor("start", calls),
  })
  assert.equal(start.status, 200)
  assert.deepEqual(await start.json(), { runId, status: "running", idempotent: false })

  const batch = await handleBatchKnowledgeSync(
    request("/batch", { runId, documents: [validDocument(), validDocument({ relativePath: "guide.md" })] }),
    { rpc: rpcFor("batch", calls) },
  )
  assert.equal(batch.status, 200)
  assert.deepEqual(await batch.json(), { acceptedCount: 2 })

  const complete = await handleCompleteKnowledgeSync(
    request("/complete", { runId }),
    { rpc: rpcFor("complete", calls) },
  )
  assert.equal(complete.status, 200)
  assert.deepEqual(await complete.json(), {
    counts: {
      newCount: 1,
      updatedCount: 2,
      unchangedCount: 3,
      deletedCount: 4,
      restoredCount: 5,
    },
  })

  const failed = await handleFailKnowledgeSync(
    request("/fail", { runId, errorCode: "worker_timeout" }),
    { rpc: rpcFor("fail", calls) },
  )
  assert.equal(failed.status, 200)
  assert.deepEqual(await failed.json(), { status: "failed" })

  assert.deepEqual(
    calls.map(({ name }) => name),
    [
      "start",
      "batch",
      "complete",
      "fail",
    ],
  )
  assert.deepEqual(
    calls.map(({ name }) => KNOWLEDGE_RPC_NAMES[name]),
    [
      "start_knowledge_sync",
      "stage_knowledge_sync_batch",
      "complete_knowledge_sync",
      "fail_knowledge_sync",
    ],
  )
  assert.equal(calls[0].args.p_token_hash, hashIngestionToken(token))
  assert.equal("p_source_key" in calls[0].args, false)
  assert.equal("p_ownership" in calls[0].args, false)
  assert.equal(calls[1].args.p_documents[0].relative_path, "handbook/onboarding.md")
})

test("keeps RPC details out of responses while logging only a bounded error code", async () => {
  const logs = []
  const response = await handleStartKnowledgeSync(
    request("/start", { idempotencyKey: "sync-diagnostic" }),
    {
      rpc: async () => ({
        data: null,
        error: { code: "42501", message: "private database detail must not escape" },
      }),
      logger: (event) => logs.push(event),
    },
  )

  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: "sync_start_failed" })
  assert.equal(logs[0].errorCode, "rpc_42501")
  assert.equal(JSON.stringify(logs).includes("private database detail"), false)
})

test("rejects invalid request data without calling the RPC and never enables caching", async () => {
  const calls = []
  const response = await handleBatchKnowledgeSync(
    request("/batch", { runId, documents: [validDocument({ contentHash: "bad" })] }),
    { rpc: rpcFor("batch", calls) },
  )
  assert.equal(response.status, 400)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.deepEqual(await response.json(), { error: "content_hash_invalid" })
  assert.equal(calls.length, 0)
})

test("logs only bounded operational fields and never the raw token or document content", async () => {
  const calls = []
  const logs = []
  await handleBatchKnowledgeSync(
    request("/batch", { runId, documents: [validDocument({ content: "private body" })] }),
    { rpc: rpcFor("batch", calls), logger: (event) => logs.push(event) },
  )
  assert.equal(logs.length, 1)
  assert.deepEqual(Object.keys(logs[0]).sort(), ["acceptedCount", "durationMs", "runId", "sourceKey"])
  assert.equal(JSON.stringify(logs).includes(token), false)
  assert.equal(JSON.stringify(logs).includes("private body"), false)
})
