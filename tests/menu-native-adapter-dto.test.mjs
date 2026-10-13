import assert from 'node:assert/strict'
import test from 'node:test'
import { extractMenuFromFiles } from '../lib/menu-ai-import.ts'
const draft={name:'Fixture',currency:'EUR',complete:true,warnings:[],categories:[{name:'Food',items:[{name:'Item',description:'',price:1,allergens:[],tags:[],note:''}]}]}
const requestId='52b5b65d-67c0-4a87-8932-69f654f62e34'
const opts={bridgeUrl:'https://m1.example.test',bridgeSecret:'fixture-only',operationId:requestId,recover:true}
const response=changes=>async()=>Response.json({profile:'benefitsi-menu',task:'extract-menu',schemaVersion:2,requestId,
 adapter:'hermes-native-bounded-v2',provider:'openai-codex',model:'gpt-fixture',draft,...changes})
test('metered menu accepts validated native v2 result from selected provider',async()=>{
 assert.deepEqual(await extractMenuFromFiles([],{...opts,fetch:response({})}),draft)
 assert.deepEqual(await extractMenuFromFiles([],{...opts,fetch:response({provider:'custom/provider@private'})}),draft)
})
test('native v2 requires bounded provider and model identifiers and never accepts a v1 downgrade',async()=>{
 for(const changes of [{provider:''},{model:''},{provider:'https://private.invalid?key=anything'},{adapter:'unknown'},{schemaVersion:1}]){
  await assert.rejects(extractMenuFromFiles([],{...opts,fetch:response(changes)}),/passt nicht/)
 }
})

test('unsupported native Codex cap reports its specific boundary separately from missing cost evidence',async()=>{
 const error="Der native ChatGPT/Codex-Endpunkt unterstützt das erforderliche Ausgabelimit für Menüimporte nicht. Bitte einen begrenzbaren Anbieter wählen."
 await assert.rejects(extractMenuFromFiles([],{...opts,fetch:async()=>Response.json({error},{status:400})}),error=>/ChatGPT\/Codex-Endpunkt.*Ausgabelimit/.test(error.message)&&!/Kostenfreigabe/.test(error.message))
})
