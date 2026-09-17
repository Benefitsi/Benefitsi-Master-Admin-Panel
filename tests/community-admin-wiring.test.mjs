import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8')
test('both moderation paths authorize before service access and only invoke atomic RPCs', async()=>{
 const source=await read('app/city-pages/[citySlug]/community/actions.ts')
 for(const name of ['moderateCommunitySubmission','moderateNativeMeetup']) {
  const fn=source.slice(source.indexOf(`export async function ${name}`)).split('\nexport async function ')[0]
  assert.ok(fn.indexOf('await requireAdmin()') < fn.indexOf('createAdminClient()'))
  assert.match(fn,/\.eq\("id", cityId\)\.eq\("slug", citySlug\)/)
  assert.match(fn,/p_actor_id: adminSession\.user\.id/)
  assert.ok(fn.indexOf('if (error)') < fn.indexOf('await refreshPublicCity'))
  assert.match(fn,/warning=refresh_/)
  assert.doesNotMatch(fn,/\.update\(|\.insert\(/)
 }
 assert.match(source,/\.rpc\("moderate_city_meetup_v1"/)
 assert.match(source,/\.rpc\("moderate_city_community_submission"/)
})
test('native queue checks links outside inbox pagination and fetches only public host name', async()=>{
 const source=await read('lib/city-pages/community.ts')
 assert.match(source,/\.in\("moderation_status", \["PENDING", "FLAGGED"\]\)/)
 assert.match(source,/\.in\("published_record_id", nativeIds\)/)
 assert.match(source,/nativeResult\.error \|\| linksResult\.error \? \[\]/)
 assert.match(source,/pendingNativeMeetups\(allPendingMeetups, displayedLinkedIds\)/)
 assert.match(source,/linkedMeetup: pendingById\.get/)
 assert.match(source,/from\("users"\)\.select\("id,display_name"\)/)
 assert.doesNotMatch(source,/from\("users"\)\.select\("[^"\n]*(?:email|phone|\*)/)
 for(const field of ['host_user_id','event_ends_at','capacity','target_audience','cost_description','activity_type','event_timezone','published_record_id']) assert.ok(source.includes(field))
})
test('inbox shows actual published record and distinguishes saved moderation from refresh warning', async()=>{
 const source=await read('app/city-pages/[citySlug]/community/page.tsx')
 assert.match(source,/publicMeetupUrl\(citySlug, submission\.publishedRecordId\)/)
 assert.match(source,/Freigabe noch nicht möglich/)
 assert.match(source,/disabled=\{blockers\.length > 0\}/)
 assert.match(source,/Die Moderation ist gespeichert/)
 assert.match(source,/timeZone: "Europe\/Berlin"/)
})
