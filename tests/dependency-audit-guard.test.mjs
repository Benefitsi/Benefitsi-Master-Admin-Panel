import assert from "node:assert/strict"
import test from "node:test"
import { evaluateDependencyAudit } from "../lib/dependency-audit-guard.mjs"

const fixedUrl = "https://codeload.github.com/FSDevelop/braces/tar.gz/28d440b5dd449dbf1fe6f3506cf94ecca4d02660"
const fixedIntegrity = "sha512-JDNujUUIiVjCw6vVXM92wZbpm+K+0KSTTqjcVa1zjjZLvfkOuDZmVHbKKjYRyE450ii6coDbuCIPqkX/bjmxWQ=="
const hashes = {
  "package.json": "ec972f5f2da53d9bacb0fd6152b16f6ef768a00b7724909702abd8a92f886cca",
  "index.js": "332ea07c7b006361aad12aa994ca75dc1db8e8382b884909e2f38f10b85c88a4",
  "lib/compile.js": "b651f7715e6db8942ce61d3394357b4d81c8ece88240aa31a458ea1165edd195",
  "lib/constants.js": "f9fb688959232eee3e6ad7906a5b0e3234815db49ee857ef86983d65b917dc7c",
  "lib/expand.js": "7ea3e14c2b2b256ef244fd3d83b8fcaa20aa2232b4e6d768c3bb6ab567f66cf5",
  "lib/parse.js": "b1bf766fba6a62035f78ecbda8a5fd94e921aa1c1ec0cdf3f467e9c836abed55",
  "lib/stringify.js": "49dc2d8bafa74f34715a18a845bcb82ce66caaf3bab4cf117998e06b1f9a50a9",
  "lib/utils.js": "b5a7596aa67730412b3c029ef09e84e6b67b8e445cffd35d1d295549c89066c7",
}
const chain = {
  braces: { version: "3.0.3", via: [{
    source: 1240992, name: "braces", dependency: "braces",
    title: "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns",
    url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm", severity: "high", cwe: ["CWE-674"],
    cvss: { score: 7.5, vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" }, range: "<=3.0.3",
  }] },
  micromatch: { version: "4.0.8", via: ["braces"] },
  "fast-glob": { version: "3.3.1", via: ["micromatch"] },
  "@next/eslint-plugin-next": { version: "16.3.6", via: ["fast-glob"] },
  "eslint-config-next": { version: "16.3.6", via: ["@next/eslint-plugin-next"] },
}
function fixture() {
  const audit = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 } } }
  const lock = { packages: {} }
  for (const [name, entry] of Object.entries(chain)) {
    audit.vulnerabilities[name] = { name, severity: "high", via: structuredClone(entry.via), nodes: [`node_modules/${name}`] }
    lock.packages[`node_modules/${name}`] = { version: entry.version, dev: true }
  }
  Object.assign(lock.packages["node_modules/braces"], { resolved: fixedUrl, integrity: fixedIntegrity })
  return { audit, lock, installed: { version: "3.0.3", files: { ...hashes } } }
}
const evaluate = ({ audit, lock, installed }) => evaluateDependencyAudit(audit, { lock, installed })

test("audit accepts only the exact verified development-only patched chain", () => {
  const result = evaluate(fixture())
  assert.equal(result.ok, true, result.reason)
  assert.equal(result.mitigated.length, 5)
})

test("a clean audit needs no advisory mitigation", () => {
  const data = fixture()
  data.audit.vulnerabilities = {}
  data.audit.metadata.vulnerabilities.high = 0
  data.audit.metadata.vulnerabilities.total = 0
  assert.equal(evaluate(data).ok, true)
  assert.deepEqual(evaluate(data).mitigated, [])
})

test("audit rejects unpinned source, changed archive integrity and altered installed files", () => {
  for (const change of [
    data => { data.lock.packages["node_modules/braces"].resolved = "https://registry.npmjs.org/braces/-/braces-3.0.3.tgz" },
    data => { data.lock.packages["node_modules/braces"].integrity = "sha512-changed" },
    data => { data.installed.version = "3.0.4" },
    data => { data.installed.files["lib/parse.js"] = "changed" },
    data => { data.installed.files["index.js"] = "changed" },
    data => { data.installed.files["package.json"] = "changed entrypoint" },
    data => { data.installed.files["lib/extra.js"] = "unexpected runtime source" },
    data => { delete data.installed.files["lib/expand.js"] },
    data => { data.lock.packages["node_modules/micromatch/node_modules/braces"] = { ...data.lock.packages["node_modules/braces"] } },
  ]) {
    const data = fixture(); change(data)
    assert.equal(evaluate(data).ok, false)
  }
})

test("audit rejects the same advisory when any chain package enters production", () => {
  for (const name of Object.keys(chain)) {
    const data = fixture()
    data.lock.packages[`node_modules/${name}`].dev = false
    assert.equal(evaluate(data).ok, false, name)
  }
})

test("audit rejects every new advisory including a second advisory on braces", () => {
  for (const change of [
    data => { data.audit.vulnerabilities.braces.via.push({ url: "https://github.com/advisories/GHSA-new", severity: "high", dependency: "braces" }) },
    data => { data.audit.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-other" },
    data => { data.audit.vulnerabilities.braces.via[0].range = "*" },
    data => { data.audit.vulnerabilities.braces.via[0].source++ },
    data => { data.audit.vulnerabilities.micromatch.via.push({ url: "https://github.com/advisories/GHSA-other", severity: "critical" }) },
    data => { data.audit.vulnerabilities.other = { name: "other", severity: "critical", via: [], nodes: ["node_modules/other"] } },
    data => { data.audit.vulnerabilities.other = { name: "other", severity: "moderate", via: [], nodes: ["node_modules/other"] } },
    data => { data.audit.vulnerabilities.braces.severity = "critical" },
  ]) {
    const data = fixture(); change(data)
    assert.equal(evaluate(data).ok, false)
  }
})

test("audit rejects changed package paths, versions and transitive relationships", () => {
  for (const change of [
    data => { data.audit.vulnerabilities.micromatch.nodes.push("node_modules/other/node_modules/micromatch") },
    data => { data.audit.vulnerabilities["fast-glob"].via = ["braces"] },
    data => { data.lock.packages["node_modules/micromatch"].version = "4.0.9" },
    data => { delete data.lock.packages["node_modules/fast-glob"] },
  ]) {
    const data = fixture(); change(data)
    assert.equal(evaluate(data).ok, false)
  }
})

test("unavailable or malformed scanner results fail closed", () => {
  for (const audit of [null, {}, { error: { code: "ENOAUDIT" } }, { vulnerabilities: {} }, { auditReportVersion: 2, vulnerabilities: null }, { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { high: 1, critical: 0, total: 1 } } }]) {
    const data = fixture(); data.audit = audit
    assert.equal(evaluate(data).ok, false)
  }
})
