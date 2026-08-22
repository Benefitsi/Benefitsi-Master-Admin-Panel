export const KNOWLEDGE_SOURCE_KEY = "benefitsi-obsidian" as const
export const KNOWLEDGE_OWNERSHIP = "BENEFITSI_EXTERNAL" as const
export const KNOWLEDGE_HASH_VERSION = "sha256-lf-v1" as const

export const KNOWLEDGE_RPC_NAMES = {
  start: "start_knowledge_sync",
  batch: "stage_knowledge_sync_batch",
  complete: "complete_knowledge_sync",
  fail: "fail_knowledge_sync",
  status: "get_benefitsi_knowledge_source_status",
  search: "search_benefitsi_knowledge_documents",
  detail: "get_benefitsi_knowledge_document",
} as const

export type KnowledgeRpcOperation = keyof typeof KNOWLEDGE_RPC_NAMES
