import {createServer} from 'node:http'
import {readFile,readdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

// Real UI and CSS with synthetic in-memory transport, isolated from auth and production.
const repo=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'')
const require=createRequire(repo+'/package.json')
const {build}=createRequire(require.resolve('tsx'))('esbuild')
const tw=createRequire(require.resolve('@tailwindcss/postcss'))
const {compile}=tw('@tailwindcss/node'),{Scanner}=tw('@tailwindcss/oxide')
const adapters={
  'next/link':`import React from 'react';export default function Link({href,children,prefetch,...props}){return <a href={href} {...props}>{children}</a>}`,
  'next/image':`import React from 'react';export default function Image({priority,...props}){return <img {...props}/>}`,
  'next/navigation':`export function usePathname(){return '/workspace'}`,
  './actions':`export async function signOut(){}`,
  '@/app/workspace/actions':`export const loadWorkspaceIndex=()=>{},loadWorkspacePages=()=>{},loadWorkspacePage=()=>{},saveWorkspacePage=()=>{},saveWorkspace=()=>{},setWorkspaceFavorite=()=>{},loadWorkspaceVersions=()=>{},restoreWorkspacePage=()=>{},findWorkspacePartners=()=>{},loadWorkspacePartnerBrief=()=>{};`,
}
const entry=`
import React from 'react';import {createRoot} from 'react-dom/client';
import {AdminShell} from '${repo}/app/admin-shell.tsx';
import {WorkspaceApp} from '${repo}/components/workspace/workspace-app.tsx';
import {workspaceFixture,fixturePartner} from '${repo}/tests/helpers/workspace-fixture.mjs';
import {makePage} from '${repo}/lib/workspace/model.ts';
import {onboardingContent} from '${repo}/lib/workspace/templates.ts';
const workspace={id:'00000000-0000-4000-8000-000000000001',title:'Partner & Ideen',description:'Gut vorbereitet ins Gespräch. Alles Wichtige an einem Ort.',revision:1,archived:false,created_at:'2026-10-05T12:00:00Z',updated_at:'2026-10-05T12:00:00Z'};
const partner={...makePage(workspace.id,'partner'),title:fixturePartner.name,partner_id:fixturePartner.id,revision:1};
const meeting={...makePage(workspace.id,'conversation',partner),title:'Onboarding · Café Beispiel',content:onboardingContent(),revision:1};
const fixture=workspaceFixture({workspaces:[workspace],pages:[partner,meeting]});
const initial={ok:true,value:{workspaces:[workspace],favorites:[]}};
const params=new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(<React.StrictMode><AdminShell adminName="Workspace · Prüfdaten" title="Workspace" subtitle="Notizen, Ideen und Partnergespräche"><WorkspaceApp initial={initial} initialPageId={params.has('meeting')?meeting.id:undefined} services={fixture.services}/></AdminShell></React.StrictMode>);
`
const plugin={name:'workspace-fixture-boundaries',setup(builder){
  builder.onResolve({filter:/^(next\/(link|image|navigation)|\.\/actions|@\/app\/workspace\/actions)$/},args=>{
    if(args.path==='./actions'&&!args.importer.endsWith('admin-shell.tsx'))return
    return {path:args.path,namespace:'fixture'}
  })
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:adapters[args.path],loader:'tsx',resolveDir:repo}))
}}
const sourcePaths=['app/admin-shell.tsx','app/admin-language.tsx','components/pending-submit-button.tsx',...(await readdir(repo+'/components/workspace')).filter(f=>/\.tsx?$/.test(f)).map(f=>'components/workspace/'+f)]
const sources=await Promise.all(sourcePaths.map(f=>readFile(repo+'/'+f,'utf8')))
const css=await compile(await readFile(repo+'/app/globals.css','utf8'),{base:repo+'/app',onDependency(){}})
const style=css.build(new Scanner({sources:[]}).scanFiles(sources.map(content=>({content,extension:'tsx'}))))
const script=await build({stdin:{contents:entry,loader:'tsx',resolveDir:repo},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[plugin],tsconfig:repo+'/tsconfig.json'})
const server=createServer(async(request,response)=>{
  try{
    const pathname=new URL(request.url,'http://localhost').pathname
    if(pathname==='/style.css'){response.setHeader('Content-Type','text/css');response.end(style);return}
    if(pathname==='/app.js'){response.setHeader('Content-Type','application/javascript');response.end(script.outputFiles[0].contents);return}
    if(/^\/[a-zA-Z0-9_-]+\.(svg|png)$/.test(pathname)){response.setHeader('Content-Type',pathname.endsWith('.svg')?'image/svg+xml':'image/png');response.end(await readFile(repo+'/public'+pathname));return}
    response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workspace – lokale Prüfdaten</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>')
  }catch{response.statusCode=404;response.end('Not found')}
})
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3195,'127.0.0.1',resolve)})
  console.log('Workspace fixture: http://127.0.0.1:3195/workspace?meeting=1 (synthetic data; no remote writes)')
  await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);process.stdin.once('data',resolve)})
}finally{process.stdin.pause();process.stdin.unref?.();if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
