import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as validators from '../lib/seo/ai-report-import.ts';
const id='12345678-abcd-4abc-8abc-123456789012';
function setup({admin=true,error=null}={}) {
 const calls=[];
 const deps={'next/navigation':{redirect:path=>{throw {redirect:path}}},'next/cache':{revalidatePath:path=>calls.push(['revalidate',path])},'@/lib/seo/ai-report-import':validators,'@/lib/admin':{requireAdmin:async()=>{calls.push(['auth']);if(!admin)throw Error('forbidden');return {supabase:{from(table){calls.push(['table',table]);const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id,canonical_url:'https://benefitsi.de/stadt/annweiler'},error:null}),insert(row){calls.push(['insert',row]);return q},abortSignal:()=>table==='seo_targets'?q:Promise.resolve({data:null,error})};return q}}};}}};
 const compiled=ts.transpileModule(readFileSync(new URL('../app/seo/aieo/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{}};new Function('require','exports',compiled)(name=>deps[name],loaded.exports);
 const form=new FormData();for(const [key,value] of Object.entries({target_id:id,provider:'bing_ai_performance',report_scope:'page',period_start:'2026-10-01',period_end:'2026-10-02',report_timezone:'UTC',metric_value:'3',exported_at:'2026-10-03T10:00',evidence_confirmed:'on',url:'https://private.invalid?token=secret'})) form.set(key,value);
 return {calls,form,run:()=>loaded.exports.importAiReport(form)};
}
test('import requires admin and stores only validated aggregate evidence using user RLS',async()=>{
 const r=setup();await assert.rejects(r.run(),e=>e.redirect==='/seo/aieo?state=saved');assert.equal(r.calls[0][0],'auth');
 const row=r.calls.find(c=>c[0]==='insert')[1];assert.equal(row.metric_value,3);assert.equal(row.provider,'bing_ai_performance');assert.equal(row.scope_url,'https://benefitsi.de/stadt/annweiler');assert.doesNotMatch(JSON.stringify(row),/secret|private/);assert.equal(row.imported_by,undefined);
 const denied=setup({admin:false});await assert.rejects(denied.run(),/forbidden/);assert.deepEqual(denied.calls,[['auth']]);
});
test('invalid or duplicate evidence is never reported as a successful import',async()=>{
 const invalid=setup();invalid.form.set('metric_value','');await assert.rejects(invalid.run(),e=>e.redirect==='/seo/aieo?state=invalid');assert.equal(invalid.calls.some(c=>c[0]==='insert'),false);
 const duplicate=setup({error:{code:'23505'}});await assert.rejects(duplicate.run(),e=>e.redirect==='/seo/aieo?state=duplicate');assert.equal(duplicate.calls.some(c=>c[0]==='revalidate'),false);
});
