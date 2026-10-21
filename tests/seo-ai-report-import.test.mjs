import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAiReportImport, aiReportMetric } from '../lib/seo/ai-report-import.ts';
const now=new Date('2026-10-07T12:00:00Z');
const target={id:'12345678-abcd-4abc-8abc-123456789012',canonical_url:'https://benefitsi.de/stadt/annweiler'};
const input=()=>({provider:'google_search_generative_ai',report_scope:'page',period_start:'2026-10-01',period_end:'2026-10-05',report_timezone:'America/Los_Angeles',metric_value:'0',exported_at:'2026-10-06T14:30',evidence_confirmed:true});
test('a verified reported zero remains zero and provider metrics remain distinct',()=>{
 const row=validateAiReportImport(input(),target,now);
 assert.equal(row.metric_value,0);assert.equal(row.exported_at,'2026-10-06T14:30:00.000Z');assert.equal(row.scope_url,target.canonical_url);
 assert.equal(aiReportMetric('google_search_generative_ai'),'KI-Impressionen');assert.equal(aiReportMetric('bing_ai_performance'),'Zitate');
});
test('rejects missing counts, fractions, inferred totals, future periods and unsupported sources',()=>{
 for(const patch of [{metric_value:''},{metric_value:'-1'},{metric_value:'1.2'},{metric_value:'1e3'},{provider:'estimated_chatgpt'},{period_end:'2026-10-08'},{period_start:'2026-10-06'},{exported_at:'2026-10-08T00:00'},{exported_at:'2026-10-02T00:00'},{evidence_confirmed:false},{report_scope:'property'},{report_timezone:'unknown'}]) assert.throws(()=>validateAiReportImport({...input(),...patch},target,now));
 for(const url of ['https://benefitsi.de/stadt/annweiler?token=secret','https://evil.invalid/','https://benefitsi.de/konto','https://benefitsi.de/stadt/annweiler/newsletter/bestaetigen']) assert.throws(()=>validateAiReportImport(input(),{...target,canonical_url:url},now));
});
