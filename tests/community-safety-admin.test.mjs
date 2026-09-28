import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createElement } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { pendingNativeMeetups, isHistoricalMeetup, meetupApprovalBlockers } from '../lib/city-pages/community-moderation.ts'

const cityId = 'cc576dac-2490-401c-8cc1-418d03795945'
const actorId = 'e74c45e0-ca1b-42db-963f-54242cd2e0dd'
const reportId = '0b8f223e-6502-407f-941c-0d332233af87'
const linkedId = '2730d912-28b8-481f-b7eb-67b426b0f717'
const closedId = '7e305733-47b5-42fb-89a7-ba83423bbf15'
const report = (meetup_id, reason = 'OTHER') => ({ id: `report-${meetup_id}`, meetup_id, reason, details: 'Private fixture detail', status: 'PENDING', created_at: '2026-09-28T10:00:00Z' })
const meetup = (id, overrides = {}) => ({ id, city_id: cityId, canonical_slug: id, title: `Meetup ${id.slice(0, 4)}`, description: 'Synthetic', host_user_id: actorId, start_at: '2026-10-01T10:00:00Z', end_at: '2026-10-01T11:00:00Z', meeting_point_label: 'Square', max_participants: 8, age_range: null, cost_description: null, activity_type: 'WALKING', moderation_status: 'APPROVED', lifecycle_status: 'PUBLISHED', visibility: 'PUBLIC', location_privacy: 'PUBLIC_LOCATION', created_at: '2026-09-28T10:00:00Z', ...overrides })
const submission = { id: '2397650d-6a57-4f23-ab60-7b7da1b6b481', city_id: cityId, public_reference: 'synthetic', kind: 'meetup', title: 'Linked', description: 'Synthetic', contact_name: 'Fixture', contact_email: 'fixture@example.invalid', event_starts_at: '2026-10-01T10:00:00Z', event_ends_at: '2026-10-01T11:00:00Z', event_location: 'Square', host_user_id: actorId, capacity: 8, target_audience: null, cost_description: null, activity_type: 'WALKING', event_timezone: 'Europe/Berlin', published_record_id: linkedId, source_url: null, status: 'approved', review_notes: null, public_status_message: null, created_at: '2026-09-28T10:00:00Z', updated_at: '2026-09-28T10:00:00Z' }

function load(path, imports, options = {}) {
  const source = readFileSync(process.env.COMMUNITY_ADMIN_BASE_SOURCE ? `${process.env.COMMUNITY_ADMIN_BASE_SOURCE}/${path}` : new URL(`../${path}`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const loadedModule = { exports: {} }
  vm.runInNewContext(js, { module: loadedModule, exports: loadedModule.exports, require: name => { assert.ok(name in imports, `unhandled import ${name}`); return imports[name] }, FormData, URL, Date, process: { env: {} }, ...options })
  return loadedModule.exports
}

function fakeClient(fixtures = {}) {
  const calls = []
  const from = table => {
    const query = { table, filters: [], select: null, limit: null }
    calls.push(query)
    const result = () => {
      const source = fixtures[table] ?? []
      const data = source.filter(row => query.filters.every(([op, field, value]) => {
        const found = field === 'city_meetups.city_id'
          ? fixtures.city_meetups?.find(meetup => meetup.id === row.meetup_id)?.city_id
          : row[field]
        return op === 'eq' ? found === value : value.includes(found)
      }))
      const configuredError = fixtures.errors?.[table]
      return { data: query.limit ? data.slice(0, query.limit) : data, error: typeof configuredError === 'function' ? configuredError(query) : configuredError ?? null }
    }
    const builder = {
      select(value) { query.select = value; return builder },
      eq(field, value) { query.filters.push(['eq', field, value]); return builder },
      in(field, value) { query.filters.push(['in', field, value]); return builder },
      order() { return builder },
      limit(value) { query.limit = value; return builder },
      maybeSingle() { const { data, error } = result(); return Promise.resolve({ data: data[0] ?? null, error }) },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
    }
    return builder
  }
  return { from, calls }
}

test('actual loader includes one-report approved and linked meetups once with private report evidence', async () => {
  const client = fakeClient({ cities: [{ id: cityId, name: 'Synthetic', slug: 'synthetic' }], city_community_submissions: [submission], city_community_submission_audit: [], city_meetup_reports: [report(reportId, 'OTHER'), report(linkedId, 'SAFETY'), report(closedId, 'SPAM')], city_meetups: [meetup(reportId), meetup(linkedId), meetup(closedId, { lifecycle_status: 'CANCELLED', end_at: '2026-09-27T11:00:00Z' })], users: [] })
  const { loadCityCommunityInbox } = load('lib/city-pages/community.ts', { 'server-only': {}, './community-moderation': { pendingNativeMeetups, isHistoricalMeetup }, '@/lib/supabase/admin': { createAdminClient: () => client } })
  const inbox = await loadCityCommunityInbox('synthetic')
  assert.deepEqual(Array.from(inbox.nativeMeetups, row => row.id), [reportId, closedId])
  assert.equal(inbox.submissions[0].linkedMeetup.id, linkedId)
  assert.equal(inbox.nativeMeetups[0].reports[0].reason, 'OTHER')
  assert.equal(inbox.submissions[0].linkedMeetup.reports[0].details, 'Private fixture detail')
  assert.equal(inbox.nativeMeetups[1].reports[0].createdAt, '2026-09-28T10:00:00Z')
  const reportQuery = client.calls.find(call => call.table === 'city_meetup_reports')
  assert.ok(reportQuery.select.includes('city_meetups!inner(city_id)'))
  assert.ok(reportQuery.filters.some(filter => filter[1] === 'city_meetups.city_id' && filter[2] === cityId))
  assert.ok(reportQuery.limit > 0 && reportQuery.limit <= 501)
})

test('two submissions for one meetup retain both rows but render one guarded report panel', async () => {
  const pending = { ...submission, id: '589d028c-fcf0-4a33-a64e-a16bd4b69f18', status: 'needs_review', created_at: '2026-09-27T10:00:00Z', updated_at: '2026-09-27T10:00:00Z' }
  const client = fakeClient({ cities: [{ id: cityId, name: 'Synthetic', slug: 'synthetic' }], city_community_submissions: [submission, pending], city_meetup_reports: [report(linkedId, 'SAFETY')], city_meetups: [meetup(linkedId)] })
  const { loadCityCommunityInbox } = load('lib/city-pages/community.ts', { 'server-only': {}, './community-moderation': { pendingNativeMeetups, isHistoricalMeetup }, '@/lib/supabase/admin': { createAdminClient: () => client } })
  const inbox = await loadCityCommunityInbox('synthetic')
  assert.equal(inbox.submissions.length, 2)
  assert.equal(inbox.nativeMeetups.length, 0)
  assert.equal(inbox.submissions[0].linkedMeetup, null)
  assert.equal(inbox.submissions[1].linkedMeetup?.id, linkedId)
  const reversed = fakeClient({ cities: [{ id: cityId, name: 'Synthetic', slug: 'synthetic' }], city_community_submissions: [pending, submission], city_meetup_reports: [report(linkedId, 'SAFETY')], city_meetups: [meetup(linkedId)] })
  const reversedInbox = await load('lib/city-pages/community.ts', { 'server-only': {}, './community-moderation': { pendingNativeMeetups, isHistoricalMeetup }, '@/lib/supabase/admin': { createAdminClient: () => reversed } }).loadCityCommunityInbox('synthetic')
  assert.equal(reversedInbox.submissions.find(row => row.id === pending.id)?.linkedMeetup?.id, linkedId)
  assert.equal(reversedInbox.submissions.find(row => row.id === submission.id)?.linkedMeetup, null)
  const page = load('app/city-pages/[citySlug]/community/page.tsx', { 'react/jsx-runtime': jsxRuntime, 'next/link': { default: ({ children, ...props }) => createElement('a', props, children) }, 'next/navigation': { notFound: () => { throw Error('not found') } }, '@/app/admin-shell': { AdminShell: ({ children }) => createElement('main', null, children) }, '@/app/city-pages/[citySlug]/community/actions': { moderateCommunitySubmission() {}, moderateNativeMeetup() {}, resolveCommunityMeetupReports() {} }, '@/components/pending-submit-button': { PendingSubmitButton: ({ children, pendingLabel, ...props }) => { void pendingLabel; return createElement('button', props, children) } }, '@/lib/admin': { requireAdmin: async () => ({ adminSession: { user: { id: actorId } } }) }, '@/lib/city-pages/community': { loadCityCommunityInbox: async () => inbox }, '@/lib/city-pages/community-moderation': { meetupApprovalBlockers, isHistoricalMeetup } }).default
  const document = new JSDOM(renderToStaticMarkup(await page({ params: Promise.resolve({ citySlug: 'synthetic' }), searchParams: Promise.resolve({}) }))).window.document
  assert.equal((document.body.textContent.match(/Private fixture detail/g) ?? []).length, 1)
  assert.equal(document.querySelectorAll('[name="meetupId"]').length, 0)
  assert.match(document.body.textContent, /Verknüpften Vorschlag zuerst/)
})

test('failed link lookup explicitly warns that reported meetup panels are unavailable', async () => {
  const client = fakeClient({ cities: [{ id: cityId, name: 'Synthetic', slug: 'synthetic' }], city_meetup_reports: [report(linkedId)], city_meetups: [meetup(linkedId)], errors: { city_community_submissions: query => query.filters.some(([op, field]) => op === 'in' && field === 'published_record_id') ? { message: 'synthetic link error' } : null } })
  const { loadCityCommunityInbox } = load('lib/city-pages/community.ts', { 'server-only': {}, './community-moderation': { pendingNativeMeetups, isHistoricalMeetup }, '@/lib/supabase/admin': { createAdminClient: () => client } })
  const inbox = await loadCityCommunityInbox('synthetic')
  assert.equal(inbox.nativeMeetups.length, 0)
  assert.ok(inbox.warnings.some(warning => /Meldungen/.test(warning) && /ausgeblendet/.test(warning)))
})

test('report read errors and cap boundaries are visible', async () => {
  const reports = Array.from({ length: 251 }, (_, i) => report(`${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`))
  for (const fixtures of [{ city_meetup_reports: reports }, { errors: { city_meetup_reports: { message: 'synthetic failure' } } }]) {
    const client = fakeClient({ cities: [{ id: cityId, name: 'Synthetic', slug: 'synthetic' }], city_meetups: reports.map(row => meetup(row.meetup_id)), ...fixtures })
    const { loadCityCommunityInbox } = load('lib/city-pages/community.ts', { 'server-only': {}, './community-moderation': { pendingNativeMeetups, isHistoricalMeetup }, '@/lib/supabase/admin': { createAdminClient: () => client } })
    const inbox = await loadCityCommunityInbox('synthetic')
    assert.ok(inbox.warnings.some(warning => /Meldungen/.test(warning)))
  }
})

test('a failed app proposal read does not hide a successfully loaded reported meetup', async () => {
  const client = fakeClient({ cities: [{ id: cityId, name: 'Synthetic', slug: 'synthetic' }], city_meetup_reports: [report(reportId)], city_meetups: [meetup(reportId)], errors: { city_meetups: query => query.filters.some(([op, field]) => op === 'in' && field === 'moderation_status') ? { message: 'synthetic failure' } : null } })
  const { loadCityCommunityInbox } = load('lib/city-pages/community.ts', { 'server-only': {}, './community-moderation': { pendingNativeMeetups, isHistoricalMeetup }, '@/lib/supabase/admin': { createAdminClient: () => client } })
  const inbox = await loadCityCommunityInbox('synthetic')
  assert.equal(inbox.nativeMeetups[0].id, reportId)
  assert.equal(inbox.nativeMeetups[0].reports.length, 1)
  assert.ok(inbox.warnings.some(warning => /App-Vorschläge/.test(warning)))
})

test('terminal app proposal without a pending report is not an unusable moderation card', async () => {
  const client = fakeClient({ cities: [{ id: cityId, name: 'Synthetic', slug: 'synthetic' }], city_meetups: [meetup(closedId, { moderation_status: 'FLAGGED', lifecycle_status: 'COMPLETED', end_at: '2026-09-27T11:00:00Z' })] })
  const { loadCityCommunityInbox } = load('lib/city-pages/community.ts', { 'server-only': {}, './community-moderation': { pendingNativeMeetups, isHistoricalMeetup }, '@/lib/supabase/admin': { createAdminClient: () => client } })
  const inbox = await loadCityCommunityInbox('synthetic')
  assert.equal(inbox.nativeMeetups.length, 0)
})

test('rendered inbox has private evidence and distinct historical resolution controls', async () => {
  const inbox = { city: { id: cityId, name: 'Synthetic', slug: 'synthetic' }, submissions: [], nativeMeetups: [{ id: closedId, cityId, title: 'Closed fixture', description: 'Synthetic', canonicalSlug: closedId, hostUserId: actorId, hostDisplayName: null, linkedSubmission: false, startsAt: '2026-09-27T10:00:00Z', endsAt: '2026-09-27T11:00:00Z', meetingPoint: 'Square', capacity: 8, targetAudience: null, costDescription: null, activityType: 'WALKING', moderationStatus: 'FLAGGED', lifecycleStatus: 'CANCELLED', visibility: 'PUBLIC', locationPrivacy: 'PUBLIC_LOCATION', createdAt: '2026-09-27T09:00:00Z', reports: [{ id: 'r1', reason: 'SAFETY', details: 'Private fixture detail', createdAt: '2026-09-28T10:00:00Z' }] }], warnings: [] }
  const page = load('app/city-pages/[citySlug]/community/page.tsx', { 'react/jsx-runtime': jsxRuntime, 'next/link': { default: ({ children, ...props }) => createElement('a', props, children) }, 'next/navigation': { notFound: () => { throw Error('not found') } }, '@/app/admin-shell': { AdminShell: ({ children }) => createElement('main', null, children) }, '@/app/city-pages/[citySlug]/community/actions': { moderateCommunitySubmission() {}, moderateNativeMeetup() {}, resolveCommunityMeetupReports() {} }, '@/components/pending-submit-button': { PendingSubmitButton: ({ children, pendingLabel, ...props }) => { void pendingLabel; return createElement('button', props, children) } }, '@/lib/admin': { requireAdmin: async () => ({ adminSession: { user: { id: actorId } } }) }, '@/lib/city-pages/community': { loadCityCommunityInbox: async () => inbox }, '@/lib/city-pages/community-moderation': { meetupApprovalBlockers: () => [], isHistoricalMeetup } }).default
  const document = new JSDOM(renderToStaticMarkup(await page({ params: Promise.resolve({ citySlug: 'synthetic' }), searchParams: Promise.resolve({}) }))).window.document
  assert.match(document.body.textContent, /SAFETY/)
  assert.match(document.body.textContent, /Private fixture detail/)
  const form = [...document.querySelectorAll('form')].find(item => item.querySelector('[name="resolution"]'))
  assert.ok(form)
  assert.match(form.textContent, /Meldungen/)
  assert.doesNotMatch(form.textContent, /Freigeben|Veröffentlicht/)
  assert.equal(form.querySelector('[name="meetupId"]').value, closedId)
  const linked = { ...inbox.nativeMeetups[0], id: linkedId, lifecycleStatus: 'SCHEDULED', startsAt: '2026-10-01T10:00:00Z', endsAt: '2026-10-01T11:00:00Z' }
  inbox.nativeMeetups = []
  inbox.submissions = [{ id: submission.id, cityId, reference: 'synthetic', kind: 'meetup', title: 'Linked', description: 'Synthetic', contactName: 'Fixture', contactEmail: 'fixture@example.invalid', hostUserId: actorId, eventStartsAt: linked.startsAt, eventEndsAt: linked.endsAt, eventLocation: 'Square', capacity: 8, targetAudience: null, costDescription: null, activityType: 'WALKING', eventTimezone: 'Europe/Berlin', publishedRecordId: linkedId, sourceUrl: null, status: 'needs_review', reviewNotes: null, publicStatusMessage: null, createdAt: linked.createdAt, updatedAt: linked.createdAt, audit: [], linkedMeetup: linked }]
  const linkedDocument = new JSDOM(renderToStaticMarkup(await page({ params: Promise.resolve({ citySlug: 'synthetic' }), searchParams: Promise.resolve({}) }))).window.document
  assert.match(linkedDocument.body.textContent, /Verknüpften Vorschlag zuerst/)
  assert.equal(linkedDocument.querySelectorAll('[name="meetupId"]').length, 0)
})

function actionHarness({ role = 'admin', host = 'admin.benefitsi.de', profileId = actorId, city = true, rpcError = null, rpcData = undefined } = {}) {
  const events = []
  const user = role === 'guest' ? null : { id: actorId, email: 'actor@example.invalid', user_metadata: { is_admin: true } }
  const profile = role === 'admin' ? { id: profileId, email: user.email, display_name: 'Admin', is_admin: true } : role === 'partner' ? { id: profileId, email: user.email, display_name: 'Partner', is_admin: false, is_partner: true } : { id: profileId, email: user?.email, display_name: 'Ordinary', is_admin: false }
  const authClient = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: table => { assert.equal(table, 'users'); return { select() { return this }, eq(field, value) { assert.equal(field, 'id'); assert.equal(value, actorId); return this }, maybeSingle: async () => ({ data: profile, error: null }) } },
  }
  const redirect = path => { throw Object.assign(new Error('redirect'), { path }) }
  const { requireAdmin } = load('lib/admin.ts', {
    '@supabase/supabase-js': { createClient() { throw Error('no real auth') } }, 'next/navigation': { redirect },
    'next/headers': { headers: async () => new Headers({ host }) },
    '@/lib/portal-routing': { isPartnerHost: value => value === 'partner.benefitsi.de' },
    '@/lib/supabase/server': { createClient: async () => authClient }, '@/lib/supabase/config': { getSupabaseConfig: () => ({ isConfigured: false }) },
  }, { console: { error() {} } })
  const service = {
    from(table) { events.push(['from', table]); assert.equal(table, 'cities'); const filters = []; return { select() { return this }, eq(field, value) { filters.push([field, value]); return this }, maybeSingle: async () => ({ data: city && filters.some(([field, value]) => field === 'id' && value === cityId) && filters.some(([field, value]) => field === 'slug' && value === 'synthetic') ? { id: cityId } : null, error: null }) } },
    rpc: async (name, args) => { events.push(['rpc', name, args]); return { data: rpcData === undefined ? { meetup_id: closedId, resolution: args.p_resolution, resolved_count: 1 } : rpcData, error: rpcError } },
  }
  const actions = load('app/city-pages/[citySlug]/community/actions.ts', {
    'next/cache': { revalidatePath: path => events.push(['revalidate', path]) }, 'next/navigation': { redirect },
    '@/lib/admin': { requireAdmin }, '@/lib/city-pages/public-revalidation': { refreshPublicCity: async () => { events.push(['refresh']); return 'ok' } },
    '@/lib/supabase/admin': { createAdminClient: () => { events.push(['service']); return service } },
  })
  return { actions, events }
}

function actionForm(overrides = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries({ cityId, citySlug: 'synthetic', meetupId: closedId, resolution: 'ACTIONED', status: 'REJECTED', submissionId: submission.id, privateNote: '  Valid private reason  ', actorId: 'forged', ...overrides })) form.set(key, value)
  return form
}

test('actual requireAdmin denies guest, ordinary, partner and forged metadata before service use', async () => {
  for (const role of ['guest', 'ordinary', 'partner']) {
    const harness = actionHarness({ role })
    for (const name of ['moderateNativeMeetup', 'moderateCommunitySubmission', 'resolveCommunityMeetupReports']) {
      await assert.rejects(harness.actions[name](actionForm()), error => error.path === '/login')
    }
    assert.deepEqual(harness.events, [])
  }
  const partnerHost = actionHarness({ host: 'partner.benefitsi.de' })
  await assert.rejects(partnerHost.actions.resolveCommunityMeetupReports(actionForm()), error => error.path === '/login')
  assert.deepEqual(partnerHost.events, [])
  const mismatchedProfile = actionHarness({ profileId: reportId })
  await assert.rejects(mismatchedProfile.actions.resolveCommunityMeetupReports(actionForm()), error => error.path === '/login')
  assert.deepEqual(mismatchedProfile.events, [])
})

test('historical resolution derives actor, validates city, note and exact response before success', async () => {
  const good = actionHarness()
  await assert.rejects(good.actions.resolveCommunityMeetupReports(actionForm()), error => error.path?.includes('success=reports_resolved'))
  const call = good.events.find(event => event[0] === 'rpc')
  assert.equal(call[1], 'resolve_city_meetup_reports_v1')
  assert.deepEqual(JSON.parse(JSON.stringify(call[2])), { p_meetup_id: closedId, p_city_id: cityId, p_resolution: 'ACTIONED', p_actor_id: actorId, p_private_note: 'Valid private reason' })
  assert.ok(good.events.some(event => event[0] === 'revalidate'))
  assert.ok(!good.events.some(event => event[0] === 'refresh'))
  for (const overrides of [{ cityId: actorId }, { meetupId: 'bad' }, { resolution: 'APPROVED' }, { privateNote: ' '.repeat(3) }, { privateNote: 'x'.repeat(1201) }]) {
    const harness = actionHarness()
    await assert.rejects(harness.actions.resolveCommunityMeetupReports(actionForm(overrides)))
    assert.ok(!harness.events.some(event => event[0] === 'rpc'))
  }
  const wrongCity = actionHarness({ city: false })
  await assert.rejects(wrongCity.actions.resolveCommunityMeetupReports(actionForm()))
  assert.ok(!wrongCity.events.some(event => event[0] === 'rpc'))
  for (const options of [{ rpcError: { message: 'synthetic failure' } }, { rpcData: { meetup_id: reportId, resolution: 'ACTIONED', resolved_count: 1 } }, { rpcData: { meetup_id: closedId, resolution: 'DISMISSED', resolved_count: 1 } }, { rpcData: { meetup_id: closedId, resolution: 'ACTIONED', resolved_count: 0 } }]) {
    const harness = actionHarness(options)
    await assert.rejects(harness.actions.resolveCommunityMeetupReports(actionForm()), error => !error.path?.includes('success='))
    assert.ok(!harness.events.some(event => event[0] === 'revalidate'))
  }
})

test('existing moderation actions preserve actor and reject malformed service success', async () => {
  for (const [action, status, expectedRpc, successData] of [
    ['moderateNativeMeetup', 'REJECTED', 'moderate_city_meetup_v1', { ok: true, id: closedId, moderation_status: 'REJECTED' }],
    ['moderateCommunitySubmission', 'rejected', 'moderate_city_community_submission', { id: submission.id, city_id: cityId, status: 'rejected' }],
  ]) {
    const valid = actionHarness({ rpcData: successData })
    await assert.rejects(valid.actions[action](actionForm({ status })), error => error.path?.includes(`success=${status}`))
    const request = valid.events.find(event => event[0] === 'rpc')
    assert.equal(request[1], expectedRpc)
    assert.equal(request[2].p_actor_id, actorId)
    assert.equal(request[2].p_city_id, cityId)
    assert.ok(valid.events.some(event => event[0] === 'revalidate'))
    assert.ok(valid.events.some(event => event[0] === 'refresh'))
    for (const options of [{ rpcError: { message: 'synthetic' } }, { rpcData: { ok: true, id: reportId, moderation_status: status } }]) {
      const failed = actionHarness(options)
      await assert.rejects(failed.actions[action](actionForm({ status })), error => !error.path?.includes('success='))
      assert.ok(!failed.events.some(event => ['revalidate', 'refresh'].includes(event[0])))
    }
    for (const overrides of [{ cityId: actorId }, { privateNote: '   ' }]) {
      const malformed = actionHarness()
      await assert.rejects(malformed.actions[action](actionForm({ ...overrides, status })))
      assert.ok(!malformed.events.some(event => event[0] === 'rpc'))
    }
  }
})
