import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  automationStatusLabel,
  automationTypeLabel,
  redactAutomationPayload,
} from "../lib/automation/contracts.ts"

const projectRoot = new URL("../", import.meta.url)
const webRoot = new URL("../../../benefitsi-web/", import.meta.url)

test("automation payloads redact secrets, identity and booking contact data recursively", () => {
  const payload = redactAutomationPayload({
    summary: "safe",
    nested: {
      customer_email: "customer@example.com",
      accessToken: "secret-token",
      source_url: "https://annweiler.de",
    },
    list: [{ phone: "+49 123", finding: "safe finding" }],
  })

  assert.deepEqual(payload, {
    summary: "safe",
    nested: {
      customer_email: "[geschützt]",
      accessToken: "[geschützt]",
      source_url: "https://annweiler.de",
    },
    list: [{ phone: "[geschützt]", finding: "safe finding" }],
  })
})

test("automation labels cover every queue state shown in the admin", () => {
  assert.equal(automationTypeLabel("booking_anomaly"), "Buchungsprüfung")
  assert.equal(automationStatusLabel("needs_human"), "Freigabe nötig")
})

test("automation migration separates agent recommendations from protected human actions", async () => {
  const sql = await readFile(
    new URL(
      "supabase/migrations/20260728210000_agent_automation_queues.sql",
      webRoot,
    ),
    "utf8",
  )

  assert.match(sql, /human_gate in\s*\([\s\S]*'publish'[\s\S]*'refund'[\s\S]*'payout'[\s\S]*'live_activation'/)
  assert.match(sql, /if p_actor_type not in \('admin', 'system'\)/)
  assert.match(sql, /Agents cannot enqueue arbitrary automation jobs/)
  assert.match(sql, /status = case when human_gate = 'none' then 'agent_completed' else 'needs_human' end/)
  assert.match(sql, /'protected_action_executed', false/)
  assert.doesNotMatch(sql, /stripe\.refunds|publish_reviewed_booking_offer|apply_stripe/)
})

test("automation claims use row locking, leases, bounded retries and deduplication", async () => {
  const sql = await readFile(
    new URL(
      "supabase/migrations/20260728210000_agent_automation_queues.sql",
      webRoot,
    ),
    "utf8",
  )

  assert.match(sql, /for update skip locked/)
  assert.match(sql, /lease_until/)
  assert.match(sql, /attempts < max_attempts/)
  assert.match(sql, /automation_jobs_active_dedup_idx/)
  assert.match(sql, /on conflict \(deduplication_key\)/)
})

test("automation admin actions authenticate before service-role mutations", async () => {
  const actions = await readFile(
    new URL("app/automation/actions.ts", projectRoot),
    "utf8",
  )
  const adminIndex = actions.indexOf("await requireAdmin()")
  const clientIndex = actions.indexOf("createAdminClient()")

  assert.ok(adminIndex >= 0)
  assert.ok(clientIndex > adminIndex)
  assert.match(actions, /confirmed = formData\.get\("confirm"\) === "yes"/)
  assert.match(actions, /review_automation_job/)
})

test("daily automation tick fails closed and only schedules deduplicated city scans", async () => {
  const route = await readFile(
    new URL("app/api/automation/tick/route.ts", projectRoot),
    "utf8",
  )
  const vercel = JSON.parse(
    await readFile(new URL("vercel.json", projectRoot), "utf8"),
  )

  assert.match(route, /secret\.length < 32/)
  assert.match(route, /timingSafeEqual/)
  assert.match(route, /schedule_due_city_scans/)
  assert.doesNotMatch(route, /claim_automation_job|complete_automation_job/)
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/automation/tick" && cron.schedule === "10 4 * * *"))
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/automation/worker" && cron.schedule === "30 4 * * *"))
})
