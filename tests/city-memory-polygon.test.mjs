import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'

const url = new URL('../lib/city-pages/memory-polygon.ts', import.meta.url)
const load = async () => existsSync(url) ? import(url.href) : {}
const square = [[49.2, 7.9], [49.2, 7.91], [49.21, 7.91], [49.21, 7.9]]

test('clicked corners become a closed GeoJSON polygon without changing their order or input', async () => {
  const c = await load()
  assert.equal(typeof c.memoryPolygonFromVertices, 'function')
  const vertices = structuredClone(square)
  const result = c.memoryPolygonFromVertices(vertices)
  assert.deepEqual(result, {type:'Polygon',coordinates:[[[7.9,49.2],[7.91,49.2],[7.91,49.21],[7.9,49.21],[7.9,49.2]]]})
  assert.deepEqual(vertices, square)
  assert.deepEqual(c.parseMemoryPolygon(JSON.parse(JSON.stringify(result))), result)
  assert.ok(c.memoryPolygonFromVertices([[49,7],[49,7.02],[49.01,7.01],[49.02,7.02],[49.02,7]]), 'Concave shapes are allowed')
})

test('rejects unfinished, crossed, touching, repeated, degenerate and out-of-range corners', async () => {
  const c = await load()
  assert.equal(typeof c.memoryPolygonFromVertices, 'function')
  for (const points of [[],square.slice(0,2),[square[0],square[2],square[1],square[3]],[[49,7],[49,7.01],[49,7.02]],[[49,7],[49,7.02],[49.01,7.01],[49,7.01],[49.01,7]], [...square,square[0]],[[NaN,7],...square],[[86,7],...square],[[49,181],...square]]) {
    assert.equal(c.memoryPolygonFromVertices(points), null, JSON.stringify(points))
  }
  const many = Array.from({length:101}, (_,i)=>[49+Math.sin(i*2*Math.PI/101)*.01,7+Math.cos(i*2*Math.PI/101)*.01])
  assert.equal(c.memoryPolygonFromVertices(many),null)
  assert.ok(c.memoryPolygonFromVertices(many.slice(0,100)))
})

test('untrusted stored custom geometry must be closed, two dimensional, numeric and one ring', async () => {
  const c = await load()
  assert.equal(typeof c.parseMemoryPolygon, 'function')
  const valid = c.memoryPolygonFromVertices(square)
  for (const value of [null,{}, {type:'LineString',coordinates:valid.coordinates}, {...valid,coordinates:[valid.coordinates[0].slice(0,-1)]}, {...valid,coordinates:[valid.coordinates[0],valid.coordinates[0]]}, {...valid,coordinates:[valid.coordinates[0].map(p=>[...p,0])]}, {...valid,coordinates:[valid.coordinates[0].map(p=>p.map(String))]}]) assert.equal(c.parseMemoryPolygon(value),null)
})
