import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createElement } from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as levels from '../lib/partner-visit-levels.ts'
import * as categories from '../lib/partner-categories.ts'

function page({ partners = [], fail = false, authorized = true } = {}) {
  const events = []
  const dependencies = {
    'react/jsx-runtime': jsx,
    'next/link': { default: ({ children, ...props }) => createElement('a', props, children) },
    '@/lib/admin': { requireAdmin: async () => {
      events.push('auth')
      if (!authorized) throw new Error('redirect login')
      return { supabase: {}, adminSession: { user: { email: 'admin@test.invalid' }, profile: null } }
    } },
    '@/lib/partner-categories': categories,
    '@/lib/partner-visit-levels': levels,
    '@/lib/partner-visit-level-data': { loadVisitLevelPartners: async () => {
      events.push('read')
      if (fail) throw new Error('unavailable')
      return partners
    } },
    '../../admin-shell': { AdminShell: ({ children }) => createElement('main', null, children) },
  }
  const source = readFileSync(new URL('../app/partners/visit-levels/page.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loadedModule = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`)
    return dependencies[name]
  }, loadedModule, loadedModule.exports)
  return { events, render: async query => renderToStaticMarkup(await loadedModule.exports.default({ searchParams: Promise.resolve(query) })) }
}

test('the protected page authenticates before any partner read', async () => {
  const subject = page({ authorized: false })
  await assert.rejects(subject.render({}), /redirect login/)
  assert.deepEqual(subject.events, ['auth'])
})

test('direct category and frequency URLs render selected values and actual partner configurations', async () => {
  const subject = page({ partners: [
    { id: 'low-partner', name: 'Synthetic Park', category: ['Zoo'], level_frequency: 'low' },
    { id: 'fallback-partner', name: 'Synthetic Unknown', category: ['Zoo'], level_frequency: null },
  ] })
  const html = await subject.render({ category: 'Zoo', frequency: 'low' })
  assert.deepEqual(subject.events, ['auth', 'read'])
  assert.match(html, /value="Zoo" selected=""/)
  assert.match(html, /value="low" selected=""/)
  assert.match(html, /Bronze IV/)
  assert.match(html, /ab 40 Besuche/)
  assert.doesNotMatch(html, /ab 250 Besuche/)
  assert.match(html, /unterschiedliche Partnerkonfigurationen/)
  assert.match(html, /Keine Frequenz hinterlegt/)
  assert.match(html, /partners\?partner=low-partner/)
  assert.match(html, /Ab App-Version 1\.4\.14 \(Build 173\) in TestFlight bereitgestellt/)
})

test('empty categories and data failures produce distinct honest states', async () => {
  const empty = await page().render({ category: 'Leisure Center' })
  assert.match(empty, /keine Partnerkonfiguration vorhanden/)
  assert.match(empty, /kein Kategorie-Standard festgelegt/)
  const failed = await page({ fail: true }).render({ category: 'Zoo' })
  assert.match(failed, /konnten nicht geladen werden/)
  assert.match(failed, /Konfiguration unbekannt/)
  assert.doesNotMatch(failed, /keine Partnerkonfiguration vorhanden|0 Partner · wirksame/)
})

test('the generated reference retains a checked App export fingerprint', () => {
  const bytes = readFileSync(new URL('../lib/generated/partner-visit-levels.json', import.meta.url))
  const source = JSON.parse(readFileSync(new URL('../lib/generated/partner-visit-levels-source.json', import.meta.url)))
  assert.equal(source.contractSha256, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(source.repository, 'Benefitsi/Benefitsi-App')
  assert.match(source.revision, /^[a-f0-9]{40}$/)
  assert.match(source.sourceSha256, /^[a-f0-9]{64}$/)
})
