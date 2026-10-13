import { profileControlErrorResponse, profileControlHeaders, profileModelRequestBody, requestAgentProfileOperation } from "@/lib/agent-profile-controls-server"

export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ profileId: string }> }) {
  try {
    const { profileId } = await context.params
    const query = new URL(request.url).searchParams
    if ([...query.keys()].some(key => key !== "readback") || query.getAll("readback").length > 1 || (query.has("readback") && query.get("readback") !== "1")) return Response.json({ error: "invalid_request" }, { status: 400, headers: profileControlHeaders })
    return Response.json(await requestAgentProfileOperation(profileId, query.get("readback") === "1" ? "model-readback" : "model-options"), { headers: profileControlHeaders })
  } catch (error) { return profileControlErrorResponse(error) }
}
export async function POST(request: Request, context: { params: Promise<{ profileId: string }> }) {
  try {
    const { profileId } = await context.params
    return Response.json(await requestAgentProfileOperation(profileId, "model-apply", await profileModelRequestBody(request)), { headers: profileControlHeaders })
  } catch (error) { return profileControlErrorResponse(error) }
}
