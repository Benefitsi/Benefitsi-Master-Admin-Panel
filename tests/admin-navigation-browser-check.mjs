import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

// The fixture uses the real shell, React and CSS. Only Next routing/image and
// the server-only sign-out action are adapted; no auth or production data is loaded.
const repo = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "")
const require = createRequire(repo+"/package.json")
const {build} = createRequire(require.resolve("tsx"))("esbuild")
const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"))
const {compile} = tailwindRequire("@tailwindcss/node")
const {Scanner} = tailwindRequire("@tailwindcss/oxide")
const adapters = {
  "next/link": `import React from "react"; export default function Link({href,children,prefetch,...props}) { return <a href={href} {...props} onClick={event => { if(href.startsWith("/") && !event.metaKey && !event.ctrlKey) {event.preventDefault(); window.history.pushState({}, "", href); window.dispatchEvent(new Event("fixture-route"));} }}>{children}</a> }`,
  "next/image": `import React from "react"; export default function Image({priority,...props}) {return <img {...props}/>}`,
  "next/navigation": `import {useSyncExternalStore} from "react"; const subscribe=callback => {window.addEventListener("fixture-route",callback); return () => window.removeEventListener("fixture-route",callback)}; export function usePathname(){return useSyncExternalStore(subscribe,() => window.location.pathname,() => "/partners")}`,
  "./actions": `export async function signOut(){}`,
}
const entry = `
import React from "react";
import {createRoot} from "react-dom/client";
import {usePathname} from "next/navigation";
import {AdminShell} from "${repo}/app/admin-shell.tsx";
const params=new URLSearchParams(location.search);
const storageKey="benefitsi-admin-navigation-collapsed";
if(!params.has("expect") && !params.has("manual"))localStorage.removeItem(storageKey);
if(params.has("blocked")){for(const name of ["getItem","setItem"]){const original=Storage.prototype[name];Storage.prototype[name]=function(key,...args){if(key===storageKey)throw new DOMException("Storage blocked","SecurityError");return original.call(this,key,...args)}}}
function App(){const path=usePathname(); return <AdminShell key={path} adminName="Navigation regression" title={path}><p>Real AdminShell, remounted for each route.</p></AdminShell>}
createRoot(document.getElementById("root")).render(<App/>);
const output=document.getElementById("results");
const wait=async predicate => {for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20))}throw new Error("Timed out waiting for navigation state")};
const button=()=>document.querySelector("aside button[aria-expanded]");
const expanded=()=>button()?.getAttribute("aria-expanded")==="true";
const check=async (want,label)=>{await wait(()=>button()); await new Promise(resolve=>setTimeout(resolve,40)); if(expanded()!==want)throw new Error(label+": expected expanded="+want+", got "+expanded());output.append(document.createTextNode("PASS "+label+"\\n"))};
const navigate=async path=>{const link=document.querySelector('nav a[href="'+path+'"]');const list=link.closest("ul");if(list.hidden){document.querySelector('[aria-controls="'+list.id+'"]').click()}link.click(); await wait(()=>document.querySelector("h1")?.textContent===path)};
async function run(){
 await wait(()=>button());
 const saved=new URLSearchParams(location.search).get("expect");
 if(saved){await check(saved==="expanded","restores "+saved+" after full document load"); output.dataset.status="passed"; return}
 await check(false,"initially collapsed");
 if(document.querySelectorAll("nav > ul > li").length!==7)throw new Error("Expected seven main navigation areas");
 output.append(document.createTextNode("PASS seven main navigation areas\\n"));
 button().click(); await check(true,"manual expansion");
 for(const path of ["/city-pages","/media","/partners"]){await navigate(path);await check(true,"expanded on "+path)}
 button().click(); await check(false,"manual collapse");
 for(const path of ["/media","/city-pages","/partners"]){await navigate(path);await check(false,"collapsed on "+path)}
 button().click();await check(true,"manual re-expansion");
 await navigate("/media");await check(true,"re-expanded on /media");
 const targets=[["/","Übersicht"],["/partners","Partner"],["/city-pages/annweiler","Stadtportale"],["/city-operations/events/123","Prüfung & Freigaben"],["/editorial/new","Magazin"],["/media/123","Medien"],["/wissen/123","Wissen"],["/bookings/123","Buchungen"],["/commerce/orders/123","Essensbestellungen"],["/agents/123","Agentenübersicht"],["/automation/jobs/123","Aufträge & Abläufe"],["/analytics/revenue","Geschäftszahlen"],["/seo/audit","SEO & Sichtbarkeit"]];
 for(const [path,label] of targets){window.history.pushState({},"",path);window.dispatchEvent(new Event("fixture-route"));await wait(()=>document.querySelector("h1")?.textContent===path);const current=document.querySelectorAll('nav a[aria-current="page"]');if(current.length!==1 || current[0].textContent!==label || current[0].closest("ul").hidden)throw new Error("Active destination not visible: "+path);await check(true,"active "+label+" on "+path)}
 button().click();await check(false,"collapse after nested-route checks");
 for(const [path,label] of targets){window.history.pushState({},"",path);window.dispatchEvent(new Event("fixture-route"));await wait(()=>document.querySelector("h1")?.textContent===path);const current=document.querySelectorAll('nav a[aria-current="page"]');if(current.length!==1 || current[0].textContent!==label || current[0].closest("ul").hidden)throw new Error("Collapsed active destination not visible: "+path);await check(false,"collapsed active "+label+" on "+path)}
 output.dataset.status="passed";
}
if(!params.has("manual"))run().catch(error=>{output.dataset.status="failed";output.append(document.createTextNode("FAIL "+error.message))});
`
const plugin = { name: "fixture-adapters", setup(builder) {
  builder.onResolve({filter:/^(next\/(link|image|navigation)|\.\/actions)$/}, args => {
    if(args.path==="./actions" && !args.importer.endsWith("admin-shell.tsx")) return
    return {path:args.path,namespace:"fixture"}
  })
  builder.onLoad({filter:/.*/,namespace:"fixture"}, args => ({contents:adapters[args.path],loader:"tsx",resolveDir:repo}))
}}
const server = createServer(async (request,response) => {
  try {
    if(request.url==="/style.css") {
      const sources=await Promise.all(["app/admin-shell.tsx","app/admin-language.tsx","components/pending-submit-button.tsx"].map(file=>readFile(repo+"/"+file,"utf8")))
      const css=await compile(await readFile(repo+"/app/globals.css","utf8"),{base:repo+"/app",onDependency(){}})
      const candidates=new Scanner({sources:[]}).scanFiles(sources.map(content=>({content,extension:"tsx"})))
      response.setHeader("Content-Type","text/css");response.end(css.build(candidates));return
    }
    if(request.url==="/app.js") {
      const result=await build({stdin:{contents:entry,loader:"tsx",resolveDir:repo},bundle:true,write:false,jsx:"automatic",format:"iife",define:{"process.env.NODE_ENV":'"development"',"process.env":'{}'},plugins:[plugin],tsconfig:repo+"/tsconfig.json"})
      response.setHeader("Content-Type","application/javascript");response.end(result.outputFiles[0].contents);return
    }
    if(request.url.endsWith(".svg") || request.url.endsWith(".png")) {
      response.setHeader("Content-Type",request.url.endsWith(".svg") ? "image/svg+xml" : "image/png")
      response.end(await readFile(repo+"/public"+request.url));return
    }
    response.setHeader("Content-Type","text/html")
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><h2>Admin navigation regression</h2><pre id="results" data-status="running"></pre><div id="root"></div><script src="/app.js"></script></body></html>')
  } catch(error){response.statusCode=500;response.end(String(error))}
})
try {
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(3194,"127.0.0.1",resolve)})
  console.log("Navigation fixture: http://127.0.0.1:3194/partners")
  console.log("Add ?blocked=1 to test unavailable storage, ?manual=1 for keyboard/visual checks, or ?expect=expanded / ?expect=collapsed to verify a full document reload. Stop with Ctrl+C.")
  await new Promise(resolve=>{process.once("SIGINT",resolve);process.once("SIGTERM",resolve);process.stdin.once("data",resolve)})
} finally {
  process.stdin.pause()
  process.stdin.unref?.()
  if(server.listening){server.closeIdleConnections();await new Promise(resolve=>server.close(resolve))}
}
