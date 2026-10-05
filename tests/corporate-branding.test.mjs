import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { loadTypescript } from './helpers/load-typescript.mjs'
const fixture = JSON.parse(readFileSync(new URL('./fixtures/corporate-branding-contract.json', import.meta.url)))
const company = fixture.branded_owner_detail.company
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0])
const plain = value => JSON.parse(JSON.stringify(value))
const warnings = []
const helper = () => loadTypescript('lib/corporate/branding.ts', {}, { crypto: webcrypto, Blob, Uint8Array, console: { ...console, warn: message => warnings.push(message) } })
function form(extra = {}) {
 const data = new FormData()
 for (const [key,value] of Object.entries({companyId:company.company_id,expectedUpdatedAt:fixture.default_detail.company.updated_at,welcomeText:' Willkommen 👋 ',logoPath:company.branding.logo_path,...extra})) data.set(key,value)
 return data
}
function client(result, options = {}) {
 const calls = []
 const storage = { upload:async (...args)=>{calls.push(['upload',...args]);return {error:null}}, remove:async paths=>{calls.push(['remove',paths]);return {error:options.removeError??null}}, download:async path=>{calls.push(['download',path]);return {data:new Blob([options.bytes??png],{type:options.mime??'image/png'}),error:null}} }
 return {calls,rpc:async (...args)=>{calls.push(['rpc',...args]);if(options.throws)throw Error('lost');return {data:result,error:options.error??null}},storage:{from:bucket=>{assert.equal(bucket,'corporate-logos');return storage}}}
}
test('branding parser accepts executed DTOs and isolates malformed or older branding from company access', async () => {
 const {parseCorporateBranding} = helper()
 assert.deepEqual(plain(parseCorporateBranding(company.branding,company.company_id)),company.branding)
 for (const value of [undefined,{logo_path:'https://tracker.invalid/logo.png',welcome_text:'Hi'},{logo_path:company.branding.logo_path,welcome_text:'\0'},{logo_path:null,welcome_text:'😀'.repeat(501)}]) assert.deepEqual(plain(parseCorporateBranding(value,company.company_id)),{logo_path:null,welcome_text:''})
 assert.deepEqual(plain(parseCorporateBranding(company.branding,'4c99bd37-aeee-4c36-aee6-012b4619a521')), {logo_path:null,welcome_text:''})
 const {loadCorporateCompany}=loadTypescript('lib/corporate/companies.ts')
 for(const branding of [undefined,{logo_path:'http://bad',welcome_text:'x'},company.branding]) {
  const dto={...fixture.branded_owner_detail,company:{...company,branding}}
  const result=await loadCorporateCompany({rpc:async()=>({data:dto,error:null})},company.company_id,0)
  assert.equal(result.status,'ok');assert.deepEqual(plain(result.company.branding),branding===company.branding?company.branding:{logo_path:null,welcome_text:''})
 }
})
test('upload validation enforces bytes, MIME and size while text counts Unicode codepoints', () => {
 const {validLogoBytes,normalizeWelcomeText}=helper()
 assert.equal(validLogoBytes(png,'image/png'),true)
 assert.equal(validLogoBytes(Uint8Array.of(255,216,255,224),'image/jpeg'),true)
 assert.equal(validLogoBytes(Uint8Array.of(82,73,70,70,4,0,0,0,87,69,66,80),'image/webp'),true)
 const largest=new Uint8Array(524288);largest.set(png);assert.equal(validLogoBytes(largest,'image/png'),true)
 for(const [bytes,mime] of [[png,'image/jpeg'],[Uint8Array.of(1,2,3),'image/png'],[new Uint8Array(524289),'image/png'],[png,'image/svg+xml']]) assert.equal(validLogoBytes(bytes,mime),false)
 assert.equal(normalizeWelcomeText(' 😀'.trim().repeat(500)), '😀'.repeat(500))
 assert.equal(normalizeWelcomeText('😀'.repeat(501)),null)
 assert.equal(normalizeWelcomeText('Hello\nTeam\t!'),'Hello\nTeam\t!')
 assert.equal(normalizeWelcomeText('bad\u0001'),null)
 assert.equal(normalizeWelcomeText('bad\r'),null)
 assert.equal(normalizeWelcomeText('  '+ '😀'.repeat(500)+'  '),'😀'.repeat(500))
})
test('save uploads an immutable verified asset and preserves the exact RPC lock', async () => {
 const c=client({...fixture.update,previous_logo_path:company.branding.logo_path})
 const result=await helper().saveCorporateBranding(c,form({logo:new File([png],'tracker.svg',{type:'image/png'})}))
 assert.equal(result.status,'updated');assert.equal(result.updatedAt,fixture.update.updated_at);assert.equal(result.branding.welcome_text,'Willkommen 👋')
 const [upload,rpc,remove]=c.calls
 assert.equal(upload[0],'upload');assert.match(upload[1],new RegExp(`^${company.company_id}/[0-9a-f-]{36}\\.png$`));assert.equal(upload[3].upsert,false)
 assert.equal(rpc[1],'update_corporate_branding');assert.deepEqual(plain(rpc[2]),{p_company_id:company.company_id,p_expected_updated_at:fixture.default_detail.company.updated_at,p_welcome_text:'Willkommen 👋',p_logo_path:upload[1]})
 assert.deepEqual(plain(remove),['remove',[company.branding.logo_path]])
})
test('definitive rejection cleans only attempted new asset; ambiguous commit retains it', async () => {
 for(const status of ['invalid','not_found','conflict']) {
  const c=client({status});const result=await helper().saveCorporateBranding(c,form({logo:new File([png],'a.png',{type:'image/png'})}))
  assert.equal(result.status,status);assert.deepEqual(plain(c.calls.at(-1)),['remove',[c.calls[0][1]]])
 }
 for(const options of [{throws:true},{error:{message:'network'}},{}]) {
  const c=client({status:'updated',updated_at:'bad',previous_logo_path:null},options)
  assert.equal((await helper().saveCorporateBranding(c,form({logo:new File([png],'a.png',{type:'image/png'})}))).status,'error')
  assert.equal(c.calls.filter(c=>c[0]==='remove').length,0)
 }
})
test('invalid input cannot upload or mutate and cleanup failure cannot undo confirmed success', async () => {
 for(const input of [{companyId:'bad'},{expectedUpdatedAt:'bad'},{welcomeText:'😀'.repeat(501)},{logoPath:'https://bad'},{logo:new File([png],'a.jpg',{type:'image/jpeg'})}]) {
  const c=client(fixture.update);assert.equal((await helper().saveCorporateBranding(c,form(input))).status,'invalid');assert.equal(c.calls.length,0)
 }
 const c=client({...fixture.update,previous_logo_path:company.branding.logo_path},{removeError:{message:'RLS'}})
 const result=await helper().saveCorporateBranding(c,form({logoPath:''}))
 assert.equal(result.status,'updated');assert.equal(result.branding.logo_path,null);assert.ok(result.cleanupWarning);assert.equal(warnings.length,1)
})
test('logo download exposes bounded verified payload and refuses paths outside the company', async () => {
 const {readCorporateLogo}=helper();const c=client(null)
 const result=await readCorporateLogo(c,company.company_id,company.branding.logo_path)
 assert.equal(result.mime,'image/png');assert.equal(result.base64,Buffer.from(png).toString('base64'))
 assert.equal(await readCorporateLogo(c,company.company_id,'https://bad'),null)
 for(const options of [{mime:'image/jpeg'},{bytes:new Uint8Array(524289)}]) assert.equal(await readCorporateLogo(client(null,options),company.company_id,company.branding.logo_path),null)
})
test('every branding server action reauthorizes and uses the authenticated client', async () => {
 const c=client(fixture.update);let auth=0;const paths=[]
 const actions=loadTypescript('app/companies/actions.ts',{'@/lib/admin':{requireAdmin:async()=>{auth++;return {supabase:c}}},'next/cache':{revalidatePath:p=>paths.push(p),refresh:()=>{}}},{crypto:webcrypto,Blob,Uint8Array})
 await actions.saveCorporateCompanyBranding(form())
 await actions.readCorporateCompanyLogo(company.company_id,company.branding.logo_path)
 await actions.reloadCorporateCompanyBranding('bad')
 assert.equal(auth,3);assert.deepEqual(paths,['/companies',`/companies/${company.company_id}`])
 const denied=loadTypescript('app/companies/actions.ts',{'@/lib/admin':{requireAdmin:async()=>{throw Error('denied')}},'next/cache':{}},{crypto:webcrypto})
 for(const invoke of [()=>denied.saveCorporateCompanyBranding(form()),()=>denied.readCorporateCompanyLogo(company.company_id,company.branding.logo_path),()=>denied.reloadCorporateCompanyBranding(company.company_id)]) await assert.rejects(invoke,/denied/)
})
