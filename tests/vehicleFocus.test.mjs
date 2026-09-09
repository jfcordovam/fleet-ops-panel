import { test } from 'node:test'
import assert from 'node:assert/strict'
import { focusZoom, haloRings } from '../src/vehicleFocus.ts'
import { vehicleFeatures } from '../src/vehicleGeometry.ts'

test('selection zooms to street level and preserves a closer view', () => {
  assert.equal(focusZoom(15.2), 17.8)
  assert.equal(focusZoom(18.5), 18.5)
})
test('halo is a closed ring with a hole, in metres around the vehicle', () => {
  const position = [8.68, 50.11]
  const rings = haloRings(position)
  for (const [index, ring] of rings.entries()) {
    assert.deepEqual(ring[0], ring.at(-1))
    for (const p of ring) {
      const radius = Math.hypot((p[0] - position[0]) * 111320 * Math.cos(position[1]*Math.PI/180), (p[1] - position[1]) * 111320)
      assert.ok(Math.abs(radius - (index === 0 ? 5 : 4)) < 1e-7)
    }
  }
  const area = ring => ring.slice(1).reduce((sum, p, i) => sum + (ring[i][0]-position[0])*(p[1]-position[1]) - (p[0]-position[0])*(ring[i][1]-position[1]), 0)
  assert.ok(area(rings[0]) * area(rings[1]) < 0)
})
test('every vehicle has a halo, while hover, selection, and following enlarge it', () => {
  const fleet = ['FFM-001','FFM-002'].map(id => ({id,kind:'car',position:[8.68,50.11],bearing:0}))
  const halos = vehicleFeatures(fleet, null).features.filter(f => f.id.endsWith('-halo'))
  const hovered = vehicleFeatures(fleet, null, 'FFM-002').features.find(f => f.id === 'FFM-002-halo')
  const selected = vehicleFeatures(fleet, 'FFM-002').features.find(f => f.id === 'FFM-002-halo')
  const following = vehicleFeatures(fleet, 'FFM-002', null, true).features.find(f => f.id === 'FFM-002-halo')
  assert.equal(halos.length,2)
  assert.ok(hovered.properties.height > halos[1].properties.height)
  assert.ok(selected.properties.height > hovered.properties.height)
  assert.ok(following.properties.height > selected.properties.height)
  assert.equal(vehicleFeatures(fleet,null).features.length,6)
  assert.equal(vehicleFeatures([],null).features.length,0)
})
