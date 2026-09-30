import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React, { act } from "react"
import * as jsx from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"
import ts from "typescript"

const require = createRequire(import.meta.url)
const noop = async () => ({ ok: false, message: "Test boundary" })
function compile(path, boundaries, testExports = "") {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8") + testExports, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: path,
  }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)(id => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id]
    if (id.startsWith("@/lib/")) return require(`../lib/${id.slice(6)}`)
    throw new Error(`Unmocked boundary ${id}`)
  }, loaded, loaded.exports)
  return loaded.exports
}
function runtime(action = noop, refresh = () => {}) {
  const actions = new Proxy({}, { get: () => action })
  return {
    react: React, "react/jsx-runtime": jsx, "react-dom": require("react-dom"),
    "next/navigation": { useRouter: () => ({ refresh, replace() {}, push() {} }) },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { default: () => null },
    "lucide-react": require("lucide-react"),
    "@/app/partner-actions": actions, "./partner-actions": actions,
    "./partner-enrichment-actions": { researchPartner: noop },
    "./microsite-panel": { MicrositePanel: () => null },
    "@/components/microsite-read-only-notice": { MicrositeReadOnlyNotice: () => null },
    "./admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/app/admin-language": { useAdminLanguage: () => ({ language: "de" }) },
    "@/lib/supabase/client": { createClient: () => { throw new Error("Unexpected browser DB access") } },
    "@/components/loading-ui": { LoadingSpinner: () => null },
  }
}

test("the real shared workspace gates both import entry points for partner owners", () => {
  const boundaries = runtime()
  boundaries["@/components/menu-ai-import-dialog"] = compile("../components/menu-ai-import-dialog.tsx", boundaries)
  boundaries["@/components/partner/partner-plan-panel"] = {PartnerPlanPanel:()=>null}
  const { PartnerWorkspace } = compile("../app/partner-admin.tsx", boundaries)
  for (const hasMenu of [false, true]) {
    for (const [adminAccess, enabled, expected] of [[true, false, false], [false, false, false], [false, null, false], [false, true, true]]) {
      const partner = {
        id: "partner-a", name: "Test Restaurant", type: "Food & Drink", category: [],
        deals: [], holidays: [], socials: [], reward_milestones: [], staff: [], opening_hours: [],
        stamp_progress: [], visits: [], fraud_events: [], microsite: null,
        menu_ai_import_enabled: enabled,
        menus: hasMenu ? [{ id: "menu-a", partner_id: "partner-a", name: "Karte", categories: [], items: [] }] : [],
      }
      const html = renderToStaticMarkup(React.createElement(PartnerWorkspace, {
        partners: [partner], cities: [], owners: [], initialPartnerId: partner.id,
        initialSettingsTab: "menu", portalMode: !adminAccess, adminAccess,
      }))
      assert.equal(html.includes("Karte aus Foto / PDF"), expected, JSON.stringify({ adminAccess, enabled, hasMenu }))
      assert.equal(html.includes('role="switch"'), false)
    }
  }
})

test("scoped partner team form adds existing accounts by email without a user directory",()=>{
 const boundaries=runtime();boundaries['@/components/menu-ai-import-dialog']={MenuAiImportDialog:()=>null};boundaries['@/components/partner/partner-plan-panel']={PartnerPlanPanel:()=>null}
 const {PartnerWorkspace}=compile('../app/partner-admin.tsx',boundaries)
 const partner={id:'partner-a',name:'Test shop',type:'Food & Drink',category:[],deals:[],holidays:[],socials:[],reward_milestones:[],staff:[],opening_hours:[],menus:[],stamp_progress:[],visits:[],fraud_events:[],microsite:null,team_manage_enabled:true}
 const html=renderToStaticMarkup(React.createElement(PartnerWorkspace,{partners:[partner],cities:[],owners:[],initialPartnerId:partner.id,initialSettingsTab:'access',portalMode:true,adminAccess:false}))
 assert.match(html,/type="email"/)
 assert.match(html,/name="email"/)
 assert.doesNotMatch(html,/User ID/)
 partner.staff=[{id:'staff-row',partner_id:'partner-a',user_id:'member',role:'scanner',active:true}]
 const existingHtml=renderToStaticMarkup(React.createElement(PartnerWorkspace,{partners:[partner],cities:[],owners:[],initialPartnerId:partner.id,initialSettingsTab:'access',portalMode:true,adminAccess:false}))
 const removal=[...existingHtml.matchAll(/<form[^>]*>[^]*?<\/form>/g)].map(match=>match[0]).find(form=>form.includes('name="id" value="staff-row"'))
 assert.ok(removal)
 assert.match(removal,/name="partner_id" value="partner-a"/)
})


test("existing deal editor lets Owner select which excess Free offer to deactivate", async () => {
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost'})
 const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT}
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
 const root=require('react-dom/client').createRoot(document.getElementById('root'))
 try {
  const boundaries=runtime();boundaries['@/components/menu-ai-import-dialog']={MenuAiImportDialog:()=>null};boundaries['@/components/partner/partner-plan-panel']={PartnerPlanPanel:()=>null}
  const {DealsPanel}=compile('../app/partner-admin.tsx',boundaries,'\nexport { DealsPanel };')
  const partner={id:'synthetic-free',name:'Synthetic Free over limit',visits:[],deals:['keep','selected','other'].map(id=>({id,partner_id:'synthetic-free',type:'discount',discount_type:'percent',discount_value:10,active:true,premium_only:false}))}
  await act(async()=>root.render(React.createElement(DealsPanel,{partner,embedded:true})))
  const cards=document.querySelectorAll('[role="button"]');assert.equal(cards.length,3)
  await act(async()=>cards[1].dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
  const checkbox=document.querySelector('[role="dialog"] input[name="active"]');assert.ok(checkbox);assert.equal(checkbox.checked,true)
  await act(async()=>checkbox.click())
  const form=checkbox.closest('form'),payload=new dom.window.FormData(form)
  assert.equal(payload.get('id'),'selected');assert.equal(payload.get('partner_id'),'synthetic-free');assert.equal(payload.has('active'),false)
  assert.equal(partner.deals.length,3);assert.equal(partner.deals[0].active,true);assert.equal(partner.deals[2].active,true)
  // This verifies actual selection/form serialization; authenticated DB behavior is the PG release test.
 } finally {await act(async()=>root.unmount());Object.assign(globalThis,previous);dom.window.close()}
})
