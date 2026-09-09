import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONSource } from 'maplibre-gl'
import { advance, buildNetwork, spawnVehicle } from './simulation'
import { vehicleFeatures } from './vehicleGeometry'
import { focusZoom } from './vehicleFocus'
import type { Coordinate, RoadNetwork, Vehicle } from './simulation'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre 6 ships a separate module worker. Let Vite bundle its imports too.
maplibregl.setWorkerUrl(workerUrl)

type FleetMapProps = { running: boolean; speed: number; count: number; generation: number; threeD: boolean; selected: string | null; following: boolean; onFollowChange: (following: boolean) => void; recenter: number; onSelect: (id: string) => void; onSnapshot: (vehicles: Vehicle[]) => void; onStatus: (status: string) => void }
const FRANKFURT_CENTER: Coordinate = [8.6745, 50.1115]
const MAP_BOUNDS: [[number, number], [number, number]] = [[8.58, 50.06], [8.77, 50.17]]
const ROAD_BOUNDS = { minLongitude: 8.65, maxLongitude: 8.705, minLatitude: 50.098, maxLatitude: 50.126 }

function isInRoadBounds([longitude, latitude]: Coordinate): boolean {
  return longitude > ROAD_BOUNDS.minLongitude && longitude < ROAD_BOUNDS.maxLongitude && latitude > ROAD_BOUNDS.minLatitude && latitude < ROAD_BOUNDS.maxLatitude
}

export function FleetMap(props: FleetMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  const mapRef = useRef<maplibregl.Map | null>(null)
  useEffect(() => { latest.current = props })
  useEffect(() => {
    if (!container.current) return
    let map: maplibregl.Map
    let destroyed = false, initialized = false, frame = 0, lastFrame = 0, lastSnapshot = 0, lastVehicleRender = 0
    const fleet: Vehicle[] = []
    let network: RoadNetwork = buildNetwork([])
    let highlightedRoute = ''
    let selection: string | null = null
    let hovered: string | null = null
    const vehiclePins = new Map<string, maplibregl.Marker>()
    let wasFollowing = false
    let gestureInterrupted = false
    let focusUntil = 0
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

    const { onStatus, onSnapshot } = latest.current
    onSnapshot([])
    onStatus('Loading map data…')
    try {
      map = new maplibregl.Map({ container: container.current, style: '/data/map-style.json', center: FRANKFURT_CENTER, zoom: 15.2, pitch: latest.current.threeD ? 58 : 0, bearing: latest.current.threeD ? -24 : 0, maxZoom: 18.5, minZoom: 12, maxBounds: MAP_BOUNDS, attributionControl: { compact: true } })
      mapRef.current = map
    } catch (error) { console.error('Unable to initialize MapLibre:', error); onStatus('Unable to initialize the map. Enable WebGL or hardware acceleration.'); return }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    const mapElement = map.getContainer()
    const setHovered = (nextHovered: string | null) => {
      if (hovered === nextHovered) return
      hovered = nextHovered
      map.getCanvas().style.cursor = hovered ? 'pointer' : ''
      lastVehicleRender = 0
    }
    const updateVehiclePins = (current: FleetMapProps) => {
      const bounds = map.getBounds()
      const visibleIds = new Set<string>()
      for (const vehicle of fleet) {
        if (!bounds.contains(vehicle.position)) continue
        visibleIds.add(vehicle.id)
        let marker = vehiclePins.get(vehicle.id)
        if (!marker) {
          const element = document.createElement('button')
          element.type = 'button'
          element.className = 'map-vehicle-pin'
          element.setAttribute('aria-label', `Select vehicle ${vehicle.id}`)
          element.addEventListener('pointerdown', event => event.stopPropagation())
          element.addEventListener('click', event => { event.stopPropagation(); latest.current.onSelect(vehicle.id) })
          element.addEventListener('mouseenter', () => setHovered(vehicle.id))
          element.addEventListener('mouseleave', () => setHovered(null))
          marker = new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, 2], pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat(vehicle.position).addTo(map)
          vehiclePins.set(vehicle.id, marker)
        }
        marker.setLngLat(vehicle.position)
        const element = marker.getElement()
        element.classList.toggle('selected', vehicle.id === current.selected)
        element.classList.toggle('following', vehicle.id === current.selected && current.following)
      }
      for (const [id, marker] of vehiclePins) {
        if (visibleIds.has(id)) continue
        marker.remove()
        vehiclePins.delete(id)
      }
    }
    const interruptFollow = () => {
      if (!latest.current.following) return
      gestureInterrupted = true
      focusUntil = 0
      map.stop()
      latest.current.onFollowChange(false)
    }
    // Interrupt before the gesture starts; frame-by-frame camera updates otherwise
    // compete with pointer handling before MapLibre emits its first movement event.
    mapElement.addEventListener('pointerdown', interruptFollow, { passive: true })
    mapElement.addEventListener('wheel', interruptFollow, { passive: true })
    mapElement.addEventListener('keydown', interruptFollow)
    map.on('movestart', event => {
      // Programmatic camera updates have no originalEvent and must not cancel follow.
      if (event.originalEvent) {
        gestureInterrupted = true
        focusUntil = 0
        latest.current.onFollowChange(false)
      }
    })
    let lastError = ''
    const timeout = window.setTimeout(() => { if (!initialized) onStatus(lastError || 'Unable to load the map and its streets. Retry, then check the console if the problem persists.') }, 25000)
    map.on('error', event => {
      console.error('MapLibre error:', event.error)
      if (!initialized) {
        lastError = `Unable to load the map: ${event.error.message}`
        onStatus(lastError)
      }
    })
    map.on('load', () => {
      if (destroyed) return
      const label = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id
      map.addLayer({ id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13, paint: { 'fill-extrusion-color': '#c3cec9', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 1 }, layout: { visibility: latest.current.threeD ? 'visible' : 'none' } }, label)
      map.addSource('vehicles', { type: 'geojson', data: vehicleFeatures([], null), maxzoom: 20, tolerance: 0 })
      map.addLayer({
        id: 'vehicles-3d', type: 'fill-extrusion', source: 'vehicles',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 1,
        },
      }, label)
      map.addSource('selected-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'selected-route', type: 'line', source: 'selected-route', paint: { 'line-color': '#138568', 'line-width': 5, 'line-opacity': 0.6 } }, 'buildings-3d')
    })
    // Include buildings in picking so a hidden car cannot be selected through a wall.
    map.on('click', event => {
      if (!map.getLayer('vehicles-3d')) return
      const hit = map.queryRenderedFeatures(event.point, { layers: ['vehicles-3d', 'buildings-3d'] })[0]
      if (hit?.layer.id === 'vehicles-3d') latest.current.onSelect(String(hit.properties.vehicleId))
    })
    map.on('mousemove', event => {
      if (!map.getLayer('vehicles-3d')) return
      const hit = map.queryRenderedFeatures(event.point, { layers: ['vehicles-3d'] })[0]
      setHovered(hit ? String(hit.properties.vehicleId) : null)
    })
    map.on('mouseout', () => {
      setHovered(null)
    })
    const collectRoads = () => {
      if (initialized || !map.getLayer('buildings-3d')) return
      const features = map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation', filter: ['all', ['in', 'class', 'primary', 'secondary', 'tertiary', 'minor'], ['!in', 'brunnel', 'tunnel', 'bridge']] })
      const lines: Coordinate[][] = []
      for (const feature of features) {
        const geometry = feature.geometry
        const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : []
        // Clip individual segments, preserving short connectors and junction vertices.
        for (const part of parts) {
          for (let i = 1; i < part.length; i++) {
            const pair = [part[i - 1], part[i]] as Coordinate[]
            if (pair.every(isInRoadBounds)) lines.push(pair)
          }
        }
      }
      network = buildNetwork(lines)
      if (network.edges.length) { initialized = true; window.clearTimeout(timeout); onStatus('') }
    }
    map.on('idle', collectRoads)
    const animate = (now: number) => {
      if (destroyed) return
      const current = latest.current
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0
      lastFrame = now
      if (initialized) {
        while (fleet.length < current.count) {
          const vehicle = spawnVehicle(fleet.length, network)
          fleet.push(vehicle)

        }
        while (fleet.length > current.count) fleet.pop()
        fleet.forEach(vehicle => {
          if (current.running && !document.hidden) advance(vehicle, dt * current.speed)
        })
        // Markers are lightweight DOM nodes for on-screen vehicles only. Update them per frame
        // so their screen position remains locked to the moving 3D geometry during zooming.
        updateVehiclePins(current)
        // Batch all geometry in one source, capped at 30 Hz to bound worker traffic.
        if (now - lastVehicleRender >= 1000 / 30) {
          const source = map.getSource('vehicles') as GeoJSONSource | undefined
          source?.setData(vehicleFeatures(fleet, current.selected, hovered, current.following))
          lastVehicleRender = now
        }
        const active = fleet.find(v => v.id === current.selected)
        if (selection !== (active?.id ?? null)) {
          selection = active?.id ?? null
          if (active) {
            const duration = reducedMotion.matches ? 0 : 700
            focusUntil = now + duration
            map.easeTo({ center: active.position, zoom: focusZoom(map.getZoom()), pitch: current.threeD ? map.getPitch() : 0, padding: { top: 0, bottom: 160, left: 0, right: 0 }, duration })
          }
        }
        const routeKey = active ? `${active.id}:${active.routeVersion}` : ''
        if (highlightedRoute !== routeKey) {
          highlightedRoute = routeKey
          const source = map.getSource('selected-route') as GeoJSONSource | undefined
          source?.setData({ type: 'FeatureCollection', features: active ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: active.road.coordinates } }] : [] })
        }
        if (!current.following) gestureInterrupted = false
        const following = current.following && !!active && !gestureInterrupted
        if (following && !wasFollowing && active) {
          const duration = reducedMotion.matches ? 0 : 700
          focusUntil = now + duration
          map.easeTo({ center: active.position, zoom: focusZoom(map.getZoom()), pitch: current.threeD ? map.getPitch() : 0, padding: { top: 0, bottom: 160, left: 0, right: 0 }, duration })
        }
        // Keep the user's bearing/pitch/zoom. Wait for focus and 2D/3D transitions.
        if (following && active && now >= focusUntil && !map.isMoving()) {
          map.jumpTo({ center: active.position })
        }
        if (current.following && !active) current.onFollowChange(false)
        wasFollowing = following
        if (now - lastSnapshot > 250) { onSnapshot(fleet.map(vehicle => ({ ...vehicle }))); lastSnapshot = now }
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(container.current)
    return () => {
      destroyed = true
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
      resize.disconnect()
      mapElement.removeEventListener('pointerdown', interruptFollow)
      mapElement.removeEventListener('wheel', interruptFollow)
      mapElement.removeEventListener('keydown', interruptFollow)
      vehiclePins.forEach(marker => marker.remove())
      vehiclePins.clear()
      map.remove()
      mapRef.current = null
    }
  }, [props.generation])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ pitch: props.threeD ? 58 : 0, bearing: props.threeD ? -24 : 0, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700 })
    if (map.getLayer('buildings-3d')) map.setLayoutProperty('buildings-3d', 'visibility', props.threeD ? 'visible' : 'none')
  }, [props.threeD])
  useEffect(() => { mapRef.current?.easeTo({ center: FRANKFURT_CENTER, zoom: 15.2, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700 }) }, [props.recenter])
  return <div ref={container} className="map-canvas" />
}



