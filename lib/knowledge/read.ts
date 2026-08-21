import "server-only"

import { callKnowledgeRpc } from "./ingestion-rpc"
import {
  createKnowledgeReadClient,
  type KnowledgeSearchOptions,
} from "./read-core"
export {
  projectKnowledgeDetailRow,
  projectKnowledgeListRow,
  projectKnowledgeStatus,
} from "./read-projection"
export type {
  BenefitsiKnowledgeStatus,
  KnowledgeDocumentDetail,
  KnowledgeDocumentListItem,
  KnowledgeSearchResult,
} from "./read-projection"

const client = createKnowledgeReadClient(callKnowledgeRpc)

export async function searchBenefitsiKnowledge({ query, limit, offset }: KnowledgeSearchOptions) {
  return client.searchBenefitsiKnowledge({ query, limit, offset })
}

export async function getBenefitsiKnowledgeDocument(documentId: string) {
  return client.getBenefitsiKnowledgeDocument(documentId)
}

export async function getBenefitsiKnowledgeStatus() {
  return client.getBenefitsiKnowledgeStatus()
}
