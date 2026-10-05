import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'

const modelUrl = new URL('../lib/city-pages/memory-stamp-map.ts', import.meta.url)
async function model() {
  const module = existsSync(modelUrl) ? await import(modelUrl.href) : {}
  assert.equal(typeof module.memoryMapPreview, 'function', 'map preview is not implemented')
  return module.memoryMapPreview
}
const place = { id: 'trifels', name: 'Reichsburg Trifels', status: 'active', geometry_type: 'POINT', latitude: 49.1965846, longitude: 7.9784024 }
const zone = { zone_key: 'primary', label: 'Schlossäcker', verification_type: 'POINT_RADIUS', safe_latitude: 49.194314771322, safe_longitude: 7.9801118798371, unlock_radius_meters: 400, edge_tolerance_meters: 0, active: true }

test('map uses the collection centre and metre radius, keeping the attraction separate', async () => {
  const preview = (await model())([zone], place)
  assert.deepEqual(preview.circles[0].center, [49.194314771322, 7.9801118798371])
  assert.equal(preview.circles[0].radius, 400)
  assert.deepEqual(preview.place.center, [49.1965846, 7.9784024])
  assert.deepEqual(preview.issues, [])
})

test('edited and inactive zones are represented without mutating stored configuration', async () => {
  const build = await model()
  const original = structuredClone(zone)
  const preview = build([{ ...zone, unlock_radius_meters: 250 }, { ...zone, zone_key: 'second', safe_latitude: 49.197, active: false }], place)
  assert.equal(preview.circles[0].radius, 250)
  assert.equal(preview.circles[1].active, false)
  assert.deepEqual(preview.circles[1].center, [49.197, 7.9801118798371])
  assert.deepEqual(zone, original)
})

test('incomplete and invalid inputs produce a visible issue instead of a misleading circle', async () => {
  const build = await model()
  for (const change of [{safe_latitude:null}, {safe_longitude:NaN}, {safe_latitude:91}, {unlock_radius_meters:NaN}, {unlock_radius_meters:0}, {unlock_radius_meters:10001}]) {
    const preview = build([{...zone,...change}], place)
    assert.equal(preview.circles.length, 0)
    assert.equal(preview.issues.length, 1)
    assert.deepEqual(preview.place.center, [49.1965846, 7.9784024])
  }
  assert.equal(build([], undefined).place, null)
})

test('area zones use the actual polygon including holes, not their legacy radius', async () => {
  const build = await model()
  const coordinates = [[[7.97,49.19],[7.98,49.19],[7.98,49.2],[7.97,49.19]], [[7.973,49.193],[7.975,49.193],[7.975,49.195],[7.973,49.193]]]
  const area = {...zone,verification_type:'AREA',safe_latitude:null,safe_longitude:null,edge_tolerance_meters:10}
  const preview=build([area],{...place,geometry_type:'POLYGON',geometry_geojson:{type:'Polygon',coordinates}})
  assert.equal(preview.circles.length,0)
  assert.deepEqual(preview.areas[0].rings[0][0],[49.19,7.97])
  assert.deepEqual(preview.areas[0].rings[1][1],[49.193,7.975])
  assert.equal(preview.areas[0].edgeTolerance,10)
  for(const geometry of [undefined, {type:'Point',coordinates:[7.97,49.19]}, {type:'Polygon',coordinates:[[[7.97,49.19],[7.98,49.19],[7.98,49.2]]]}]) {
    const invalid=build([area],{...place,geometry_type:'POLYGON',geometry_geojson:geometry})
    assert.equal(invalid.areas.length,0)
    assert.equal(invalid.issues.length,1)
    assert.equal(invalid.circles.length,0)
  }
})
