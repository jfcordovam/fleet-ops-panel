import { useCallback, useMemo, useState } from 'react'
import { Box, CarFront, ChevronRight, Crosshair, MapPin, Navigation, Pause, Play, Plus, Radio, RotateCcw, Route, X } from 'lucide-react'
import { FleetMap } from './FleetMap'
import type { Vehicle } from './simulation'
import './App.css'

const DEFAULT_FLEET_SIZE = 24
const MAX_FLEET_SIZE = 100
const SIMULATION_SPEEDS = [1, 2, 5]

type VehicleListProps = {
  vehicles: Vehicle[]
  selectedId: string | null
  isRunning: boolean
  onSelect: (vehicleId: string | null) => void
}

function VehicleIcon({ kind, size }: { kind: Vehicle['kind']; size: number }) {
  return <span className={`vehicle-icon ${kind}`}><CarFront size={size} /></span>
}

function VehicleList({ vehicles, selectedId, isRunning, onSelect }: VehicleListProps) {
  if (!vehicles.length) {
    return <div className="empty-state"><CarFront size={26} /><p>The city is quiet.</p><small>Add vehicles to get started.</small></div>
  }

  return <div className="vehicle-list" aria-label="Simulated fleet">
    {vehicles.map(vehicle => {
      const isSelected = selectedId === vehicle.id
      return <button className={`vehicle-row ${isSelected ? 'selected' : ''}`} key={vehicle.id} aria-pressed={isSelected} onClick={() => onSelect(isSelected ? null : vehicle.id)}>
        <VehicleIcon kind={vehicle.kind} size={18} />
        <span className="vehicle-name"><strong>{vehicle.id}</strong><small>{vehicle.kind === 'truck' ? 'Truck' : 'Car'} · {isRunning ? 'Moving' : 'Paused'}</small></span>
        <span className="vehicle-speed">{isRunning ? Math.round(vehicle.speed) : 0}<small>km/h</small></span>
        <ChevronRight size={14} />
      </button>
    })}
  </div>
}

type VehicleDetailsProps = {
  vehicle: Vehicle
  isRunning: boolean
  isFollowing: boolean
  onClose: () => void
  onFollowChange: (following: boolean) => void
}

function VehicleDetails({ vehicle, isRunning, isFollowing, onClose, onFollowChange }: VehicleDetailsProps) {
  return <div className="vehicle-detail">
    <div className="detail-heading"><VehicleIcon kind={vehicle.kind} size={20} /><div><span className="eyebrow">SELECTED VEHICLE</span><h3>{vehicle.id}</h3></div><button aria-label="Close details" onClick={onClose}><X size={18} /></button></div>
    <div className="detail-data"><div><span>Speed</span><strong>{isRunning ? Math.round(vehicle.speed) : 0} <small>km/h</small></strong></div><div><span>Distance</span><strong>{(vehicle.distance / 1000).toFixed(2)} <small>km</small></strong></div></div>
    <p>{vehicle.position[1].toFixed(5)}, {vehicle.position[0].toFixed(5)}</p>
    <button className="follow-button" aria-pressed={isFollowing} onClick={() => onFollowChange(!isFollowing)}><Navigation size={16} />{isFollowing ? 'Stop following' : 'Follow vehicle'}</button>
    <span className="follow-hint" role="status">{isFollowing ? 'Following · move the map to exit' : 'Camera is free'}</span>
  </div>
}

export default function App() {
  const [isRunning, setIsRunning] = useState(true)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [fleetSize, setFleetSize] = useState(DEFAULT_FLEET_SIZE)
  const [generation, setGeneration] = useState(0)
  const [isThreeDimensional, setIsThreeDimensional] = useState(true)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [status, setStatus] = useState('Loading map data…')
  const [recenterRequest, setRecenterRequest] = useState(0)

  const selectedVehicle = useMemo(() => vehicles.find(vehicle => vehicle.id === selectedVehicleId), [selectedVehicleId, vehicles])
  const averageSpeed = vehicles.length ? Math.round(vehicles.reduce((total, vehicle) => total + vehicle.speed, 0) / vehicles.length) : 0
  const selectVehicle = useCallback((vehicleId: string | null) => {
    setSelectedVehicleId(vehicleId)
    setIsFollowing(false)
  }, [])
  const updateFleetSize = useCallback((size: number) => {
    setFleetSize(size)
    if (selectedVehicleId && Number(selectedVehicleId.slice(4)) > size) selectVehicle(null)
  }, [selectVehicle, selectedVehicleId])
  const regenerateFleet = () => {
    setGeneration(currentGeneration => currentGeneration + 1)
    selectVehicle(null)
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Fleet Ops home"><span className="brand-icon"><Route size={22} /></span>fleet<span className="brand-light">ops</span></a><div className="top-location"><MapPin size={15} /> Frankfurt am Main <span>DE</span></div></header>
    <main className="workspace">
      <aside className="sidebar">
        <div className="panel-heading"><span className="eyebrow">OPERATIONS CENTER</span><h1>The city in motion<span>.</span></h1><p>Explore Frankfurt. Put your fleet in motion.</p></div>
        <div className="section-label"><span><Radio size={14} /> SIMULATION</span><span className="live-label">{!vehicles.length ? 'NO VEHICLES' : isRunning ? 'LIVE' : 'PAUSED'}</span></div>
        <div className="metrics"><div><span>Vehicles</span><strong>{String(vehicles.length).padStart(2, '0')}<CarFront size={19} /></strong></div><div><span>Avg. speed</span><strong>{isRunning ? averageSpeed : 0}<small>km/h</small></strong></div></div>
        <section className="simulation-controls" aria-label="Simulation controls">
          <div className="label-row"><label htmlFor="fleet-count">Fleet size</label><output htmlFor="fleet-count">{fleetSize} vehicles</output></div>
          <input id="fleet-count" type="range" min="0" max={MAX_FLEET_SIZE} value={fleetSize} onChange={event => updateFleetSize(Number(event.target.value))} />
          <div className="range-ends"><span>0</span><span>{MAX_FLEET_SIZE}</span></div>
          <div className="label-row speed-row"><span>Simulation speed</span><div className="segmented" aria-label="Simulation speed">{SIMULATION_SPEEDS.map(speed => <button key={speed} aria-pressed={speedMultiplier === speed} onClick={() => setSpeedMultiplier(speed)}>{speed}×</button>)}</div></div>
          <div className="actions"><button className="primary" onClick={() => setIsRunning(running => !running)}>{isRunning ? <Pause size={16} /> : <Play size={16} />} {isRunning ? 'Pause' : 'Resume'}</button><button className="reset" aria-label="Regenerate random fleet" title="Regenerate random fleet" onClick={regenerateFleet}><RotateCcw size={17} /></button></div>
        </section>
        <div className="fleet-heading"><h2>Vehicles <span>{vehicles.length}</span></h2><button aria-label="Add five vehicles" disabled={fleetSize >= MAX_FLEET_SIZE} onClick={() => updateFleetSize(Math.min(MAX_FLEET_SIZE, fleetSize + 5))}><Plus size={18} /></button></div>
        <VehicleList vehicles={vehicles} selectedId={selectedVehicleId} isRunning={isRunning} onSelect={selectVehicle} />
      </aside>
      <section className="map-panel" aria-label="Interactive Frankfurt map">
        <FleetMap running={isRunning} speed={speedMultiplier} count={fleetSize} generation={generation} threeD={isThreeDimensional} selected={selectedVehicleId} following={isFollowing} onFollowChange={setIsFollowing} recenter={recenterRequest} onSelect={selectVehicle} onSnapshot={setVehicles} onStatus={setStatus} />
        <div className="map-top"><div className="map-title"><span className="eyebrow">GERMANY</span><h2>Frankfurt<span>am Main</span></h2><span className="map-coordinates">50.1109° N &nbsp; 8.6821° E</span></div><div className="map-mode"><button aria-pressed={!isThreeDimensional} onClick={() => setIsThreeDimensional(false)}>2D</button><button aria-pressed={isThreeDimensional} onClick={() => setIsThreeDimensional(true)}><Box size={14} />3D</button></div></div>
        <div className="map-tools"><button title="Center on Frankfurt" aria-label="Center on Frankfurt" onClick={() => { selectVehicle(null); setRecenterRequest(request => request + 1) }}><Crosshair size={20} /></button></div>
        {status && <div className="map-status" role="status"><span>{status}</span>{status.startsWith('Unable') && <button onClick={regenerateFleet}>Retry</button>}</div>}
        {selectedVehicle && <VehicleDetails vehicle={selectedVehicle} isRunning={isRunning} isFollowing={isFollowing} onClose={() => selectVehicle(null)} onFollowChange={setIsFollowing} />}
        <div className="map-bottom"><div className="legend"><span><i /> Car</span><span><i className="truck" /> Truck</span></div><span className="map-hint">Drag to explore · Ctrl + drag to tilt</span></div>
      </section>
    </main>
  </div>
}
