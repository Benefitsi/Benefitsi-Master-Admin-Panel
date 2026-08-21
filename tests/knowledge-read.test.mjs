import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  projectKnowledgeDetailRow,
  projectKnowledgeListRow,
  projectKnowledgeStatus,
} from "../lib/knowledge/read-projection.ts"
import { createKnowledgeReadClient } from "../lib/knowledge/read-core.ts"
import { KNOWLEDGE_RPC_NAMES } from "../lib/knowledge/rpc.ts"
import { hashIngestionToken } from "../lib/knowledge/ingestion.ts"

const root = new URL("../", import.meta.url)

test("uses one fixed Benefitsi source and clamps the server page size to 50", () => {
  assert.equal(KNOWLEDGE_RPC_NAMES.search, "search_knowledge_documents")
  assert.equal(KNOWLEDGE_RPC_NAMES.detail, "get_knowledge_document")
})

test("server read calls bind to fixed RPCs without accepting a source selector", async () => {
  const calls = []
  const readTokenHash = hashIngestionToken("read-token-with-more-than-32-bytes")
  const client = createKnowledgeReadClient(async (operation, args) => {
    calls.push({ operation, args })
    if (operation === "search") {
      return { data: { documents: [], total_count: 0 }, error: null }
    }
    return { data: null, error: null }
  }, { tokenHash: readTokenHash })

  await client.searchBenefitsiKnowledge({ query: " onboarding ", limit: 500, offset: 50 })
  await client.getBenefitsiKnowledgeDocument("11111111-1111-4111-8111-111111111111")

  assert.deepEqual(calls, [
    {
      operation: "search",
      args: { p_token_hash: readTokenHash, p_query: "onboarding", p_limit: 50, p_offset: 50 },
    },
    {
      operation: "detail",
      args: { p_token_hash: readTokenHash, p_document_id: "11111111-1111-4111-8111-111111111111" },
    },
  ])
})

test("the server DAL leaves token injection to the trusted RPC adapter", async () => {
  const calls = []
  const client = createKnowledgeReadClient(async (operation, args) => {
    calls.push({ operation, args })
    return { data: operation === "search" ? { documents: [], total_count: 0 } : null, error: null }
  })

  await client.searchBenefitsiKnowledge({ query: "test" })
  await client.getBenefitsiKnowledgeStatus()

  assert.deepEqual(calls, [
    {
      operation: "search",
      args: { p_query: "test", p_limit: 50, p_offset: 0 },
    },
    {
      operation: "status",
      args: {},
    },
  ])
})

test("projects list rows to relative-path metadata without content or private fields", () => {
  assert.deepEqual(
    projectKnowledgeListRow({
      document_id: "11111111-1111-4111-8111-111111111111",
      source_key: "benefitsi-obsidian",
      absolute_path: "/Users/patrick/Documents/Obsidian/Benefitsi/handbook.md",
      relative_path: "handbook.md",
      title: "Handbook",
      content: "must not reach list output",
      source_modified_at: "2026-08-20T10:00:00.000Z",
      last_synced_at: "2026-08-21T10:00:00.000Z",
      is_deleted: false,
      metadata: { secret: "must not reach output" },
    }),
    {
      id: "11111111-1111-4111-8111-111111111111",
      relativePath: "handbook.md",
      title: "Handbook",
      sourceModifiedAt: "2026-08-20T10:00:00.000Z",
      syncedAt: "2026-08-21T10:00:00.000Z",
      isDeleted: false,
    },
  )
})

test("rejects non-Benefitsi or unsafe paths instead of projecting them", () => {
  assert.equal(
    projectKnowledgeListRow({
      document_id: "22222222-2222-4222-8222-222222222222",
      source_key: "personal-obsidian",
      relative_path: "personal.md",
      title: "Personal",
    }),
    null,
  )
  assert.equal(
    projectKnowledgeListRow({
      document_id: "33333333-3333-4333-8333-333333333333",
      source_key: "benefitsi-obsidian",
      relative_path: "/absolute.md",
      title: "Unsafe",
    }),
    null,
  )
})

test("projects selected detail content but still strips paths, metadata, and source selectors", () => {
  assert.deepEqual(
    projectKnowledgeDetailRow({
      document_id: "11111111-1111-4111-8111-111111111111",
      source_key: "benefitsi-obsidian",
      relative_path: "handbook.md",
      title: "Handbook",
      content: "# Safe selected document",
      absolute_path: "/private/m1/handbook.md",
      metadata: { absolute_path: "/private/m1/handbook.md", token: "secret" },
      source_modified_at: "2026-08-20T10:00:00.000Z",
      last_synced_at: "2026-08-21T10:00:00.000Z",
      is_deleted: true,
    }),
    {
      id: "11111111-1111-4111-8111-111111111111",
      relativePath: "handbook.md",
      title: "Handbook",
      content: "# Safe selected document",
      sourceModifiedAt: "2026-08-20T10:00:00.000Z",
      syncedAt: "2026-08-21T10:00:00.000Z",
      isDeleted: true,
    },
  )
})

test("normalizes source status to safe mirror fields and error codes", () => {
  assert.deepEqual(
    projectKnowledgeStatus({
      source_key: "benefitsi-obsidian",
      latest_run: { status: "succeeded" },
      last_successful_sync_at: "2026-08-21T09:00:00.000Z",
      active_document_count: 12,
      last_error: "secret database error",
      last_error_code: "batch_rejected",
      absolute_path: "/private/m1",
    }),
    {
      status: "healthy",
      lastSuccessfulSyncAt: "2026-08-21T09:00:00.000Z",
      documentCount: 12,
      lastErrorCode: "batch_rejected",
    },
  )
})

test("the exported DAL is explicitly server-only and exposes the required function signatures", async () => {
  const read = await readFile(new URL("lib/knowledge/read.ts", root), "utf8")
  assert.match(read, /^import "server-only"/)
  assert.match(read, /export async function searchBenefitsiKnowledge\(\{ query, limit/)
  assert.match(read, /export async function getBenefitsiKnowledgeDocument\(documentId/)
  assert.doesNotMatch(read, /sourceKey|sourceId|source_id|p_source_key/)
})
