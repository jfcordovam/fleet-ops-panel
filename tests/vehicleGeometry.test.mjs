import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vehicleFootprint, vehicleFeatures } from '../src/vehicleGeometry.ts'

test('vehicle footprints preserve metre dimensions and rotate with bearing', () => {
  const origin = [8.68, 50.11]
  for (const bearing of [0, 90, 180, 270]) {
    const ring = vehicleFootprint(origin, bearing, 4.8, 1.9)
    assert.deepEqual(ring[0], ring.at(-1))
    const metres = ring.map(p => [(p[0]-origin[0])*111320*Math.cos(origin[1]*Math.PI/180),(p[1]-origin[1])*111320])
    assert.ok(Math.abs(Math.hypot(metres[1][0]-metres[0][0],metres[1][1]-metres[0][1])-1.9)<1e-7)
    assert.ok(Math.abs(Math.hypot(metres[2][0]-metres[1][0],metres[2][1]-metres[1][1])-4.8)<1e-7)
    assert.ok(Math.abs(metres.slice(0,4).reduce((sum,p)=>sum+p[0],0))<1e-7)
  }
})
test('body and roof have connected heights and stable picking IDs', () => {
  const car = {id:'FFM-001',kind:'car',position:[8.68,50.11],bearing:0}
  const normal = vehicleFeatures([car], null).features.filter(f => !f.id.endsWith('-halo'))
  const selected = vehicleFeatures([car], car.id).features.filter(f => !f.id.endsWith('-halo'))
  assert.equal(normal.length,2)
  assert.equal(normal[0].properties.height,normal[1].properties.base)
  assert.ok(normal[1].properties.height>normal[1].properties.base)
  assert.equal(normal[0].properties.vehicleId,normal[1].properties.vehicleId)
  assert.deepEqual(normal.map(f=>f.id),selected.map(f=>f.id))
  assert.notEqual(normal[0].properties.color,selected[0].properties.color)
  assert.deepEqual(vehicleFeatures([],null).features,[])
})

