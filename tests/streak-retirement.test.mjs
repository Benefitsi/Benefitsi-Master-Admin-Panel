import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dashboardDetailRows, insight, safeBuckets } from "../lib/partners/insights.ts"
import { resolveMicrositeConfig } from "../lib/microsites.ts"
import { dealTypeOptions } from "../lib/reward-config.ts"

 test("statistics and exported detail rows exclude retired sections and series guest badges", () => {
 const data = JSON.parse(readFileSync(new URL("./fixtures/partner-dashboard/rich-pro.json", import.meta.url)))
 const rows = dashboardDetailRows(data)
 assert.ok(!rows.some(row => /streak/i.test(row.section) || /streak|serie/i.test(row.label)))
 assert.ok(!safeBuckets(insight(data, "guest_badges")).some(b => b.code === "series"))
 assert.ok(rows.some(row => row.section === "series"))
})
 test("editor options exclude retired streak configurations", () => { assert.ok(!dealTypeOptions.some(o => o.value === "streak")) })
 test("saved microsite overrides are reconciled without altering event series copy", () => {
 const config = resolveMicrositeConfig({ elementText: { "deals.benefit.1.text": "Zeitbonus, Streaks & Aktionen", "content.ecosystem.streaks.title": "Streaks aufbauen", "content.events.text": "Eventserien entdecken" } }, { name: "Testbetrieb" })
 assert.equal(config.elementText["deals.benefit.1.text"], "Zeitbonus & Aktionen")
 assert.equal(config.elementText["content.ecosystem.streaks.title"], undefined)
 assert.equal(config.elementText["content.events.text"], "Eventserien entdecken")
})
