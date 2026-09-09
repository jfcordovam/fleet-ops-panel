import type { Coordinate } from './simulation'

export const VEHICLE_FOCUS_ZOOM = 17.8

/** Keep an already closer view; selecting a vehicle must never zoom out. */
export function focusZoom(currentZoom: number): number {
  return Math.max(currentZoom, VEHICLE_FOCUS_ZOOM)
}

export function haloRings(position: Coordinate, outerRadius = 5, innerRadius = 4): Coordinate[][] {
  const longitudeScale = 111320 * Math.cos(position[1] * Math.PI / 180)
  const ring = (radius: number, reverse: boolean): Coordinate[] => {
    const points: Coordinate[] = Array.from({ length: 48 }, (_, i) => {
      const angle = i / 48 * Math.PI * 2 * (reverse ? -1 : 1)
      return [position[0] + Math.cos(angle) * radius / longitudeScale, position[1] + Math.sin(angle) * radius / 111320]
    })
    return [...points, [...points[0]]]
  }
  return [ring(outerRadius, false), ring(innerRadius, true)]
}
