import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  KNOWLEDGE_RPC_NAMES,
  type KnowledgeRpcOperation,
} from "./rpc"

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
  const result = await admin.rpc(KNOWLEDGE_RPC_NAMES[operation], args)
  return {
    data: result.data,
    error: result.error,
  }
}
