import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import * as summaries from '../lib/ecosystem/agent-summaries.ts'
import * as overview from '../lib/ecosystem/overview.ts'
import * as catalog from '../lib/ecosystem/catalog.ts'

import { loadTypescript } from './helpers/load-typescript.mjs'
const h = React.createElement
const checkedAt = '2026-10-13T12:00:00Z'
const profile = (id, scope='benefitsi') => ({id,scope,purpose:id,provider:'observed-provider',model:'observed-model',citySlug:null,automation:'manual',contextFiles:[],contextHealth:'unknown',runtimeHealth:'unknown',schedules:[]})
const ids = ['ben','benefitsi-content','benefitsi-finance','benefitsi-seo','city-annweiler','benefitsi-menu']
const profiles = [...ids.map(id=>profile(id,id==='benefitsi-menu'?'unknown':'benefitsi')), ...['beast','flo','luis','thor','viki','nova','codex','alex'].map(id=>profile(id,'general')),profile('stamp-curator'),profile('studio')]
const control = (changes={}) => ({checkedAt,runtime:{state:'fresh',snapshot:{schemaVersion:1,hostId:'m1-benefitsi',observedAt:checkedAt,collectorVersion:'1',profiles}},cities:{state:'unavailable',items:[]},citySchedules:{state:'unavailable',items:[]},pipeline:{state:'unavailable',item:null},...changes})
const snapshot = {checkedAt,overdueSources:{value:0,unavailable:false},cityRun:null,cityRunUnavailable:true,activePartners:{value:20,unavailable:false},pendingReviews:{value:170,unavailable:false},failedJobs:{value:15,unavailable:false}}
const presentation = loadTypescript('components/ecosystem/ecosystem-overview.tsx',{
 'next/link':({href,children,...props})=>h('a',{...props,href,prefetch:undefined},children),
 '@/components/admin-translation-boundary':{AdminTranslationBoundary:({children})=>h(React.Fragment,null,children)},
 '@/lib/ecosystem/overview':overview,
 '@/lib/ecosystem/catalog':catalog,
 './ecosystem.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>key})},
 './ecosystem-analytics':{EcosystemActivity:()=>null},
 './ecosystem-product-hub':{EcosystemProductHub:()=>null},
 './ecosystem-explorer':{EcosystemExplorer:()=>null,PageDirectory:()=>null},
})
const { AgentOverview } = loadTypescript('app/agents/agent-overview.tsx', {
 './agent-controls':{AgentProfileControls:()=>null},
 '@/components/knowledge/benefitsi-knowledge-entry':{BenefitsiKnowledgeEntry:()=>null},
 'next/link':({href,children})=>h('a',{href},children),
 '@/lib/ecosystem/agent-summaries':summaries,
 '@/components/ecosystem/ecosystem-overview':presentation,
})
function documentFor(Component,props){const dom=new JSDOM(renderToStaticMarkup(h(Component,props)));return dom}

test('Benefitsi count uses proven membership, observed menu is reconciled, retired roles excluded',()=>{
 const inventory=summaries.benefitsiAgentInventory(control())
 assert.equal(inventory.observedCount,6)
 assert.equal(inventory.configuredCount,6)
 assert.equal(inventory.state,'fresh')
 const menu=inventory.agents.find(a=>a.id==='benefitsi-menu')
 assert.equal(menu.scope,'benefitsi');assert.equal(menu.evidence,'observed');assert.equal(menu.lastRunAt,null)
 assert.ok(!inventory.agents.some(a=>['viki','stamp-curator','studio'].includes(a.id)))
})
test('observed zero differs from missing and future-invalid data; stale retains age and no live claim',()=>{
 const empty=control();empty.runtime.snapshot.profiles=[]
 assert.equal(summaries.benefitsiAgentInventory(empty).observedCount,0)
 for(const runtime of [{state:'unavailable',snapshot:null},{state:'invalid',snapshot:null},{state:'fresh',snapshot:{...empty.runtime.snapshot,observedAt:'2026-10-13T12:06:00Z'}}]){
  assert.equal(summaries.benefitsiAgentInventory(control({runtime})).observedCount,null)
 }
 const stale=control({checkedAt:'2026-10-13T14:00:00Z'})
 assert.equal(summaries.benefitsiAgentInventory(stale).state,'stale')
 assert.equal(summaries.benefitsiAgentInventory(stale).observedCount,6)
})
test('six compact overview destinations have correct counts and no information disclosures',()=>{
 const dom=documentFor(presentation.EcosystemMetrics,{snapshot,agentData:control()}); const d=dom.window.document
 try{
  assert.equal(d.querySelectorAll('article').length,6)
  assert.equal(d.querySelectorAll('details,summary').length,0)
  const agent=d.querySelector('a[href="/agents"]');assert.ok(agent);assert.equal(agent.querySelector('strong').textContent,'6')
  assert.match(agent.textContent,/Benefitsi-Profile/)
  assert.ok(d.querySelector('a[href="/city-pages"]'));assert.ok(d.querySelector('a[href="/microsites"]'))
  assert.equal(d.querySelector('a[href="/city-pages"] strong').textContent,'Öffnen')
  assert.match(d.body.textContent,/Offene Freigaben/);assert.match(d.body.textContent,/Fehlgeschlagen/)
  assert.ok(!d.querySelector('a[href="#agenten"]'))
 }finally{dom.window.close()}
})
test('overview moves agent status to the standalone page and no longer mounts the team section',()=>{
 const dom=documentFor(presentation.EcosystemOverview,{snapshot,agentData:control(),analytics:{state:'unavailable'},pages:[],incomplete:false})
 try{assert.equal(dom.window.document.querySelector('#agenten'),null);assert.doesNotMatch(dom.window.document.body.textContent,/Agent-Status/);assert.doesNotMatch(dom.window.document.body.textContent,/Dein Team/)}finally{dom.window.close()}
})
test('standalone agent page includes only Benefitsi cards and does not expose other selected details',()=>{
 const dom=documentFor(AgentOverview,{data:control(),selectedAgentId:'viki'});const d=dom.window.document
 try{
  for(const id of ids)assert.ok(d.getElementById(`agent-${id}`),id)
  for(const id of ['beast','flo','luis','thor','viki','nova','codex','alex','stamp-curator','studio'])assert.equal(d.getElementById(`agent-${id}`),null,id)
  assert.doesNotMatch(d.body.textContent,/Weitere beobachtete Profile/)
  assert.match(d.body.textContent,/Aktive Läufe/)
  assert.match(d.getElementById('agent-benefitsi-menu').textContent,/Auf Abruf/)
  assert.equal(d.querySelectorAll('[data-agent-icon]').length,6)
  assert.equal(new Set([...d.querySelectorAll('[data-agent-icon]')].map(el=>el.dataset.agentIcon)).size,6)
 }finally{dom.window.close()}
})

test('knowledge missing state never displays fabricated document zero',()=>{
 for(const state of ['unavailable','unknown']){
  const dom=documentFor(presentation.EcosystemKnowledgeStatus,{status:{status:state,documentCount:0,lastSuccessfulSyncAt:null}})
  try{assert.equal(dom.window.document.querySelectorAll('dd')[1].textContent,'—')}finally{dom.window.close()}
 }
 const dom=documentFor(presentation.EcosystemKnowledgeStatus,{status:{status:'healthy',documentCount:0,lastSuccessfulSyncAt:checkedAt}})
 try{assert.equal(dom.window.document.querySelectorAll('dd')[1].textContent,'0')}finally{dom.window.close()}
})
