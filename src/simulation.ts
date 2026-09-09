export type Coordinate = [number, number]
export type Road = { coordinates: Coordinate[]; lengths: number[]; length: number }
export type Edge = { id: string; from: string; to: string; length: number }
export type RoadNetwork = { nodes: Map<string, Coordinate>; exits: Map<string, Edge[]>; edges: Edge[] }
export type Vehicle = {
  id: string; kind: 'car' | 'truck'; speed: number; position: Coordinate; bearing: number
  distance: number; progress: number; road: Road; network: RoadNetwork
  lastEdge: Edge; recentEdges: string[]; routeVersion: number
}

export function metresBetween(a: Coordinate, b: Coordinate): number {
  return Math.hypot((b[0] - a[0]) * 111320 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), (b[1] - a[1]) * 111320)
}

export function createRoad(coordinates: Coordinate[]): Road | null {
  if (coordinates.some(p => !p.every(Number.isFinite))) return null
  const lengths = coordinates.slice(1).map((point, i) => metresBetween(coordinates[i], point))
  const length = lengths.reduce((sum, value) => sum + value, 0)
  return length > 2 ? { coordinates, lengths, length } : null
}

// Tile duplicates share a key (~0.7–1.1 m precision). Only shared vertices connect:
// geometric crossings alone must not invent junctions between different levels.
export function buildNetwork(lines: Coordinate[][]): RoadNetwork {
  const nodes = new Map<string, Coordinate>()
  const exits = new Map<string, Edge[]>()
  const edges: Edge[] = []
  const unique = new Set<string>()
  const key = (point: Coordinate) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i]
      if (![...a, ...b].every(Number.isFinite)) continue
      const from = key(a), to = key(b)
      if (from === to) continue
      const id = [from, to].sort().join('|')
      if (unique.has(id)) continue
      unique.add(id)
      if (!nodes.has(from)) nodes.set(from, a)
      if (!nodes.has(to)) nodes.set(to, b)
      const length = metresBetween(nodes.get(from)!, nodes.get(to)!)
      const forward = { id, from, to, length }
      const backward = { id, from: to, to: from, length }
      exits.set(from, [...(exits.get(from) ?? []), forward])
      exits.set(to, [...(exits.get(to) ?? []), backward])
      edges.push(forward, backward)
    }
  }
  // Spawn in the largest connected area, not in isolated fragments at tile borders.
  const visited = new Set<string>()
  let largest = new Set<string>()
  for (const start of nodes.keys()) {
    if (visited.has(start)) continue
    const component = new Set<string>([start]), queue = [start]
    visited.add(start)
    for (let i = 0; i < queue.length; i++) {
      for (const edge of exits.get(queue[i]) ?? []) {
        if (!visited.has(edge.to)) { visited.add(edge.to); component.add(edge.to); queue.push(edge.to) }
      }
    }
    if (component.size > largest.size) largest = component
  }
  return {
    nodes: new Map([...nodes].filter(([id]) => largest.has(id))),
    exits: new Map([...exits].filter(([id]) => largest.has(id))),
    edges: edges.filter(edge => largest.has(edge.from)),
  }
}

function chooseExit(network: RoadNetwork, node: string, previous: Edge | undefined, recent: string[], random: () => number): Edge {
  const options = network.exits.get(node)!
  const forward = options.filter(edge => edge.id !== previous?.id)
  const candidates = forward.length ? forward : options // U-turn only at a dead end.
  const weights = candidates.map(edge => 1 / (1 + recent.filter(id => id === edge.id).length * 5))
  let pick = random() * weights.reduce((sum, weight) => sum + weight, 0)
  for (let i = 0; i < candidates.length; i++) {
    pick -= weights[i]
    if (pick < 0) return candidates[i]
  }
  return candidates.at(-1)!
}

function planRoute(network: RoadNetwork, start: string, previous: Edge | undefined, recent: string[], random: () => number) {
  const coordinates: Coordinate[] = [network.nodes.get(start)!]
  let node = start, lastEdge = previous, length = 0
  const history = [...recent]
  for (let i = 0; i < 256 && length < 900; i++) {
    const edge = chooseExit(network, node, lastEdge, history, random)
    coordinates.push(network.nodes.get(edge.to)!)
    length += edge.length
    node = edge.to
    lastEdge = edge
    history.push(edge.id)
    if (history.length > 80) history.shift()
  }
  return { road: createRoad(coordinates)!, lastEdge: lastEdge!, recentEdges: history }
}

// Interpolation is clamped to the planned route; route changes are handled by advance.
export function locate(road: Road, progress: number): { position: Coordinate; bearing: number } {
  let remaining = Math.max(0, Math.min(progress, road.length))
  for (let i = 0; i < road.lengths.length; i++) {
    const length = road.lengths[i]
    if (length > 0 && (remaining <= length || i === road.lengths.length - 1)) {
      const a = road.coordinates[i], b = road.coordinates[i + 1]
      const t = Math.min(1, remaining / length)
      return { position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: Math.atan2((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI }
    }
    remaining -= length
  }
  return { position: road.coordinates.at(-1)!, bearing: 0 }
}

export function spawnVehicle(index: number, network: RoadNetwork, random = Math.random): Vehicle {
  if (!network.edges.length) throw new Error('The street network is empty')
  const edge = network.edges[Math.floor(random() * network.edges.length)]
  const planned = planRoute(network, edge.from, undefined, [], random)
  const progress = random() * planned.road.length
  return { id: `FFM-${String(index + 1).padStart(3, '0')}`, kind: random() > 0.7 ? 'truck' : 'car', speed: 18 + random() * 28, distance: 0, network, progress, routeVersion: 0, ...planned, ...locate(planned.road, progress) }
}

export function advance(vehicle: Vehicle, seconds: number, random = Math.random): void {
  if (seconds <= 0) return
  const distance = vehicle.speed / 3.6 * seconds
  vehicle.progress += distance
  vehicle.distance += distance
  while (vehicle.progress >= vehicle.road.length) {
    vehicle.progress -= vehicle.road.length
    const next = planRoute(vehicle.network, vehicle.lastEdge.to, vehicle.lastEdge, vehicle.recentEdges, random)
    Object.assign(vehicle, next)
    vehicle.routeVersion++
  }
  Object.assign(vehicle, locate(vehicle.road, vehicle.progress))
}
