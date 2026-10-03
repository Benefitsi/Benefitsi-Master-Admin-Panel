// This is a source-bound mitigation, not an advisory allowlist. Any drift fails closed.
export const BRACES_MITIGATION = Object.freeze({
  url: "https://codeload.github.com/FSDevelop/braces/tar.gz/28d440b5dd449dbf1fe6f3506cf94ecca4d02660",
  integrity: "sha512-JDNujUUIiVjCw6vVXM92wZbpm+K+0KSTTqjcVa1zjjZLvfkOuDZmVHbKKjYRyE450ii6coDbuCIPqkX/bjmxWQ==",
  files: Object.freeze({
    "package.json": "ec972f5f2da53d9bacb0fd6152b16f6ef768a00b7724909702abd8a92f886cca",
    "index.js": "332ea07c7b006361aad12aa994ca75dc1db8e8382b884909e2f38f10b85c88a4",
    "lib/compile.js": "b651f7715e6db8942ce61d3394357b4d81c8ece88240aa31a458ea1165edd195",
    "lib/constants.js": "f9fb688959232eee3e6ad7906a5b0e3234815db49ee857ef86983d65b917dc7c",
    "lib/expand.js": "7ea3e14c2b2b256ef244fd3d83b8fcaa20aa2232b4e6d768c3bb6ab567f66cf5",
    "lib/parse.js": "b1bf766fba6a62035f78ecbda8a5fd94e921aa1c1ec0cdf3f467e9c836abed55",
    "lib/stringify.js": "49dc2d8bafa74f34715a18a845bcb82ce66caaf3bab4cf117998e06b1f9a50a9",
    "lib/utils.js": "b5a7596aa67730412b3c029ef09e84e6b67b8e445cffd35d1d295549c89066c7",
  }),
})

const advisory = {
  source: 1240992,
  name: "braces",
  dependency: "braces",
  title: "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
  cwe: ["CWE-674"],
  cvss: { score: 7.5, vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" },
  range: "<=3.0.3",
}
const chain = {
  braces: { version: "3.0.3", via: [advisory] },
  micromatch: { version: "4.0.8", via: ["braces"] },
  "fast-glob": { version: "3.3.1", via: ["micromatch"] },
  "@next/eslint-plugin-next": { version: "16.3.6", via: ["fast-glob"] },
  "eslint-config-next": { version: "16.3.6", via: ["@next/eslint-plugin-next"] },
}
const severities = ["info", "low", "moderate", "high", "critical"]
const record = value => value !== null && typeof value === "object" && !Array.isArray(value)
function same(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => same(actual[i], item))
  if (record(expected)) return record(actual) && same(Object.keys(actual).sort(), Object.keys(expected).sort()) && Object.entries(expected).every(([key, value]) => same(actual[key], value))
  return actual === expected
}
const reject = reason => ({ ok: false, mitigated: [], reason })

export function evaluateDependencyAudit(audit, { lock, installed } = {}) {
  if (!record(audit) || audit.error || audit.auditReportVersion !== 2 || !record(audit.vulnerabilities) || !record(audit.metadata?.vulnerabilities)) {
    return reject("The dependency scanner did not return a valid audit report.")
  }
  const counts = audit.metadata.vulnerabilities
  const entries = Object.entries(audit.vulnerabilities)
  if (![...severities, "total"].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)
    || counts.total !== entries.length
    || severities.some(severity => counts[severity] !== entries.filter(([, entry]) => entry?.severity === severity).length)
    || severities.reduce((sum, severity) => sum + counts[severity], 0) !== counts.total) {
    return reject("The dependency audit counts are malformed or inconsistent.")
  }
  if (entries.length === 0) return { ok: true, mitigated: [], reason: "No dependency advisories reported." }
  if (!same(entries.map(([name]) => name).sort(), Object.keys(chain).sort())) {
    return reject("The audit contains an advisory outside the verified Braces development chain.")
  }
  for (const [name, expected] of Object.entries(chain)) {
    const entry = audit.vulnerabilities[name]
    const path = `node_modules/${name}`
    const locked = lock?.packages?.[path]
    if (!record(entry) || entry.name !== name || entry.severity !== "high" || !same(entry.nodes, [path]) || !same(entry.via, expected.via)
      || locked?.version !== expected.version || locked?.dev !== true) {
      return reject(`Unverified advisory, dependency path, version or production usage: ${name}.`)
    }
  }
  const locked = lock.packages["node_modules/braces"]
  const bracePaths = Object.keys(lock.packages).filter(path => path.endsWith("node_modules/braces"))
  if (!same(bracePaths, ["node_modules/braces"]) || locked.resolved !== BRACES_MITIGATION.url || locked.integrity !== BRACES_MITIGATION.integrity) {
    return reject("Braces is not installed exclusively from the verified immutable source archive.")
  }
  if (installed?.version !== "3.0.3" || !same(installed.files, BRACES_MITIGATION.files)) {
    return reject("The installed Braces package metadata or runtime source differs from the verified mitigation.")
  }
  return { ok: true, mitigated: Object.keys(chain), reason: "The exact development-only Braces advisory chain is mitigated by verified source." }
}
