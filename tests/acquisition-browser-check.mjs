import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

// In-memory bundle/CSS only. Real shell, editor, model and acquisition data layer;
// synthetic Workspace transport persists exclusively in this origin's localStorage.
const repo=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'')
const require=createRequire(repo+'/package.json')
const {build}=createRequire(require.resolve('tsx'))('esbuild')
const tailwindRequire=createRequire(require.resolve('@tailwindcss/postcss'))
const {compile}=tailwindRequire('@tailwindcss/node')
const {Scanner}=tailwindRequire('@tailwindcss/oxide')
const adapters={
 'next/link':`import React from 'react';export default function Link({href,children,prefetch,...props}){return <a {...props} href={href}>{children}</a>}`,
 'next/image':`import React from 'react';export default function Image({priority,...props}){return <img {...props}/>} `,
 'next/navigation':`export function usePathname(){return location.pathname}`,
 'shell-actions':`export async function signOut(){}`,
 'acquisition-actions':`export async function loadAcquisitionIndex(){throw Error('Inject fixture services')}export const loadAcquisitionDocument=loadAcquisitionIndex,saveAcquisitionDocument=loadAcquisitionIndex,createAcquisitionWorkspace=loadAcquisitionIndex;`,
}
const entry=`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AdminShell} from '${repo}/app/admin-shell.tsx';
import {AcquisitionApp} from '${repo}/components/acquisition/acquisition-app.tsx';
import {acquisitionFixture,partner,workspace} from '${repo}/tests/helpers/acquisition-fixture.mjs';
import {createAcquisitionData} from '${repo}/lib/acquisition/data.ts';
import {makeAcquisitionDocument,encodeAcquisitionDocument} from '${repo}/lib/acquisition/model.ts';
const key='benefitsi-acquisition-synthetic-v1';
localStorage.setItem('benefitsi-admin-language','de');
const params=new URLSearchParams(location.search);
if(params.has('reset')){localStorage.removeItem(key);params.delete('reset');history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():''))}
const cityId='00000000-0000-4000-8000-000000000004';
const partners=[{...partner,name:'Testhotel'},{...partner,id:'00000000-0000-4000-8000-000000000003',name:'Café Ufer',city_id:cityId,type:'Gastronomie'}];
const secondWorkspace={...workspace,id:'00000000-0000-4000-8000-000000000005',title:'Region Süd'};
let stored=null;
try{stored=JSON.parse(localStorage.getItem(key)||'null')}catch{}
const seed={partners,cities:[{id:workspace.id,name:'Berlin'},{id:cityId,name:'Hamburg'}],workspaces:stored?.workspaces??(params.has('empty')?[]:[workspace,secondWorkspace]),pages:stored?.pages??[]};
if(!stored && !params.has('empty')){
 const doc=makeAcquisitionDocument(workspace.id,{id:partners[1].id,name:'Café Ufer',city:'Hamburg',industry:'Gastronomie'});
 doc.fields.status='contacted';doc.fields.nextStep='Rückmeldung erfragen';doc.fields.followUpDate='2026-10-16';doc.fields.meetingDate='2026-10-20';doc.fields.food='interested';
 doc.contacts=[{id:'00000000-0000-4000-8000-000000000006',date:'2026-10-15',channel:'phone',note:'Synthetisches Gespräch: Interesse an Speisenfotos.'}];
 seed.pages=[{...encodeAcquisitionDocument(doc),revision:1}];
}
const fixture=acquisitionFixture(seed);
const persist=()=>localStorage.setItem(key,JSON.stringify({pages:[...fixture.pages.values()],workspaces:[...fixture.workspaces.values()]}));
const transport=createAcquisitionData(fixture.client,{
 async saveWorkspacePage(page){const result=await fixture.services.saveWorkspacePage(page);if(result.ok)persist();return result},
 async saveWorkspace(input){const result=await fixture.services.saveWorkspace(input);if(result.ok)persist();return result},
});
let nextSave='normal';
const services={...transport,async saveAcquisitionDocument(doc){
 const mode=nextSave;nextSave='normal';window.dispatchEvent(new Event('fixture-mode'));
 if(mode==='error')return {ok:false,error:'Synthetischer Speicherfehler. Der Entwurf bleibt erhalten.'};
 if(mode==='conflict'){
  const current=fixture.pages.get(doc.page.id);
  if(current){await fixture.services.saveWorkspacePage({...current,revision:current.revision});persist()}
  else return {ok:false,error:'Synthetischer Versionskonflikt. Bitte erst eine Akte speichern.',conflict:{...doc.page,revision:1}};
 }
 const result=await transport.saveAcquisitionDocument(doc);
 if(mode==='lost' && result.ok)throw Error('Synthetisch verlorene Antwort nach Speicherung');
 return result;
}};
const initial=await services.loadAcquisitionIndex();
function App(){
 const [mode,setMode]=useState('normal');
 React.useEffect(()=>{const update=()=>setMode(nextSave);window.addEventListener('fixture-mode',update);return()=>window.removeEventListener('fixture-mode',update)},[]);
 return <AdminShell adminName="Synthetische Browserprüfung" title="Akquise & Kontakte" subtitle="Partner · Gespräche und Wiedervorlagen">
  <aside aria-label="Prüfsteuerung" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
   <strong>Nur synthetische Daten</strong>
   <label className="grid min-w-0 gap-1">Nächster Speicherversuch<select aria-label="Nächster Speicherversuch" className="min-h-11 max-w-full rounded-lg border bg-white px-2" value={mode} onChange={event=>{nextSave=event.target.value;setMode(nextSave)}}><option value="normal">Erfolgreich</option><option value="error">Speicherfehler</option><option value="conflict">Versionskonflikt</option><option value="lost">Antwort nach Speicherung verlieren</option></select></label>
   <button className="min-h-11 rounded-lg border px-3" onClick={()=>{if(confirm('Synthetische Prüfdaten zurücksetzen?')){localStorage.removeItem(key);location.href='/partners/acquisition'}}}>Prüfdaten zurücksetzen</button>
  </aside>
  <AcquisitionApp initial={initial} services={services} today="2026-10-17"/>
 </AdminShell>
}
createRoot(document.getElementById('root')).render(<App/>);
`
const plugin={name:'acquisition-fixture',setup(builder){
 builder.onResolve({filter:/^(next\/(link|image|navigation)|\.\/actions|.*\/partners\/acquisition\/actions)$/},args=>{
  const path=args.path==='./actions' && args.importer.endsWith('admin-shell.tsx')?'shell-actions'
   :args.path.endsWith('/partners/acquisition/actions')?'acquisition-actions':args.path
  if(!Object.hasOwn(adapters,path))return
  return {path,namespace:'fixture'}
 })
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:adapters[args.path],loader:'tsx',resolveDir:repo}))
}}
async function bundle(){
 const result=await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},bundle:true,write:false,jsx:'automatic',format:'esm',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[plugin],tsconfig:repo+'/tsconfig.json'})
 const files=['app/admin-shell.tsx','app/admin-language.tsx','components/pending-submit-button.tsx','components/acquisition/acquisition-app.tsx','components/acquisition/acquisition-editor.tsx']
 const sources=await Promise.all(files.map(file=>readFile(repo+'/'+file,'utf8')))
 sources.push(entry)
 const css=await compile(await readFile(repo+'/app/globals.css','utf8'),{base:repo+'/app',onDependency(){}})
 const candidates=new Scanner({sources:[]}).scanFiles(sources.map(content=>({content,extension:'tsx'})))
 return {js:result.outputFiles[0].contents,css:css.build(candidates)}
}
const assets=await bundle()
if(process.argv.includes('--check')){
 console.log('Acquisition fixture compiled in memory: JS '+assets.js.byteLength+' bytes, CSS '+assets.css.length+' characters; no server or files created.')
}else{
 const server=createServer(async(request,response)=>{
  try{
   const path=new URL(request.url,'http://127.0.0.1').pathname
   response.setHeader('Cache-Control','no-store')
   if(path==='/app.js'){response.setHeader('Content-Type','application/javascript');response.end(assets.js);return}
   if(path==='/style.css'){response.setHeader('Content-Type','text/css');response.end(assets.css);return}
   if(['/benefitsi-logo-on-dark.svg','/benefitsi-logo-on-light.svg','/Benefitsi_Icon_FullColor_RGB_512.png'].includes(path)){
    response.setHeader('Content-Type',path.endsWith('.svg')?'image/svg+xml':'image/png');response.end(await readFile(repo+'/public'+path));return
   }
   response.setHeader('Content-Type','text/html; charset=utf-8')
   response.end('<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Akquise · Synthetische Prüfung</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
  }catch(error){response.statusCode=500;response.end(String(error))}
 })
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3196,'127.0.0.1',resolve)})
  console.log('Acquisition fixture: http://127.0.0.1:3196/partners/acquisition')
  console.log('Desktop and 390px: filters, Testhotel, actual contacts, save/reload, errors/conflicts/lost reply. ?reset=1 resets synthetic storage; ?reset=1&empty=1 checks explicit setup. Stop with Ctrl+C or stdin.')
  await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);process.stdin.once('data',resolve)})
 }finally{
  process.stdin.pause();process.stdin.unref?.()
  if(server.listening){server.closeIdleConnections();await new Promise(resolve=>server.close(resolve))}
 }
}
