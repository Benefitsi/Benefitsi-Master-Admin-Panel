import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
test('direct legacy signup action redirects to canonical billing before any provider mutation',async()=>{
 let imports=0;
 const source=readFileSync('app/partner/commerce/actions.ts','utf8');const start=source.indexOf('export async function openSoftwareBilling');const end=source.indexOf('\n\nexport async function',start+10);
 const js=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{}};vm.runInNewContext(js,{module:loaded,exports:loaded.exports,value:(f,k)=>f.get(k),commercePartner:async()=>({provider:{partner_id:'own-partner'}}),redirect:url=>{throw new Error('redirect:'+url)},require:()=>{imports++;throw Error('provider must not be loaded')}});
 const form=new FormData();form.set('provider_id','provider');await assert.rejects(()=>loaded.exports.openSoftwareBilling(form),/redirect:\/partner\/billing\?partner=own-partner/);assert.equal(imports,0);
});
