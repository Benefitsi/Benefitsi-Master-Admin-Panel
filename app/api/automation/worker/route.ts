import { timingSafeEqual } from "node:crypto"
import { runNextCityAgentJob } from "@/lib/city-agent/runner"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? ""
  const provided = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  if (secret.length < 32 || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: process.env.CRON_SECRET ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {}
  const url = new URL(request.url)
  const cityId = typeof body.cityId === "string" ? body.cityId : url.searchParams.get("cityId") ?? undefined
  const agentProfile = typeof body.agentProfile === "string" ? body.agentProfile : url.searchParams.get("agentProfile") ?? undefined
  const maxSourcesValue = Number(body.maxSources ?? url.searchParams.get("maxSources") ?? 10)
  const dryRun = body.dryRun !== false && url.searchParams.get("dryRun") !== "false"

  try {
    const summary = await runNextCityAgentJob({ cityId, agentProfile, maxSources: maxSourcesValue, dryRun })
    return Response.json({ ok: true, summary }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("City-Agent worker failed:", error)
    return Response.json({ ok: false, error: "worker_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
