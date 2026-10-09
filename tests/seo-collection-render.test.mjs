import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {JSDOM} from 'jsdom'
import {loadTypescript} from './helpers/load-typescript.mjs'
import * as config from '../lib/seo/collection-config.ts'
import * as health from '../lib/seo/collection-health.ts'

// Exercise the real TSX with the repo's isolated loader. Only server runtime
// boundaries are replaced; no process-wide module mocking or writes occur.
const noWrite = async () => {}
const actions = {
  retryCollectionRun:noWrite, configureCollectionSchedule:noWrite, disconnectGoogleCollection:noWrite,
  queueCollectionNow:noWrite, saveCollectionRuntime:noWrite, saveCollectionSettings:noWrite,
}
const {Observations, WebLink} = loadTypescript('app/seo/automatisierung/observations.tsx', {
  '@/lib/seo/collection-config':config, './actions':actions,
})
const run = (kind, data) => ({
  id:'run-1', target_id:'target-1', kind, status:'completed', state:'ok',
  observed_at:'2026-09-28T12:00:00Z', created_at:'2026-09-28T12:00:00Z',
  attempts:1, error_code:null, source:'source', method:'method', data,
})
const render = (kind, data) => JSDOM.fragment(renderToStaticMarkup(React.createElement(Observations, {
  history:[run(kind, data)], targetId:'target-1',
}))).textContent

test('missing crawl arrays remain unknown instead of measured zero or no findings', () => {
  const html = render('crawl', {linksChecked:0})
  assert.match(html, /Noch keine Daten Seiten/)
  assert.match(html, /Noch keine Daten/)
  assert.doesNotMatch(html, /0 Seiten|Keine Befunde erfasst/)
})

test('explicit empty crawl arrays show measured zero and no findings', () => {
  const html = render('crawl', {pages:[], linksChecked:0, findings:[]})
  assert.match(html, /0 Seiten, 0 Links geprüft/)
  assert.match(html, /Keine Befunde erfasst/)
})

test('missing GBP coverage stays unknown while measured metrics remain visible', () => {
  const html = render('gbp', {periods:[{startDate:'2026-08-01',endDate:'2026-08-28',metrics:{callClicks:4}}]})
  assert.match(html, /Klicks auf Anrufen: 4/)
  assert.match(html, /Noch keine Daten/)
  assert.doesNotMatch(html, /Klicks auf Anrufen: 4 · 0\/28 Tage/)
})

test('explicit zero GBP coverage is displayed as zero observed days', () => {
  const html = render('gbp', {periods:[{startDate:'2026-08-01',endDate:'2026-08-28',metrics:{callClicks:0},coverage:{callClicks:{observedDays:0,complete:false}}}]})
  assert.match(html, /Klicks auf Anrufen: 0 · 0\/28 Tage \(Teilsumme\)/)
})

test('configured Google connection still explains its required grant and read-only use', async () => {
  const overview = {
    health:{runtime:{enabled:true,monthly_request_limit:0,free_tier_confirmed:false,last_tick_started_at:null,last_tick_finished_at:null,last_tick_error:null,last_counts:{}},used:0,scheduler:null,queue:{queued:0,running:0,oldestQueuedAt:null},latest:[]},
    targets:[],targetCount:0,settings:[],selected:null,history:[],
    providers:{oauthReady:true,gsc:null,gbp:null,bright:false,psi:false},
  }
  const {default: CollectionAutomationPage} = loadTypescript('app/seo/automatisierung/page.tsx', {
    'next/link':({children,href,...props})=>React.createElement('a',{href,...props},children),
    '@/lib/admin':{requireAdmin:async()=>({adminSession:{profile:{display_name:'Admin'},user:{email:'admin@example.com'}}})},
    '@/lib/seo/collection-store':{getCollectionOverview:async()=>overview},
    '@/lib/seo/collection-health':health,
    '@/lib/seo/seo-comparison':{readComparisonConfig:()=>null},
    '@/app/admin-shell':{AdminShell:({children})=>React.createElement(React.Fragment,null,children)},
    './actions':actions,
    './observations':{Observations, WebLink},
  })
  const html = renderToStaticMarkup(await CollectionAutomationPage({searchParams:Promise.resolve({})}))
  assert.match(html, /business\.manage/)
  assert.match(html, /liest die Daten nur/)
  assert.match(html, /Google-Unternehmensprofil/)
  assert.match(html, /Verbinden/)
})
