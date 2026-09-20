/** Local production Next cache + actual Admin action + actual Web loader.
 * Usage: node --import /absolute/admin/node_modules/tsx/dist/loader.mjs this-file WEB_ROOT ADMIN_ROOT
 * Uses synthetic in-memory DB rows behind a loopback PostgREST-shaped service.
 * No hosted API, user, payment, or email is accessed. This does not test DB RLS.
 */
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { tmpdir } from "node:os"
import path from "node:path"

const [web, admin] = process.argv.slice(2)
assert.ok(web && admin, "Pass explicit Web and Admin checkout roots")
const req = createRequire(path.join(admin, "package.json"))
const ts = req("typescript")
const nextVersion = JSON.parse(await readFile(path.join(web, "node_modules/next/package.json"), "utf8")).version
const publicContract = req(path.join(admin, "lib/public-microsite-contract.ts"))
assert.equal(await readFile(path.join(admin,"lib/public-microsite-contract.ts"),"utf8"), await readFile(path.join(web,"src/lib/public-microsite-contract.ts"),"utf8"), "Producer and consumer use the exact same contract revision")
const { resolveMicrositeConfig } = req(path.join(admin, "lib/microsites.ts"))
const { randomUUID } = req("node:crypto")
const sourceFiles = [
  ...["app/microsite-actions.ts", "lib/microsites.ts", "lib/public-web-revalidation.ts", "lib/public-microsite-contract.ts", "scripts/verify-publication-roundtrip.mjs"].map(file => path.join(admin, file)),
  ...["src/lib/partners/supabase-partners.ts", "src/lib/supabase/server.ts", "src/lib/public-microsite-contract.ts", "src/app/partner/[slug]/page.tsx", "src/components/partner/PartnerMicrositePage.tsx", "src/components/partner/PublishedPartnerMicrosite.tsx", "src/app/api/revalidate/route.ts", "src/lib/cities/public-cache-keys.ts", "src/lib/cities/public-revalidation.ts", "src/app/globals.css", "src/app/benefitsi-site.css", "src/app/benefitsi-home-v3.css", "src/app/benefitsi-home-simple.css", "src/app/fonts/Satoshi-Variable.woff2", "src/app/fonts/Satoshi-VariableItalic.woff2", "postcss.config.mjs"].map(file => path.join(web, file)),
]
const fingerprint = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])))
const sourceHashes = await fingerprint()
const temp = await mkdtemp(path.join(tmpdir(), "ben47-roundtrip-"))
const secret = "synthetic-loopback-revalidation-secret-only"
const city = { id: "10000000-0000-4000-8000-000000000001", name: "Synthetic City", slug: "synthetic-city" }
const partner = { id: "10000000-0000-4000-8000-000000000002", is_active: true, name: "Synthetic Partner", slug: "synthetic-partner", status: "active", category: [], cities: { name: "Synthetic City", slug: "synthetic-city" } }
const microsite = { id: "10000000-0000-4000-8000-000000000003", partner_id: partner.id, slug: partner.slug, status: "published", published_version_id: "10000000-0000-4000-8000-000000000004" }
const versions = new Map([[microsite.published_version_id, { id: microsite.published_version_id, microsite_id: microsite.id, status: "published", config: { headline: "Legacy published A" }, version_number: 1 }]])
const reads = []
const service = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost")
  reads.push(url.pathname + url.search)
  const table = url.pathname.split("/").at(-1)
  if (table === "get_public_microsite_config_v1") {
    let body = ""; for await (const chunk of request) body += chunk
    const input = JSON.parse(body)
    const version = versions.get(input.p_version_id)
    const valid = partner.status === "active" && partner.is_active && input.p_partner_id === partner.id && input.p_microsite_id === microsite.id && microsite.partner_id === partner.id && microsite.status === "published" && microsite.published_version_id === input.p_version_id && version?.microsite_id === microsite.id && version.status === "published"
    // Synthetic transport boundary only. Native Postgres tests qualify the SQL projection separately.
    const snapshot = valid ? publicContract.readPublicMicrositeSnapshot(version.config) : null
    const config = valid ? (snapshot ? { publicSnapshot: snapshot } : { headline: version.config.headline }) : null
    reads.push(`public-config:${input.p_version_id}`)
    response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(config)); return
  }
  if (table === "microsite_versions") {
    response.writeHead(403, { "content-type": "application/json" }); response.end(JSON.stringify({ message: "Raw editor config is not public" })); return
  }
  let rows = table === "partners" ? [partner] : table === "microsites" ? [microsite] : table === "cities" ? [city] : []
  for (const [key, value] of url.searchParams) if (value.startsWith("eq.")) rows = rows.filter(r => String(r[key]) === value.slice(3))
  response.writeHead(200, { "content-type": "application/json" })
  response.end(JSON.stringify(rows))
})
service.listen(0, "127.0.0.1"); await once(service, "listening")
const api = `http://127.0.0.1:${service.address().port}`
const portProbe = createServer(); portProbe.listen(0, "127.0.0.1"); await once(portProbe, "listening")
const nextPort = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve))
const origin = `http://127.0.0.1:${nextPort}`
let running
const run = async (args, env) => {
  const child = spawn(process.execPath, [path.join(web, "node_modules/next/dist/bin/next"), ...args], { cwd: temp, env })
  let output = ""; child.stdout.on("data", c => output += c); child.stderr.on("data", c => output += c)
  const [code] = await once(child, "exit")
  await writeFile(path.join(temp, "build.log"), output)
  if (process.env.BENEFITSI_CACHE_REPORT_PATH) await writeFile(process.env.BENEFITSI_CACHE_REPORT_PATH + ".build.log", output)
  assert.equal(code, 0, output.slice(-5000))
}
const compile = async (file, boundaries) => {
  const loadedModule = { exports: {} }
  const code = ts.transpileModule(await readFile(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", code)(id => {
    assert.ok(Object.hasOwn(boundaries, id), `Unexpected ${id}`); return boundaries[id]
  }, loadedModule, loadedModule.exports)
  return loadedModule.exports
}
try {
  await mkdir(path.join(temp, "app/partner/[slug]"), { recursive: true })
  await mkdir(path.join(temp, "app/api/revalidate"), { recursive: true })
  await mkdir(path.join(temp, "app/health"), { recursive: true })
  await mkdir(path.join(temp, "app/render/[slug]"), { recursive: true })
  const css = (await readFile(path.join(web, "src/app/globals.css"), "utf8")).replace('@import "tailwindcss";', '@import "tailwindcss";\n@source ' + JSON.stringify(path.join(web, "src")) + ';')
  const fixtureFonts = '@font-face{font-family:FixtureSatoshi;src:url(/fixture-satoshi.woff2) format("woff2");font-weight:300 900;font-style:normal;font-display:swap}@font-face{font-family:FixtureSatoshi;src:url(/fixture-satoshi-italic.woff2) format("woff2");font-weight:300 900;font-style:italic;font-display:swap}:root{--font-satoshi:"FixtureSatoshi";}'
  await writeFile(path.join(temp, "app/globals.css"), css + "\n" + fixtureFonts)
  for (const file of ["benefitsi-site.css", "benefitsi-home-v3.css", "benefitsi-home-simple.css"]) {
    await writeFile(path.join(temp, "app", file), await readFile(path.join(web, "src/app", file)))
  }
  await writeFile(path.join(temp, "postcss.config.mjs"), await readFile(path.join(web, "postcss.config.mjs")))
  await mkdir(path.join(temp, "public"))
  await writeFile(path.join(temp, "public/fixture-satoshi.woff2"), await readFile(path.join(web, "src/app/fonts/Satoshi-Variable.woff2")))
  await writeFile(path.join(temp, "public/fixture-satoshi-italic.woff2"), await readFile(path.join(web, "src/app/fonts/Satoshi-VariableItalic.woff2")))
  await writeFile(path.join(temp, "public/synthetic-microsite-hero.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="#092b3d"/><circle cx="480" cy="320" r="210" fill="#18d6d3"/><text x="480" y="335" text-anchor="middle" fill="#092b3d" font-family="sans-serif" font-size="42">SYNTHETIC TEST IMAGE</text></svg>')
  await writeFile(path.join(temp, "app/layout.tsx"), 'import "./globals.css"; export default function Layout({children}:{children:React.ReactNode}) { return <html lang="de" className="h-full antialiased"><body className="min-h-full flex flex-col">{children}</body></html> }')
  await writeFile(path.join(temp, "app/render/[slug]/page.tsx"), `export const dynamic="force-dynamic"; export { default, generateMetadata } from ${JSON.stringify(path.join(web, "src/app/partner/[slug]/page"))};`)
  await symlink(path.join(web, "node_modules"), path.join(temp, "node_modules"), "dir")
  await writeFile(path.join(temp, "package.json"), JSON.stringify({ private: true, dependencies: { next: nextVersion, react: req(path.join(web,"node_modules/react/package.json")).version, "react-dom": req(path.join(web,"node_modules/react-dom/package.json")).version } }))
  await writeFile(path.join(temp, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["dom", "esnext"], strict: true, noEmit: true, skipLibCheck: true, allowJs: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", paths: { "@/*": [path.join(web, "src/*")] } }, include: ["**/*.ts", ".next/types/**/*.ts"], exclude: ["node_modules"] }))
  await writeFile(path.join(temp, "next.config.mjs"), `export default { experimental: { externalDir: true, cpus: 1 }, poweredByHeader: false, webpack(config) { config.resolve.alias['@']=${JSON.stringify(path.join(web,"src"))}; return config; } };\n`)
  await writeFile(path.join(temp, "app/partner/[slug]/route.ts"), 'import { getPublicPartnerBySlug } from "@/lib/partners/supabase-partners"; export const dynamic="force-dynamic"; export async function GET(_r:Request, c:{params:Promise<{slug:string}>}) { const p=await getPublicPartnerBySlug((await c.params).slug); return Response.json(p,{status:p?200:404}); }')
  await writeFile(path.join(temp, "app/api/revalidate/route.ts"), `export const dynamic="force-dynamic"; export const runtime="nodejs"; export { POST } from ${JSON.stringify(path.join(web, "src/app/api/revalidate/route"))};`)
  await writeFile(path.join(temp, "app/health/route.ts"), 'export function GET(){return Response.json({ok:true})}')
  const env = { ...Object.fromEntries(["PATH", "HOME", "TMPDIR", "SystemRoot"].filter(key => process.env[key]).map(key => [key, process.env[key]])), NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-public-key", BENEFITSI_WEB_REVALIDATION_SECRET: secret }
  console.log("Building isolated Next production cache fixture")
  await run(["build", "--webpack"], env)
  running = spawn(process.execPath, [path.join(web, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(nextPort)], { cwd: temp, env })
  let logs = ""; running.stdout.on("data", c => logs += c); running.stderr.on("data", c => logs += c)
  for (let i = 0; i < 60; i++) {
    if (await fetch(origin + "/health").then(r => r.ok).catch(() => false)) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const db = { from(table) {
    let payload, operation, filters = []
    const q = { select() { return this }, eq(k,v) { filters.push([k,v]); return this }, order() { return this }, limit() { return this }, maybeSingle() { return this }, single() { return this } }
    q.insert = value => { operation="insert"; payload=value; return q }; q.update = value => { operation="update"; payload=value; return q }
    q.then = (resolve, reject) => {
      let data = table === "partners" ? partner : table === "microsites" ? microsite : [...versions.values()].at(-1)
      if (operation === "insert" && table === "microsite_versions") { versions.set(payload.id, payload); data = payload }
      if (operation === "update" && table === "microsites") Object.assign(microsite, payload)
      return Promise.resolve({ data: data ? { ...data } : null, error: null }).then(resolve, reject)
    }
    return q
  } }
  process.env.NODE_ENV = "test"
  process.env.BENEFITSI_WEB_REVALIDATION_URL = origin + "/api/revalidate"
  process.env.BENEFITSI_WEB_REVALIDATION_SECRET = secret
  const delivery = await compile(path.join(admin,"lib/public-web-revalidation.ts"), { "server-only": {} })
  const actions = await compile(path.join(admin,"app/microsite-actions.ts"), {
    "node:crypto": { randomUUID }, "next/cache": { revalidatePath() {} }, sharp: {},
    "@/lib/microsites": { resolveMicrositeConfig },
    "@/lib/public-microsite-contract": publicContract,
    "@/lib/admin-data": { getDashboardData: async () => ({ partners: [partner], errors: [] }) },
    "@/lib/microsite-readiness": { createMicrositeReadinessReport: () => ({ items: [] }) },
    "@/lib/partner-portal": { canEditPartnerMicrosite: () => true, getPartnerPortalSession: async () => ({ isAdmin: true }) },
    "@/lib/supabase/server": { createClient: async () => db }, "@/lib/public-web-revalidation": delivery,
  })
  const edited = resolveMicrositeConfig({ template: "restaurant-premium" }, partner)
  edited.hero.slogan = "Real producer slogan BEN61"
  edited.hero.backgroundImageUrl = "/synthetic-microsite-hero.svg"
  edited.content.aboutText = "Real producer about BEN61"
  edited.content.footerText = "Real producer footer BEN61"
  edited.seo.title = "Real producer SEO BEN61"
  edited.elementText = {
    "social.instagram.url": "https://instagram.com/ben61-live-contract",
    "social.instagram.label": "Visible social BEN61", "social.instagram.enabled": "true",
    "social.facebook.url": "https://facebook.com/ben61-hidden", "social.facebook.enabled": "false",
    "content.socialFeed.enabled": "false",
  }
  const save = async intent => {
    const form = new FormData(); form.set("partner_id", partner.id); form.set("intent", intent); form.set("hero_headline", "Modern published B")
    form.set("existing_config", JSON.stringify(edited))
    const result = await actions.saveMicrositeVersion({ ok:false,message:"" }, form)
    assert.equal(result.ok, true, result.message); return result
  }
  const read = async () => { const r = await fetch(origin + "/partner/" + partner.slug); return { status: r.status, value: await r.json() } }
  assert.equal((await read()).value.hero.headline, "Legacy published A")
  const warmReads = reads.length; await read(); assert.equal(reads.length, warmReads, "second read must use Next data cache")
  await save("draft"); assert.equal((await read()).value.hero.headline, "Legacy published A"); assert.equal(reads.length, warmReads)
  await save("publish"); const fresh = await read(); assert.equal(fresh.status, 200)
  assert.ok(reads.length > warmReads, "publication must re-run the actual Web loader")
  assert.ok(reads.some(url => url === `public-config:${microsite.published_version_id}`), "published version pointer was read")
  assert.equal(fresh.value.hero.headline, "Modern published B")
  assert.equal(fresh.value.publicMicrosite.version, 1)
  const htmlResponse = await fetch(origin + "/render/" + partner.slug)
  assert.equal(htmlResponse.status, 200)
  const html = await htmlResponse.text()
  for (const expected of ["Modern published B", "Real producer slogan BEN61", "Real producer about BEN61", "Real producer footer BEN61", "Real producer SEO BEN61", "/synthetic-microsite-hero.svg", "https://instagram.com/ben61-live-contract", "Pilot-Status ansehen"]) assert.ok(html.includes(expected), `Actual Next HTML must contain ${expected}`)
  assert.ok(!html.includes("https://facebook.com/ben61-hidden"), "Hidden social link must stay out of actual HTML")
  assert.ok(!reads.some(url => url.startsWith("/rest/v1/microsite_versions")), "Public consumer must never request raw editor config")
  assert.ok(!html.includes("Knobi"), "Modern rendering cannot contain hardcoded reference-partner copy")
  if (process.env.BENEFITSI_VISUAL_READY_PATH && process.env.BENEFITSI_VISUAL_ACK_PATH) {
    await writeFile(process.env.BENEFITSI_VISUAL_READY_PATH, JSON.stringify({ url: origin + "/render/" + partner.slug, nextVersion, synthetic: true, css: "Actual Web globals, font bytes and Tailwind source scan; isolated root layout", report: process.env.BENEFITSI_CACHE_REPORT_PATH }, null, 2) + "\n")
    console.log("VISUAL_READY " + origin + "/render/" + partner.slug)
    const deadline = Date.now() + 20 * 60 * 1000
    let acknowledged = false
    while (Date.now() < deadline) {
      if (await readFile(process.env.BENEFITSI_VISUAL_ACK_PATH, "utf8").then(value => value.trim() === "complete").catch(() => false)) { acknowledged = true; break }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    assert.ok(acknowledged, "Visual check must acknowledge before the bounded timeout")
  }
  await save("withdraw"); assert.equal((await read()).status, 404); assert.equal((await fetch(origin + "/render/" + partner.slug)).status, 404)
  const withdrawnReads = reads.length; await read(); assert.equal(reads.length, withdrawnReads)
  await save("revalidate"); assert.equal((await read()).status, 404); assert.ok(reads.length > withdrawnReads)
  await save("draft"); assert.equal(microsite.status,"archived"); assert.equal((await read()).status,404)
  assert.deepEqual(await fingerprint(), sourceHashes, "The coupled source files must remain unchanged during verification")
  const result = { sourceHashes, nodeVersion: process.version, typescriptVersion: ts.version, cacheRoundtripPassed: true, nextVersion, fixture: "Loopback synthetic PostgREST/RPC + real Admin action/delivery + real Web loader/renderer/Next cache; SQL RLS and public projection qualified separately", checks: ["warm cache hit", "draft leaves public state", "publish invalidates and reads new pointer", "v1 Admin snapshot renders actual Next HTML text/media/links/visibility/SEO", "withdrawal returns404", "idempotent cache retry", "draft cannot restore withdrawn page"], BEN61PublicConfigurationContractPassed: true }
  await writeFile(process.env.BENEFITSI_CACHE_REPORT_PATH || path.join(tmpdir(), "benefitsi-partner-cache-result.json"), JSON.stringify(result,null,2)+"\n")
  console.log(JSON.stringify(result))
} finally {
  if (running && running.exitCode === null && running.signalCode === null) { running.kill("SIGTERM"); await once(running,"exit").catch(()=>{}) }
  await new Promise(resolve => service.close(resolve))
  await rm(temp,{recursive:true,force:true})
}
