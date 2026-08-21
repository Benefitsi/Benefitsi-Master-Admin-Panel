import { handleBatchKnowledgeSync } from "@/lib/knowledge/ingestion-service"
import { callKnowledgeRpc } from "@/lib/knowledge/ingestion-rpc"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  return handleBatchKnowledgeSync(request, { rpc: callKnowledgeRpc })
}
