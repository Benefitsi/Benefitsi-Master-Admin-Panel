// Sync only the App's tested export; never maintain a second threshold list.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const check = args.includes('--check')
const app = args.find(arg => arg !== '--check')
if (!app) throw new Error('Usage: node scripts/sync-partner-visit-levels.mjs [--check] /path/to/Benefitsi-App')
const root = fileURLToPath(new URL('../', import.meta.url))
const path = 'contracts/partner-visit-levels.json'
const source = 'lib/features/partners/partner_level_service.dart'
const bytes = readFileSync(resolve(app, path))
const sourceBytes = readFileSync(resolve(app, source))
const committedFile = path => execFileSync('git', ['-C', resolve(app), 'show', `HEAD:${path}`])
assert.equal(bytes.toString(), committedFile(path).toString(), 'Commit the tested App export before syncing')
assert.equal(sourceBytes.toString(), committedFile(source).toString(), 'Commit the App source before syncing')
const contract = JSON.parse(bytes)
assert.equal(contract.schemaVersion, 1)
assert.deepEqual(Object.keys(contract.scales), ['high', 'medium', 'low'])
const digest = value => createHash('sha256').update(value).digest('hex')
const provenance = {
  repository: 'Benefitsi/Benefitsi-App',
  revision: execFileSync('git', ['-C', resolve(app), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  contractPath: path,
  sourcePath: source,
  contractSha256: digest(bytes),
  sourceSha256: digest(sourceBytes),
}
const output = resolve(root, 'lib/generated/partner-visit-levels.json')
const metadata = resolve(root, 'lib/generated/partner-visit-levels-source.json')
if (check) {
  assert.equal(readFileSync(output, 'utf8'), bytes.toString(), 'Admin reference differs from the tested App export')
  assert.deepEqual(JSON.parse(readFileSync(metadata, 'utf8')), provenance, 'App source/revision changed; review and sync again')
  console.log('App/Admin contract and source revision match exactly.')
} else {
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, bytes)
  writeFileSync(metadata, JSON.stringify(provenance, null, 2) + '\n')
  console.log('Synced App contract. Run --check after the App commit is finalized.')
}
