import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentOverview } from "../../app/agents/agent-overview.tsx"
import { normalizeRuntimeSnapshot } from "../../lib/agent-control.ts"

let input = ""
for await (const chunk of process.stdin) input += chunk

const runtime = normalizeRuntimeSnapshot(JSON.parse(input), new Date("2026-09-21T20:00:00Z"))
assert.equal(runtime.state, "fresh")
assert.equal(runtime.snapshot?.profiles[0].contextHealth, "unknown")
assert.equal(runtime.snapshot?.profiles[0].runtimeHealth, "ok")

const html = renderToStaticMarkup(createElement(AgentOverview, { data: {
  checkedAt: "2026-09-21T20:00:00Z",
  runtime,
  cities: { state: "available", items: [] },
  citySchedules: { state: "available", items: [] },
  pipeline: { state: "available", item: null },
} }))
assert.match(html, /Kontext unbekannt/)
assert.match(html, /Letzter Lauf aktuell erfolgreich/)
assert.doesNotMatch(html, /Kontext vollständig beobachtet/)
