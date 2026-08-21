import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  KNOWLEDGE_RPC_NAMES,
  type KnowledgeRpcOperation,
} from "./rpc"
import { hashIngestionToken } from "./ingestion"

export type KnowledgeRpcResult = {
  data: unknown
  error: { code?: string | null; message?: string | null } | null
}

export type KnowledgeRpcCaller = (
  operation: KnowledgeRpcOperation,
  args: Record<string, unknown>,
) => Promise<KnowledgeRpcResult>

export const callKnowledgeRpc: KnowledgeRpcCaller = async (operation, args) => {
  const admin = createAdminClient()
  const readOperations = new Set<KnowledgeRpcOperation>(["status", "search", "detail"])
  const token = process.env.BENEFITSI_KNOWLEDGE_READ_TOKEN?.trim()
    || process.env.BENEFITSI_KNOWLEDGE_INGESTION_TOKEN?.trim()
  const rpcArgs = readOperations.has(operation) && !("p_token_hash" in args)
    ? { p_token_hash: token ? hashIngestionToken(token) : "", ...args }
    : args
  const result = await admin.rpc(KNOWLEDGE_RPC_NAMES[operation], rpcArgs)
  return {
    data: result.data,
    error: result.error,
  }
}
