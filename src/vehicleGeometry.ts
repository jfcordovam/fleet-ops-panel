import type { FeatureCollection, Polygon } from 'geojson'
import type { Coordinate, Vehicle } from './simulation'
import { haloRings } from './vehicleFocus.ts'

type VehicleProperties = { vehicleId: string; color: string; base: number; height: number }
type VehicleState = 'default' | 'hovered' | 'selected' | 'following'

const VEHICLE_DIMENSIONS = {
  car: { length: 5.3, width: 2.05, bodyHeight: 0.9, roofHeight: 1.7, bodyColor: '#238161', roofColor: '#a8dac9' },
  truck: { length: 6.7, width: 2.35, bodyHeight: 1.5, roofHeight: 2.8, bodyColor: '#f5b700', roofColor: '#ffe27a' },
} as const

const EMPHASIS = {
  default: { outerRadius: 5, innerRadius: 4, height: 0.08 },
  hovered: { outerRadius: 8, innerRadius: 6, height: 0.12 },
  selected: { outerRadius: 11, innerRadius: 8, height: 0.15 },
  following: { outerRadius: 14, innerRadius: 10, height: 0.18 },
} as const

function getVehicleState(vehicleId: string, selectedId: string | null, hoveredId: string | null, isFollowing: boolean): VehicleState {
  if (vehicleId === selectedId) return isFollowing ? 'following' : 'selected'
  return vehicleId === hoveredId ? 'hovered' : 'default'
}

function getHaloColor(kind: Vehicle['kind'], state: VehicleState): string {
  if (state === 'following') return '#20e3a7'
  if (state === 'selected') return '#20dba0'
  if (state === 'hovered') return kind === 'truck' ? '#ffd33d' : '#6de0bd'
  return kind === 'truck' ? '#f6bd19' : '#44bd91'
}

// Metre-based offsets prevent footprint size from changing with the map zoom level.
export function vehicleFootprint(position: Coordinate, bearing: number, length: number, width: number): Coordinate[] {
  const angle = bearing * Math.PI / 180
  const longitudeScale = 111320 * Math.cos(position[1] * Math.PI / 180)
  const ring = [
    [-width / 2, -length / 2], [width / 2, -length / 2],
    [width / 2, length / 2], [-width / 2, length / 2],
  ].map(([right, forward]) => {
    const east = right * Math.cos(angle) + forward * Math.sin(angle)
    const north = forward * Math.cos(angle) - right * Math.sin(angle)
    return [position[0] + east / longitudeScale, position[1] + north / 111320] as Coordinate
  })
  return [...ring, ring[0]]
}

export function vehicleFeatures(fleet: Vehicle[], selectedId: string | null, hoveredId: string | null = null, isFollowing = false): FeatureCollection<Polygon, VehicleProperties> {
  return {
    type: 'FeatureCollection',
    features: fleet.flatMap(vehicle => {
      const dimensions = VEHICLE_DIMENSIONS[vehicle.kind]
      const state = getVehicleState(vehicle.id, selectedId, hoveredId, isFollowing)
      const emphasis = EMPHASIS[state]
      const isSelected = state === 'selected' || state === 'following'
      const bodyColor = isSelected ? '#20dba0' : dimensions.bodyColor
      const roofColor = isSelected ? '#a1ffe0' : dimensions.roofColor
      const footprint = vehicleFootprint(vehicle.position, vehicle.bearing, dimensions.length, dimensions.width)
      const roofFootprint = vehicleFootprint(vehicle.position, vehicle.bearing, dimensions.length * 0.58, dimensions.width * 0.85)

      return [
        { type: 'Feature' as const, id: `${vehicle.id}-halo`, properties: { vehicleId: vehicle.id, color: getHaloColor(vehicle.kind, state), base: 0.03, height: emphasis.height }, geometry: { type: 'Polygon' as const, coordinates: haloRings(vehicle.position, emphasis.outerRadius, emphasis.innerRadius) } },
        { type: 'Feature' as const, id: `${vehicle.id}-body`, properties: { vehicleId: vehicle.id, color: bodyColor, base: 0.15, height: dimensions.bodyHeight }, geometry: { type: 'Polygon' as const, coordinates: [footprint] } },
        { type: 'Feature' as const, id: `${vehicle.id}-roof`, properties: { vehicleId: vehicle.id, color: roofColor, base: dimensions.bodyHeight, height: dimensions.roofHeight }, geometry: { type: 'Polygon' as const, coordinates: [roofFootprint] } },
      ]
    }),
  }
}
