import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRoad, locate, buildNetwork, spawnVehicle, advance, metresBetween } from '../src/simulation.ts'
const a = [8.67,50.11], b = [8.672,50.11], c = [8.672,50.112], d = [8.67,50.112]
const network = buildNetwork([[a,b,c,d,a],[a,c]])
const road = createRoad([a,b,c])
const constant = () => 0.5
function seeded(seed) {
  return () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed / 2**32 }
}

test('rejects degenerate roads but keeps short junction connectors', () => {
  assert.equal(createRoad([]),null)
  assert.equal(createRoad([a,a]),null)
  assert.equal(createRoad([[8,50],[8.00001,50]]),null)
  assert.ok(createRoad([[8,50],[8.0001,50]]))
})
test('interpolates bends and clamps to route endpoints instead of reversing', () => {
  assert.deepEqual(locate(road,0).position,a)
  assert.deepEqual(locate(road,road.length*2).position,c)
  assert.deepEqual(locate(road,-1).position,a)
  assert.ok(metresBetween(locate(road,road.lengths[0]).position,b)<1e-6)
})
test('deduplicates tile edges and links shared interior junction vertices', () => {
  const net = buildNetwork([[a,b,c],[d,b],[c,b,a]])
  assert.equal(net.edges.length,6)
  assert.equal(net.exits.get('8.67200,50.11000').length,3)
})
test('does not connect unshared crossings; removes isolated fragments', () => {
  const net = buildNetwork([[a,b,c],[d,[8.68,50.12]],[[8.671,50.109],[8.671,50.113]]])
  assert.equal(net.nodes.size,3)
  assert.equal(net.edges.length,4)
  assert.throws(()=>spawnVehicle(0,buildNetwork([])),/empty/)
})
test('plans several connected streets without immediate reversal at junctions', () => {
  for(let seed=1;seed<=30;seed++) {
    const vehicle = spawnVehicle(seed,network,seeded(seed))
    const points = vehicle.road.coordinates
    assert.ok(vehicle.road.length>=900)
    assert.ok(new Set(points.map(JSON.stringify)).size>=3)
    for(let i=2;i<points.length;i++) assert.notDeepEqual(points[i],points[i-2])
    for(let i=1;i<points.length;i++) {
      assert.ok(network.edges.some(edge=>network.nodes.get(edge.from)===points[i-1]&&network.nodes.get(edge.to)===points[i]))
    }
  }
})
test('different random seeds produce different routes', () => {
  const routes = new Set(Array.from({length:20},(_,i)=>JSON.stringify(spawnVehicle(i,network,seeded(i+1)).road.coordinates)))
  assert.ok(routes.size>5)
})
test('continues across route boundaries without teleporting or losing distance', () => {
  const v = spawnVehicle(0,network,constant)
  v.progress = v.road.length-0.01
  Object.assign(v,locate(v.road,v.progress))
  const before = [...v.position]
  advance(v,0.01,constant)
  assert.equal(v.routeVersion,1)
  assert.ok(metresBetween(before,v.position)<=v.speed/3.6*0.01+1e-6)
  assert.ok(Math.abs(v.distance-v.speed/3.6*0.01)<1e-8)
})
test('movement is frame-rate independent across multiple route changes', () => {
  const first = spawnVehicle(0,network,constant), second = spawnVehicle(0,network,constant)
  advance(first,600,constant)
  for(let i=0;i<36000;i++) advance(second,1/60,constant)
  assert.ok(Math.abs(first.distance-second.distance)<1e-6)
  assert.ok(metresBetween(first.position,second.position)<1e-5)
  assert.equal(first.routeVersion,second.routeVersion)
  const paused = structuredClone(first)
  advance(first,0,constant)
  assert.deepEqual(first,paused)
})
test('dead ends turn back continuously when no other exit exists', () => {
  const net = buildNetwork([[a,b]])
  const v = spawnVehicle(0,net,constant)
  assert.ok(v.road.coordinates.length>2)
  for(let i=0;i<3000;i++) {
    advance(v,1,constant)
    assert.ok(v.position.every(Number.isFinite))
    assert.ok(v.position[0]>=a[0]&&v.position[0]<=b[0])
    assert.equal(v.position[1],a[1])
  }
})
