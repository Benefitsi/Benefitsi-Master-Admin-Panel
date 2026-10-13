import { cityDisplayName } from "@/lib/agent-control"
export type PrioritySource = { state: "ready" | "unavailable"; items: Record<string, unknown>[]; truncated: boolean }
export type OverviewPrioritySources = { checkedAt: string; jobs: PrioritySource; editorial: PrioritySource; workspace: PrioritySource; knowledge?: PrioritySource }
export type OverviewPriority = { id: string; title: string; context: string; action: string; href: string; dueDate: string | null; rank: number; source: string; titleAuthored: boolean; contextAuthored: boolean; reference?: string }
export type OverviewPriorities = { checkedAt: string; items: OverviewPriority[]; unavailableSources: string[]; truncated: boolean; complete: boolean }
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const text = (value: unknown, limit = 200) => typeof value === "string" ? value.trim().slice(0, limit) : ""
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null
const kinds: Record<string, string> = { city_scan: "Stadtprüfung", source_verification: "Quellenprüfung", content_correction: "Inhaltskorrektur", provider_onboarding: "Anbieter-Einrichtung", booking_anomaly: "Buchungsprüfung", notification: "Benachrichtigung" }
export function buildOverviewPriorities(data: OverviewPrioritySources): OverviewPriorities {
  const items: OverviewPriority[] = []
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(data.checkedAt))
  for (const page of data.workspace.items) {
    if (!uuid(page.id) || page.status === "done" || page.archived === true) continue
    const content = page.content && typeof page.content === "object" && !Array.isArray(page.content) ? page.content as Record<string, unknown> : {}
    const tasks = Array.isArray(page.tasks) ? page.tasks : Array.isArray(content.tasks) ? content.tasks : []
    const href = `/workspace?page=${page.id}${uuid(page.partner_id) ? `&partner=${page.partner_id}` : ""}`
    let added = false
    for (const [index, task] of tasks.entries()) {
      if (!task || typeof task !== "object" || task.done !== false || !text(task.text)) continue
      const dueDate = date(task.dueDate)
      items.push({ id: `workspace-${page.id}-${index}`, title: text(task.text), context: text(page.title), action: "Aufgabe öffnen", href, dueDate, rank: dueDate && dueDate <= today ? 0 : 3, source: "Partner-Workspace", titleAuthored: true, contextAuthored: Boolean(text(page.title)) })
      added = true
    }
    if (!added && page.status === "blocked") items.push({ id: `workspace-${page.id}`, title: text(page.title) || "Offene Klärung", context: "Zu klären", action: "Klärung öffnen", href, dueDate: date(page.due_date), rank: 2, source: "Partner-Workspace", titleAuthored: Boolean(text(page.title)), contextAuthored: false })
  }
  for (const task of data.knowledge?.items ?? []) {
    if (!uuid(task.id) || task.state !== 'open' || !text(task.title)) continue
    const dueDate = date(task.dueDate)
    const roles: Record<string, string> = { ben: 'Ben', 'benefitsi-content': 'Content', 'benefitsi-finance': 'Finanzen', 'benefitsi-seo': 'SEO', 'city-annweiler': 'Annweiler', 'benefitsi-menu': 'Menü' }
    items.push({ id: `knowledge-${task.id}`, title: text(task.title), context: roles[String(task.profileId)] ?? 'Benefitsi-Wissen', action: 'Aufgabe öffnen', href: `/wissen?note=${task.id}`, dueDate, rank: dueDate && dueDate <= today ? 0 : 3, source: 'Obsidian', titleAuthored: true, contextAuthored: Boolean(roles[String(task.profileId)]) })
  }
  for (const row of data.jobs.items) {
    if (!uuid(row.id) || !["needs_human", "failed"].includes(String(row.status))) continue
    const review = row.status === "needs_human"
    items.push({ id: `job-${row.id}`, title: kinds[String(row.job_type)] ?? "Automationsauftrag", context: review ? "Menschliche Freigabe ausstehend" : "Auftrag fehlgeschlagen", action: review ? "Freigabe prüfen" : "Fehler prüfen", href: `/automation?status=${row.status}#job-${row.id}`, dueDate: null, rank: review ? 1 : 2, source: "Automation", titleAuthored: false, contextAuthored: false, reference: `${cityDisplayName(typeof row.city_id === "string" ? row.city_id : "") ?? ""}${row.city_id ? " · " : ""}#${row.id.slice(0,8)}` })
  }
  for (const row of data.editorial.items) {
    if (!uuid(row.id)) continue
    items.push({ id: `editorial-${row.id}`, title: text(row.title) || "Redaktioneller Entwurf", context: "Redaktionelle Prüfung ausstehend", action: "Beitrag prüfen", href: `/editorial/${row.id}`, dueDate: null, rank: 1, source: "Redaktion", titleAuthored: Boolean(text(row.title)), contextAuthored: false })
  }
  items.sort((a,b) => a.rank - b.rank || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
  const unavailableSources: string[] = ([['jobs','Automation'],['editorial','Redaktion'],['workspace','Partner-Workspace']] as const).filter(([key])=>data[key].state !== "ready").map(([,label])=>label)
  if (data.knowledge?.state === "unavailable") unavailableSources.push("Obsidian")
  const truncated = items.length > 10 || data.jobs.truncated || data.editorial.truncated || data.workspace.truncated || data.knowledge?.truncated === true
  return { checkedAt: data.checkedAt, items: items.slice(0,10), unavailableSources, truncated, complete: !unavailableSources.length && !truncated }
}
