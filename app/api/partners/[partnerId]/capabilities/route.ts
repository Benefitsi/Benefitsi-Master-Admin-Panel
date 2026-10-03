import { getAdminSession } from "@/lib/admin"
import { readEntitlements } from "@/lib/partners/entitlements"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ partnerId: string }> },
) {
  const respond = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
  try {
    const supabase = await createClient()
    if (!(await getAdminSession(supabase))?.isAdmin) return respond({ error: "Keine Berechtigung." }, 403)
    const { partnerId } = await params
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partnerId)) return respond({ error: "Bitte einen gültigen Partner auswählen." }, 400)
    const rights = await readEntitlements(supabase, partnerId)
    return respond({
      media_rich_enabled: rights.plan_code === "pro" && rights.features["media.rich"] === true,
      menu_ai_import_enabled: rights.features["menu.ai_import"] === true,
    })
  } catch {
    return respond({ error: "Berechtigungen konnten nicht geladen werden." }, 503)
  }
}
