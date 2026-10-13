import { profileControlErrorResponse, profileControlHeaders, requestAgentProfileOperation } from "@/lib/agent-profile-controls-server"

export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ profileId: string }> }) {
  try {
    const { profileId } = await context.params
    const query = new URL(request.url).searchParams
    if ([...query.keys()].some(key => key !== "fileId") || query.getAll("fileId").length > 1) return Response.json({ error: "invalid_request" }, { status: 400, headers: profileControlHeaders })
    const fileId = query.get("fileId")
    return Response.json(await requestAgentProfileOperation(profileId, fileId === null ? "context-list" : "context-read", fileId === null ? {} : { fileId }), { headers: profileControlHeaders })
  } catch (error) { return profileControlErrorResponse(error) }
}
