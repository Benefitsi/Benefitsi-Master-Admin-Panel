import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const profileRoot = new URL("../tools/hermes-city-profiles/benefitsi-content/", import.meta.url)

test("Benefitsi Content-Agent distribution is draft-only and has no MCP server", async () => {
  const [config, soul, identity, metadata] = await Promise.all([
    readFile(new URL("config.yaml", profileRoot), "utf8"),
    readFile(new URL("SOUL.md", profileRoot), "utf8"),
    readFile(new URL("identity.md", profileRoot), "utf8"),
    readFile(new URL("profile.yaml", profileRoot), "utf8"),
  ])

  assert.match(config, /provider:\s*minimax/)
  assert.match(config, /default:\s*MiniMax-M3\.0/)
  assert.match(config, /context_engine/)
  assert.match(config, /mcp_servers:\s*\{\}/)
  assert.match(soul, /Speichere, veröffentliche, versende/i)
  assert.match(identity, /Output: human-reviewed drafts only/i)
  assert.match(identity, /editing Supabase or calling Benefitsi MCP tools/i)
  assert.match(metadata, /keine Veröffentlichungs-/i)
})
