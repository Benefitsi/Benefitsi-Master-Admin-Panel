import test from 'node:test'
import assert from 'node:assert/strict'
import { collectGsc, collectGbp, collectPageSpeed } from '../lib/seo/collectors/google.ts'
import { brightSearchUrl, fetchBrightSerp, rankFromSerp } from '../lib/seo/collectors/brightdata.ts'
import { collectWebsite } from '../lib/seo/collectors/crawl.ts'

const clock = () => new Date('2026-09-28T12:00:00Z')
const target = { id:'t', canonical_url:'https://www.example.com/shop/', target_type:'partner', partner_id:'p', city_id:null }
const creds = { clientId:'client-secret-id', clientSecret:'client-secret-value', refreshToken:'refresh-secret' }
const json = (value, status=200) => new Response(JSON.stringify(value), { status, headers:{'content-type':'application/json'} })
const googleFetch = (handler) => async (url, init={}) => {
  if (String(url).includes('oauth2.googleapis.com')) return json({ access_token:'token-secret', token_type:'Bearer', expires_in:3600 })
  return handler(url, init)
}
const gscRow = (n=1) => ({ clicks:n, impressions:n+1, ctr:n/(n+1), position:3.5 })

test('missing credentials cause no provider requests', async () => {
  const fetcher = () => { throw Error('network must not be reached') }
  assert.equal((await collectGsc(target,'sc-domain:example.com',null,{fetcher,clock})).state,'unconfigured')
  assert.equal((await collectGbp('locations/123',null,{fetcher,clock})).state,'unconfigured')
  assert.equal((await collectPageSpeed(target,'',{fetcher,clock})).state,'unconfigured')
  assert.equal((await fetchBrightSerp(context,'cafe',null,{fetcher,clock})).state,'unconfigured')
})

test('GSC rejects external property before token request', async () => {
  const result = await collectGsc(target,'sc-domain:other.com',creds,{fetcher:()=>{ throw Error('called') },clock})
  assert.equal(result.state,'blocked')
})

test('GSC URL-prefix property cannot authorize a neighboring path', async () => {
  const result=await collectGsc({...target,canonical_url:'https://www.example.com/shopper/'},'https://www.example.com/shop/',creds,{fetcher:()=>{throw Error('called')},clock})
  assert.equal(result.state,'blocked')
})

test('GSC requests independent totals and top-query samples for adjacent finalized 28-day periods', async () => {
  const requests=[]
  const fetcher=googleFetch((url,init)=>{ requests.push(JSON.parse(init.body)); return json({rows: init.body.includes('"query"') ? [{...gscRow(),keys:['cafe']}] : [gscRow(10)]}) })
  const result=await collectGsc(target,'sc-domain:example.com',creds,{fetcher,clock})
  assert.equal(result.state,'ok')
  assert.deepEqual(result.data.periods.map(p=>[p.startDate,p.endDate]),[['2026-08-01','2026-08-28'],['2026-08-29','2026-09-25']])
  assert.equal(requests.length,4)
  assert.equal(requests.filter(r=>r.dimensions.length===0).length,2)
  assert.equal(requests.filter(r=>r.dimensions[0]==='query' && r.rowLimit===100).length,2)
  assert.ok(requests.every(r=>r.dataState==='final' && r.dimensionFilterGroups[0].filters[0].expression===target.canonical_url))
  assert.equal(result.data.periods[1].totals.clicks,10)
  assert.equal(result.data.periods[1].queries[0].averagePosition,3.5)
  assert.equal(result.data.periods[1].querySampleLimit,100)
})

test('Google 403, 429, malformed, empty, and thrown secret-bearing errors are bounded', async () => {
  for (const [makeResponse,want] of [[()=>json({},403),'forbidden'],[()=>json({},429),'rate_limited'],[()=>new Response('{',{status:200}),'invalid_response'],[()=>json({}),'no_data']]) {
    const result=await collectGsc(target,'sc-domain:example.com',creds,{fetcher:googleFetch(()=>makeResponse()),clock})
    assert.equal(result.state,want)
  }
  const result=await collectGsc(target,'sc-domain:example.com',creds,{fetcher:()=>{throw Error('refresh-secret token-secret')},clock})
  assert.doesNotMatch(JSON.stringify(result),/refresh-secret|token-secret|client-secret-value/)
})

test('GBP keeps omitted metrics unknown and labels call clicks', async () => {
  const fetcher=googleFetch(()=>json({multiDailyMetricTimeSeries:[{dailyMetricTimeSeries:[{dailyMetric:'CALL_CLICKS',timeSeries:{datedValues:[{date:{year:2026,month:9,day:1},value:'4'}]}}]}]}))
  const result=await collectGbp('locations/123',creds,{fetcher,clock})
  assert.equal(result.state,'partial')
  assert.deepEqual(result.data.periods.map(p=>[p.startDate,p.endDate]),[['2026-08-01','2026-08-28'],['2026-08-29','2026-09-25']])
  assert.equal(result.data.periods[1].metrics.callClicks,4)
  assert.equal(result.data.periods[1].metrics.websiteClicks,null)
  assert.equal(result.data.metricNotes.callClicks,'Clicks on call button, not completed calls')
})

test('GBP empty metric series stays unknown rather than becoming zero', async () => {
  const fetcher=googleFetch(()=>json({multiDailyMetricTimeSeries:[{dailyMetricTimeSeries:[{dailyMetric:'CALL_CLICKS',timeSeries:{datedValues:[]}}]}]}))
  const result=await collectGbp('locations/123',creds,{fetcher,clock})
  assert.equal(result.data.periods[1].metrics.callClicks,null)
})

test('PageSpeed reports laboratory scores with an explicit key', async () => {
  const fetcher=async url=>json({lighthouseResult:{finalUrl:target.canonical_url,fetchTime:'2026-09-28T11:00:00Z',categories:{seo:{score:0.8}},audits:{}}})
  const result=await collectPageSpeed(target,'key',{fetcher,clock})
  assert.equal(result.state,'partial')
  assert.equal(result.data.kind,'laboratory')
  assert.equal(result.data.categories.seo,80)
})

const context={channel:'organic',locale:'de-DE',location:'Berlin,Berlin,Germany',device:'mobile',latitude:null,longitude:null}
const config={...context,subjectUrl:'https://www.example.com/shop/'}
const serp=(count=10)=>({general:{query:'cafe',detected_query:'cafe',is_mobile:true},organic:Array.from({length:count},(_,i)=>({rank:i+1,global_rank:i+3,link:`https://other${i}.com/`,title:`Result ${i}`}))})

test('Bright URL fixes first-page query, localization and device', () => {
  const url=new URL(brightSearchUrl(context,'cafe'))
  assert.equal(url.searchParams.get('q'),'cafe')
  assert.equal(url.searchParams.get('hl'),'de')
  assert.equal(url.searchParams.get('gl'),'de')
  assert.equal(url.searchParams.get('uule'),context.location)
  assert.equal(url.searchParams.get('brd_mobile'),'1')
  assert.equal(url.searchParams.get('start'),'0')
  assert.equal(url.searchParams.has('num'),false)
})

test('Bright full JSON distinguishes organic rank from global mixed-page rank', async () => {
  const payload=serp()
  payload.organic[2].link='https://example.com/shop?ref=google'
  let request
  const result=await fetchBrightSerp(context,'cafe',{apiKey:'api-secret',zone:'serp'},{fetcher:async (url,init)=>{request=JSON.parse(init.body);return json(payload)},clock})
  assert.equal(result.state,'ok')
  assert.equal(request.format,'json')
  assert.equal(result.data.organic[2].rank,3)
  assert.equal(result.data.organic[2].globalRank,5)
  assert.deepEqual(rankFromSerp(config,'cafe',result),{keyword:'cafe',state:'ranked',position:3,rankingUrl:'https://example.com/shop?ref=google'})
  assert.doesNotMatch(JSON.stringify(result),/api-secret/)
})

test('SERP absence requires complete valid top ten and malformed positions stay unknown', async () => {
  for (const [payload,want] of [[serp(10),'outside'],[serp(7),'unknown'],[{...serp(),organic:serp().organic.map((r,i)=>({...r,rank:i===8?8:r.rank}))},'unknown'],[{...serp(),general:{query:'another',detected_query:'another'}},'unknown']]) {
    const observation=await fetchBrightSerp(context,'cafe',{apiKey:'k',zone:'z'},{fetcher:async()=>json(payload),clock})
    assert.equal(rankFromSerp(config,'cafe',observation).state,want)
  }
})

test('SERP rejects a corrected query and derives organic rank when full JSON omits rank', async () => {
  const changed={...serp(),general:{query:'cafe',detected_query:'coffee',is_mobile:true}}
  const changedResult=await fetchBrightSerp(context,'cafe',{apiKey:'k',zone:'z'},{fetcher:async()=>json(changed),clock})
  assert.equal(changedResult.state,'invalid_response')
  const documented=serp();documented.organic.forEach(r=>delete r.rank);documented.organic[1].link='https://example.com/shop/'
  const result=await fetchBrightSerp(context,'cafe',{apiKey:'k',zone:'z'},{fetcher:async()=>json(documented),clock})
  assert.equal(rankFromSerp(config,'cafe',result).position,2)
  assert.equal(result.data.organic[1].globalRank,4)
})

test('SERP matches exact path and www-equivalent host, never a neighboring path', async () => {
  const payload=serp(10); payload.organic[0].link='https://www.example.com/shopper/'
  const observation=await fetchBrightSerp(context,'cafe',{apiKey:'k',zone:'z'},{fetcher:async()=>json(payload),clock})
  assert.equal(rankFromSerp(config,'cafe',observation).state,'outside')
})

test('crawler rejects private DNS and cross-host redirects', async () => {
  let calls=0
  const privateResult=await collectWebsite(target,{resolve:async()=>['127.0.0.1'],fetcher:()=>{calls++},clock})
  assert.equal(privateResult.state,'blocked');assert.equal(calls,0)
  const redirect=await collectWebsite(target,{resolve:async()=>['93.184.215.14'],fetcher:async()=>new Response('',{status:302,headers:{location:'https://evil.example/'}}),clock})
  assert.equal(redirect.state,'blocked')
})

test('crawler reports missing title, noindex and broken local link without changing pages', async () => {
  const fetcher=async (url,init)=> String(url).endsWith('/broken') ? new Response('',{status:404}) : new Response('<html><head><meta name="robots" content="noindex"></head><body><a href="/broken">broken</a></body></html>',{status:200,headers:{'content-type':'text/html'}})
  const result=await collectWebsite(target,{resolve:async()=>['93.184.215.14'],fetcher,clock})
  assert.equal(result.state,'partial')
  assert.ok(result.data.findings.some(f=>f.code==='missing_title'))
  assert.ok(result.data.findings.some(f=>f.code==='noindex'))
  assert.ok(result.data.findings.some(f=>f.code==='broken_link'))
})

test('crawler resolves relative links from each page and bounds page count', async () => {
  const visited=[]
  const fetcher=async url=>{visited.push(String(url));return new Response('<html><head><title>Page</title></head><body><a href="child/">Child</a></body></html>',{headers:{'content-type':'text/html'}})}
  const result=await collectWebsite(target,{resolve:async()=>['93.184.215.14'],fetcher,clock})
  assert.equal(result.state,'ok')
  assert.ok(visited.includes('https://www.example.com/shop/child/'))
  assert.ok(visited.includes('https://www.example.com/shop/child/child/'))
  assert.ok(result.data.pages.length<=5)
})
