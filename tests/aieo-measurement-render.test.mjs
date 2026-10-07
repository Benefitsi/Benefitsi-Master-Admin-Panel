import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as model from '../lib/analytics/aieo-measurement.ts';
const require=createRequire(import.meta.url);
const source=ts.transpileModule(readFileSync(new URL('../components/analytics/aieo-measurement-panel.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const loaded={exports:{}};
new Function('require','exports',source)(name=>name==='@/lib/analytics/aieo-measurement'?model:name==='next/link'?{default:({children,...props})=>createElement('a',props,children)}:require(name),loaded.exports);
const render=result=>renderToStaticMarkup(createElement(loaded.exports.AieoMeasurementPanel,{result}));
test('rendered report separates attempted handoff, actual native target and server confirmation',()=>{
 const html=render({state:'ready',scope:{cityId:null,environment:'test'},data:{stages:Object.keys(model.AIEO_STAGES).map(key=>({key,events:4,actors:2,aiReferralEvents:1})),confirmedVisits:2,confirmedRedemptions:1,coverage:'consented_observations'}});
 for(const text of ['Versuche, die App zu öffnen','In der App angezeigte Einstiegsziele','QR-Code angezeigt','Serverbestätigte Besuche: 2','Einlösungen: 1','keine gemeinsame Conversion-Rate','Davon KI-Verweise']) assert.ok(html.includes(text),text);
 assert.match(html,/href="\/seo\/aieo"/);
});
test('forbidden and unavailable states disclose no aggregate values or false zero',()=>{
 assert.equal(render({state:'forbidden'}),'');
 for(const state of ['setup_required','unavailable','invalid_scope']) {const html=render({state});assert.doesNotMatch(html,/<table|Serverbestätigte Besuche:|Einlösungen: 0/);assert.match(html,/role="status"/);}
});
