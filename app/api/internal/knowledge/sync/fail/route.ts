import { handleFailKnowledgeSync } from "@/lib/knowledge/ingestion-service"
import { callKnowledgeRpc } from "@/lib/knowledge/ingestion-rpc"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  return handleFailKnowledgeSync(request, { rpc: callKnowledgeRpc })
}
