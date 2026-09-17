import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import { createElement } from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import * as reviewUi from "../components/city-operations/review-ui.tsx"
import * as contracts from "../lib/city-operations/contracts.ts"

const reviewId = "8db2fd02-96f5-4491-a479-b5de535c6d9d"
const contentId = "b81c030e-a99c-442d-a6bd-8b5ef33c7156"
const actorId = "e74c45e0-ca1b-42db-963f-54242cd2e0dd"
const hash = "a".repeat(64)
const receipt = `annweiler-club-tsv:${hash}`
const updatedAt = "2026-09-17T13:19:19.012981+00:00"
const rawIssue = { kind: "club_source_change", status: "needs_review", message: "Quellenänderung prüfen", receipt_key: receipt, source_sha256: hash }
const record = () => ({
  id: contentId, reviewId, contentType: "clubs", cityId: "b9e684e4-54b3-41ff-8f97-4426423893c2", citySlug: "annweiler",
  stage: "published", contentStatus: "active", verdict: "pass", issues: contracts.normalizeIssues([rawIssue]), updatedAt,
  sourceUrl: "https://www.tsv-annweiler.de/", sourceVerified: true, sourceStatus: "verified", sourceCheckedAt: new Date().toISOString(),
  endTimeVerified: false, endsAt: null, expiresAt: null,
})
function form(overrides = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ reviewId, contentId, contentType: "clubs", receiptKey: receipt, sourceSha256: hash, expectedUpdatedAt: updatedAt, note: "Quelle geprüft; Profil unverändert korrekt.", actorId: "spoofed", ...overrides })) data.set(key, value)
  return data
}

// Run real Server Action code; replace only session, database, cache and redirect boundaries.
async function actions(options = {}) {
  const calls = []
  const loadedModule = { exports: {} }
  const imports = {
    "next/cache": { revalidatePath: path => calls.push(["local", path]) },
    "next/navigation": { redirect: path => { throw Object.assign(new Error("redirect"), { path }) } },
    "@/lib/admin": { requireAdmin: async () => { calls.push(["auth"]); if (options.denied) throw new Error("denied"); return { adminSession: { user: { id: actorId }, profile: { display_name: "Existing Admin" } } } } },
    "@/lib/city-operations/contracts": contracts,
    "@/lib/city-operations/data": { loadCityReviewDetail: async () => ({ record: options.record ?? record() }) },
    "@/lib/supabase/admin": { createAdminClient: () => { calls.push(["client"]); return { rpc: async (name, args) => { calls.push(["rpc", name, args]); return { data: { ok: true, status: "resolved" }, error: options.rpcError ?? null } } } } },
    "@/lib/city-pages/public-revalidation": { refreshPublicCity: async (...args) => { calls.push(["public", ...args]); return options.refresh ?? "ok" } },
  }
  const source = await readFile(new URL("../app/city-operations/actions.ts", import.meta.url), "utf8")
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(js, { module: loadedModule, exports: loadedModule.exports, require: name => { assert.ok(imports[name], `unmocked boundary ${name}`); return imports[name] }, FormData, URL, Date })
  return { ...loadedModule.exports, calls }
}

test("normalization preserves the exact source receipt and exposes only actionable pending source issues", () => {
  const issues = contracts.normalizeIssues([rawIssue, { ...rawIssue, status: "resolved" }, { ...rawIssue, kind: "club_profile_proposal" }, { ...rawIssue, source_sha256: "broken" }])
  assert.equal(issues[0].receiptKey, receipt)
  assert.equal(issues[0].sourceSha256, hash)
  assert.equal(typeof contracts.pendingClubSourceReviews, "function")
  assert.deepEqual(contracts.pendingClubSourceReviews({ ...record(), issues }), [issues[0]])
  assert.deepEqual(contracts.pendingClubSourceReviews({ ...record(), issues, contentType: "events" }), [])
})

test("published active content is distinguished from a blocked draft without enabling republishing", () => {
  assert.equal(typeof contracts.isPublishedCityReview, "function")
  assert.equal(contracts.isPublishedCityReview(record()), true)
  assert.equal(contracts.isPublishedCityReview({ ...record(), stage: "ready_for_human", contentStatus: "draft" }), false)
  assert.equal(contracts.canPublishReview(record()), false)
})

test("source acknowledgment uses the authenticated actor, exact receipt/version and one RPC, without publication", async () => {
  const a = await actions()
  assert.equal(typeof a.resolveCityClubSourceReview, "function")
  await assert.rejects(a.resolveCityClubSourceReview(form()), error => error.path?.endsWith("success=source_review_resolved"))
  assert.deepEqual(a.calls.map(x => x[0]), ["auth", "client", "rpc", "local", "local"])
  const [, name, args] = a.calls.find(x => x[0] === "rpc")
  assert.equal(name, "resolve_city_club_source_review")
  assert.equal(args.p_actor_id, actorId)
  assert.equal(args.p_review_id, reviewId)
  assert.equal(args.p_receipt_key, receipt)
  assert.equal(args.p_source_sha256, hash)
  assert.equal(args.p_expected_updated_at, updatedAt)
  assert.equal(args.p_note, "Quelle geprüft; Profil unverändert korrekt.")
})

test("unauthenticated source acknowledgment does not construct a privileged client", async () => {
  const a = await actions({ denied: true })
  assert.equal(typeof a.resolveCityClubSourceReview, "function")
  await assert.rejects(a.resolveCityClubSourceReview(form()), /denied/)
  assert.deepEqual(a.calls, [["auth"]])
})

test("empty note, changed record binding, wrong receipt/hash and stale view never send RPC", async () => {
  for (const overrides of [{ note: "  " }, { reviewId: "97e71a53-164c-4b19-88bd-f12d2624d713" }, { receiptKey: `other:${hash}` }, { sourceSha256: "b".repeat(64) }, { expectedUpdatedAt: "2026-09-17T13:19:19.012Z" }]) {
    const a = await actions()
    assert.equal(typeof a.resolveCityClubSourceReview, "function")
    await assert.rejects(a.resolveCityClubSourceReview(form(overrides)), error => Boolean(error.path?.includes("error=")))
    assert.equal(a.calls.some(x => x[0] === "rpc"), false)
  }
})

test("RPC concurrency failure does not report source resolution success", async () => {
  const a = await actions({ rpcError: { message: "stale_review" } })
  assert.equal(typeof a.resolveCityClubSourceReview, "function")
  await assert.rejects(a.resolveCityClubSourceReview(form()), error => error.path?.includes("error=source_review"))
  assert.equal(a.calls.some(x => x[0] === "public"), false)
})

test("actual publication refreshes the public city using loaded city identity and reports refresh failure separately", async () => {
  const draft = { ...record(), stage: "ready_for_human", contentStatus: "draft" }
  for (const refresh of ["ok", "failed"]) {
    const a = await actions({ record: draft, refresh })
    await assert.rejects(a.publishCityContent(form()), error => refresh === "ok" ? error.path?.endsWith("success=published") : error.path?.includes("success=published&warning=refresh_failed"))
    assert.deepEqual(a.calls.find(x => x[0] === "public"), ["public", "annweiler", draft.cityId])
    assert.ok(a.calls.findIndex(x => x[0] === "public") > a.calls.findIndex(x => x[0] === "rpc"))
  }
})

test("failed publication never calls public invalidation", async () => {
  const a = await actions({ record: { ...record(), stage: "ready_for_human", contentStatus: "draft" }, rpcError: { message: "denied" } })
  await assert.rejects(a.publishCityContent(form()), error => error.path?.endsWith("error=publish"))
  assert.equal(a.calls.some(x => x[0] === "public"), false)
})

async function renderDetail(value, feedback = {}) {
  const loadedModule = { exports: {} }
  const imports = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
    "next/navigation": { notFound: () => { throw new Error("not found") } },
    "@/app/admin-shell": { AdminShell: ({ children }) => createElement("main", null, children) },
    "@/app/city-operations/actions": { publishCityContent: async () => {}, rejectCityReview: async () => {}, requestCityReviewCorrection: async () => {}, resolveCityClubSourceReview: async () => {} },
    "@/components/city-operations/review-ui": reviewUi,
    "@/components/pending-submit-button": { PendingSubmitButton: ({ children }) => createElement("button", null, children) },
    "@/lib/admin": { requireAdmin: async () => ({ adminSession: { user: { id: actorId } } }) },
    "@/lib/city-operations/contracts": contracts,
    "@/lib/city-operations/data": { loadCityReviewDetail: async () => ({ record: value, warnings: [], audit: [] }) },
  }
  const source = await readFile(new URL("../app/city-operations/[contentType]/[contentId]/page.tsx", import.meta.url), "utf8")
  const js = ts.transpileModule(source, { fileName: "page.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(js, { module: loadedModule, exports: loadedModule.exports, require: name => { assert.ok(imports[name], `unmocked boundary ${name}`); return imports[name] }, Date, Intl })
  return renderToStaticMarkup(await loadedModule.exports.default({ params: Promise.resolve({ contentType: "clubs", contentId }), searchParams: Promise.resolve(feedback) }))
}

test("published detail offers exact source acknowledgment and does not call the profile blocked or offer republishing", async () => {
  const html = await renderDetail(record())
  assert.match(html, /Bereits veröffentlicht/)
  assert.doesNotMatch(html, /Veröffentlichung blockiert|Geprüft veröffentlichen/)
  assert.match(html, /Quellenänderung geprüft/)
  assert.match(html, new RegExp(`name="receiptKey" value="${receipt}"`))
  assert.match(html, /name="expectedUpdatedAt" value="2026-09-17T13:19:19.012981\+00:00"/)
})

test("draft source acknowledgment remains separate from publication and resolved receipts lose their action", async () => {
  const draft = await renderDetail({ ...record(), stage: "ready_for_human", contentStatus: "draft" })
  assert.match(draft, /Quellenänderung geprüft/)
  assert.match(draft, /Geprüft veröffentlichen/)
  const resolved = await renderDetail({ ...record(), issues: contracts.normalizeIssues([{ ...rawIssue, status: "resolved" }]) })
  assert.match(resolved, /Bereits veröffentlicht/)
  assert.doesNotMatch(resolved, /name="receiptKey"/)
})

test("publication cache warning is visible without claiming publication failed", async () => {
  const html = await renderDetail(record(), { success: "published", warning: "refresh_failed" })
  assert.match(html, /Veröffentlichung ist gespeichert/)
  assert.match(html, /öffentliche Ansicht/)
  assert.doesNotMatch(html, /Veröffentlichung blockiert/)
})
