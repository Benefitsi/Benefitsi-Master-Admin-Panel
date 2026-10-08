import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import test from 'node:test'
import {readWorkspacePartnerBrief} from '../lib/workspace/partner-brief-data.ts'
const {createClient}=createRequire(import.meta.url)('@supabase/supabase-js')
const id='00000000-0000-4000-8000-000000000011'

function database({failure,missing=false,draft=true}={}) {
  const requests=[]
  const client=createClient('https://database.example.test','public-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(input),q=url.searchParams,table=url.pathname.split('/').at(-1)
    requests.push(url)
    assert.equal(init.method,'GET')
    assert.notEqual(q.get('select'),'*','No broad reads of PINs or private account data')
    if(failure===table)return Response.json({code:'42501',message:'denied'},{status:403})
    if(table==='partners'){
      assert.equal(q.get('id'),`eq.${id}`)
      assert.ok(!q.get('select').split(',').includes('pin'))
      return Response.json(missing?[]:[{id,name:'Bistro Beispiel',owner_id:'owner',category:['Pizza'],address:'Beispielstraße 1'}])
    }
    if(table==='users'){
      assert.equal(q.get('select'),'id,display_name,email')
      assert.equal(q.get('id'),'eq.owner')
      return Response.json([{id:'owner',display_name:'Inhaberin Beispiel',email:'owner@example.test'}])
    }
    if(table==='microsite_versions'){
      assert.equal(q.get('microsite_id'),'eq.site')
      if(q.has('status')){
        assert.equal(q.get('status'),'eq.draft')
        assert.equal(q.get('limit'),'1')
        assert.ok(q.get('order').startsWith('version_number.desc'))
        return Response.json(draft?[{config:{richMediaTour:{kind:'tour',title:'Tourentwurf',url:'https://kuula.co/share/collection/example',rightsConfirmed:false,approved:false}}}]:[])
      }
      assert.equal(q.get('id'),'eq.live')
      return Response.json([{config:{richMedia:{kind:'video',title:'Veröffentlichtes Video',url:'https://benefitsi.de/media/example.mp4',rightsConfirmed:true,approved:true}}}])
    }
    assert.ok(['deals','partner_reward_milestones','partner_opening_hours','partner_holidays','partner_socials','menus','partner_staff','partner_memberships','microsites'].includes(table),'No customer history or unrelated tables')
    assert.equal(q.get('partner_id'),`eq.${id}`,table+' is scoped to the requested partner')
    if(table==='microsites')return Response.json([{id:'site',partner_id:id,slug:'example',status:'published',published_version_id:'live'}])
    if(table==='deals')return Response.json([{id:'deal',partner_id:id,public_title:'Mittagsangebot',active:false}, {id:'retired',partner_id:id,type:'free_item',trigger_key:'streak',public_title:'Retired weekly reward',active:true}, {id:'retired-meta',partner_id:id,type:'bonus_stamp',metadata:{streak_mode:'calendar_frequency'},public_title:'Retired calendar reward',active:false}])
    if(table==='partner_opening_hours')return Response.json([{id:'hours',partner_id:id,weekday:1,opens_at:'11:00:00',closes_at:'14:00:00',is_closed:false,sort_order:0}])
    return Response.json([])
  }}})
  return {client,requests}
}

test('real PostgREST client emits scoped editorial reads and uses only the latest prepared microsite',async()=>{
  const db=database(),brief=await readWorkspacePartnerBrief(db.client,id)
  assert.ok(brief.facts.A01.some(f=>f.value==='Bistro Beispiel'))
  assert.ok(brief.facts.A01.some(f=>f.value.includes('Inhaberin Beispiel')))
  assert.ok(brief.facts.A01.some(f=>f.value.includes('Mo: 11:00–14:00')))
  assert.doesNotMatch(JSON.stringify(brief), /Retired weekly reward|Retired calendar reward/)
  assert.ok(brief.facts.D01.some(f=>f.value.includes('Mittagsangebot')))
  assert.equal(brief.facts.D01.length,1)
  assert.ok(brief.facts.F02.some(f=>f.value.includes('Tourentwurf')))
  assert.ok(brief.facts.F07.some(f=>f.value.includes('Nutzungsrechte noch offen')))
  assert.equal(db.requests.filter(r=>r.pathname.endsWith('microsite_versions')).length,1)
})
test('published media is used only when there is no prepared draft',async()=>{
  const db=database({draft:false}),brief=await readWorkspacePartnerBrief(db.client,id)
  assert.ok(brief.facts.F02.some(f=>f.value.includes('Veröffentlichtes Video')))
})
for(const table of ['partners','deals','microsite_versions','partner_memberships'])test(`a failed ${table} read does not advertise empty research`,async()=>{
  const db=database({failure:table})
  await assert.rejects(()=>readWorkspacePartnerBrief(db.client,id),/geladen/)
})
test('missing partner stops the read before any other data is requested',async()=>{
  const db=database({missing:true})
  await assert.rejects(()=>readWorkspacePartnerBrief(db.client,id),/nicht mehr verfügbar/)
  assert.equal(db.requests.length,1)
})
