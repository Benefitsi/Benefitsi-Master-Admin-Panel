import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { evaluateDependencyAudit } from "../lib/dependency-audit-guard.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const output = resolve(process.env.ADMIN_DEPENDENCY_AUDIT_OUTPUT || join(root, "work/dependency-audit"))
mkdirSync(output, { recursive: true })
const scan = spawnSync("npm", ["audit", "--json", "--audit-level=high"], {
  cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
})
// Preserve the scanner's complete original output, including failures, before any decision.
writeFileSync(join(output, "npm-audit-raw.json"), scan.stdout || "")

function installedBraces() {
  const require = createRequire(import.meta.url)
  const packagePath = require.resolve("braces/package.json")
  const packageRoot = dirname(packagePath)
  const files = {}
  function hash(path) { files[path] = createHash("sha256").update(readFileSync(join(packageRoot, path))).digest("hex") }
  hash("package.json")
  hash("index.js")
  function walk(relative) {
    for (const entry of readdirSync(join(packageRoot, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else hash(path)
    }
  }
  walk("lib")
  return { version: JSON.parse(readFileSync(packagePath, "utf8")).version, files }
}

let audit
let result
try {
  if (scan.error || ![0, 1].includes(scan.status)) throw new Error("The npm audit command failed or timed out.")
  audit = JSON.parse(scan.stdout)
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))
  result = evaluateDependencyAudit(audit, { lock, installed: installedBraces() })
  if (result.ok) {
    const checks = spawnSync(process.execPath, ["--test", "tests/dependency-audit-guard.test.mjs", "tests/dependency-braces-security.test.mjs"], {
      cwd: root, stdio: "inherit", timeout: 60_000,
    })
    if (checks.error || checks.status !== 0) result = { ok: false, mitigated: [], reason: "Mandatory security regression or lint-consumer checks failed." }
  }
} catch {
  result = { ok: false, mitigated: [], reason: "Unable to verify the dependency audit and installed source; release is blocked." }
}
const counts = audit?.metadata?.vulnerabilities
const rawCounts = counts && Number.isSafeInteger(counts.high) && Number.isSafeInteger(counts.critical)
  ? `Raw npm audit: ${counts.high} high, ${counts.critical} critical, ${counts.total} total.`
  : "Raw npm audit could not be validated."
const lines = [
  `Dependency audit: ${result.ok ? "PASS" : "BLOCKED"}`,
  rawCounts,
  result.reason,
  result.mitigated.length ? `Source-mitigated packages (${result.mitigated.length}): ${result.mitigated.join(", ")}. The raw findings remain in the uploaded artifact.` : "No advisory mitigation applied.",
  "Full unchanged npm audit output: npm-audit-raw.json (dependency-audit artifact).",
]
console.log(lines.join("\n"))
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Dependency audit\n\n${lines.join("\n\n")}\n`)
process.exitCode = result.ok ? 0 : 1
