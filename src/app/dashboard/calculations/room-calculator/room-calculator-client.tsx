'use client'

import { useState, useCallback, useMemo } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import {
  getInstallationTypes,
  getRoomTemplates,
  calculateProject,
  simulateProfit,
  convertCalculationToOffer,
} from '@/lib/actions/calculation-intelligence'
import { CALC_DEFAULTS } from '@/lib/constants'
import { getDBLevel, getDBTextColor } from '@/lib/logic/pricing'
import type {
  InstallationType,
  RoomTemplate,
  ProjectEstimate,
  CreateRoomCalculationInput,
  ProfitSimulationResult,
} from '@/types/calculation-intelligence.types'

// =====================================================
// Room Calculator Client
// =====================================================

interface RoomInput {
  id: string
  room_name: string
  room_template_id: string
  room_type: string
  size_m2: number
  floor_number: number
  installation_type_id: string
  ceiling_height_m: number
  points: Record<string, number>
  notes: string
}

const DEFAULT_ROOM: Omit<RoomInput, 'id'> = {
  room_name: '',
  room_template_id: '',
  room_type: 'living',
  size_m2: 0,
  floor_number: 0,
  installation_type_id: '',
  ceiling_height_m: 2.5,
  points: {},
  notes: '',
}

const POINT_LABELS: Record<string, string> = {
  outlets: 'Stikkontakter',
  outlets_countertop: 'Bordstik',
  outlets_ip44: 'Stik IP44',
  switches: 'Afbrydere',
  ceiling_lights: 'Loftudtag',
  spots: 'Spots/downlights',
  data_points: 'Dataudtag',
  tv_udtag: 'TV udtag',
  ventilation: 'Ventilation',
  gulvvarme_tilslutning: 'Gulvvarme',
  emhætte_tilslutning: 'Emhætte',
  opvaskemaskine: 'Opvaskemaskine',
  vaskemaskine: 'Vaskemaskine',
  tørretumbler: 'Tørretumbler',
  ovn_tilslutning: 'Ovn/komfur (3-faset)',
  induktion_tilslutning: 'Induktion',
  elbil_lader: 'Elbils-lader',
  udendørs_lamper: 'Udendørs lamper',
  havepæle: 'Havepæle',
  gruppeafbrydere: 'Gruppeafbrydere',
  hpfi_afbrydere: 'HPFI afbrydere',
  hovedafbryder: 'Hovedafbryder',
  overspændingsbeskyttelse: 'Overspænding',
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function RoomCalculatorClient() {
  // Data
  const [installationTypes, setInstallationTypes] = useState<InstallationType[]>([])
  const [roomTemplates, setRoomTemplates] = useState<RoomTemplate[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)

  // Rooms
  const [rooms, setRooms] = useState<RoomInput[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  // Project settings
  const [projectName, setProjectName] = useState('')
  const [buildingType, setBuildingType] = useState('house')
  const [buildingAge, setBuildingAge] = useState(0)
  const [hourlyRate, setHourlyRate] = useState<number>(CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN)
  const [overheadPct, setOverheadPct] = useState<number>(CALC_DEFAULTS.FACTORS.DEFAULT_OVERHEAD_PCT)
  const [riskPct, setRiskPct] = useState<number>(CALC_DEFAULTS.FACTORS.DEFAULT_RISK_PCT)
  const [marginPct, setMarginPct] = useState(25)
  const [discountPct, setDiscountPct] = useState(0)

  // Results
  const [estimate, setEstimate] = useState<ProjectEstimate | null>(null)
  const [profitSim, setProfitSim] = useState<ProfitSimulationResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [convertResult, setConvertResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState<'rooms' | 'results' | 'profit'>('rooms')

  // Load reference data
  const loadData = useCallback(async () => {
    if (dataLoaded) return
    const [itResult, rtResult] = await Promise.all([
      getInstallationTypes(),
      getRoomTemplates(),
    ])

    if (itResult.success && itResult.data) setInstallationTypes(itResult.data)
    if (rtResult.success && rtResult.data) setRoomTemplates(rtResult.data)
    setDataLoaded(true)
  }, [dataLoaded])

  // Load on mount
  if (!dataLoaded) {
    loadData()
  }

  // Add room
  const addRoom = useCallback((templateId?: string) => {
    const template = templateId ? roomTemplates.find((t) => t.id === templateId) : null
    const id = generateId()
    const newRoom: RoomInput = {
      id,
      ...DEFAULT_ROOM,
      room_name: template?.name || `Rum ${rooms.length + 1}`,
      room_template_id: templateId || '',
      room_type: template?.room_type || 'living',
      size_m2: template?.typical_size_m2 || 0,
      points: template?.default_points || {},
    }
    setRooms((prev) => [...prev, newRoom])
    setActiveRoomId(id)
  }, [roomTemplates, rooms.length])

  // Update room
  const updateRoom = useCallback((id: string, updates: Partial<RoomInput>) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    )
  }, [])

  // Remove room
  const removeRoom = useCallback((id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id))
    if (activeRoomId === id) {
      setActiveRoomId(rooms.length > 1 ? rooms.find((r) => r.id !== id)?.id || null : null)
    }
  }, [activeRoomId, rooms])

  // Apply template to room
  const applyTemplate = useCallback((roomId: string, templateId: string) => {
    const template = roomTemplates.find((t) => t.id === templateId)
    if (!template) return
    updateRoom(roomId, {
      room_template_id: templateId,
      room_type: template.room_type,
      size_m2: template.typical_size_m2 || 0,
      points: { ...template.default_points },
    })
  }, [roomTemplates, updateRoom])

  // Update point count
  const updatePoint = useCallback((roomId: string, pointKey: string, value: number) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r
        const newPoints = { ...r.points }
        if (value <= 0) {
          delete newPoints[pointKey]
        } else {
          newPoints[pointKey] = value
        }
        return { ...r, points: newPoints }
      })
    )
  }, [])

  // Calculate project
  const runCalculation = useCallback(async () => {
    if (rooms.length === 0) {
      setError('Tilføj mindst ét rum')
      return
    }
    setIsCalculating(true)
    setError(null)

    const input = {
      rooms: rooms.map((r) => ({
        calculation_id: '',
        room_name: r.room_name,
        room_template_id: r.room_template_id || undefined,
        room_type: r.room_type,
        size_m2: r.size_m2 || undefined,
        floor_number: r.floor_number,
        installation_type_id: r.installation_type_id || undefined,
        ceiling_height_m: r.ceiling_height_m,
        points: r.points,
        notes: r.notes || undefined,
      })),
      building_type: buildingType,
      building_age_years: buildingAge || undefined,
      hourly_rate: hourlyRate,
      overhead_percentage: overheadPct,
      risk_percentage: riskPct,
      margin_percentage: marginPct,
      discount_percentage: discountPct,
    }

    const result = await calculateProject(input)
    if (result.success && result.data) {
      setEstimate(result.data)
      setActiveTab('results')

      // Also run profit simulation
      const profitResult = await simulateProfit({
        cost_price: result.data.cost_price,
        hourly_rate: hourlyRate,
        total_hours: result.data.total_labor_hours,
        material_cost: result.data.total_material_cost,
        overhead_percentage: overheadPct,
        risk_percentage: riskPct,
        margin_percentage: marginPct,
        discount_percentage: discountPct,
        vat_percentage: 25,
      })
      if (profitResult.success && profitResult.data) {
        setProfitSim(profitResult.data)
      }
    } else {
      setError(result.error || 'Beregningsfejl')
    }
    setIsCalculating(false)
  }, [rooms, buildingType, buildingAge, hourlyRate, overheadPct, riskPct, marginPct, discountPct])

  // Convert to offer
  const handleConvertToOffer = useCallback(async () => {
    if (!estimate) return
    setIsConverting(true)

    // We need to create a kalkia calculation first, then convert
    // For now, use convertCalculationToOffer pattern
    // This is a simplified flow - in production you'd save the calculation first
    setConvertResult('Funktion kræver at kalkulationen gemmes først. Brug "Gem som Kalkia kalkulation" først.')
    setIsConverting(false)
  }, [estimate])

  // Active room
  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId),
    [rooms, activeRoomId]
  )

  // Total points summary
  const totalPoints = useMemo(() => {
    let total = 0
    for (const room of rooms) {
      total += Object.values(room.points).reduce((s, v) => s + v, 0)
    }
    return total
  }, [rooms])

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'rooms' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('rooms')}
        >
          Rum ({rooms.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'results' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('results')}
          disabled={!estimate}
        >
          Resultat {estimate ? `(${formatCurrency(estimate.final_amount)})` : ''}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'profit' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('profit')}
          disabled={!profitSim}
        >
          Profit simulator
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* ===================== ROOMS TAB ===================== */}
      {activeTab === 'rooms' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Room list + project settings */}
          <div className="space-y-4">
            {/* Project Settings */}
            <div className="bg-white rounded-lg border p-4 space-y-3">
              <h3 className="font-semibold text-sm">Projekt indstillinger</h3>
              <div>
                <label className="text-xs text-gray-500">Projektnavn</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-1.5 text-sm mt-1"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Nyt el-projekt..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Bygningstype</label>
                  <select
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                    value={buildingType}
                    onChange={(e) => setBuildingType(e.target.value)}
                  >
                    <option value="house">Villa/hus</option>
                    <option value="apartment">Lejlighed</option>
                    <option value="commercial">Erhverv</option>
                    <option value="industrial">Industri</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Bygningsalder (år)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                    value={buildingAge || ''}
                    onChange={(e) => setBuildingAge(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Timepris (kr)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(parseInt(e.target.value) || CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Margin (%)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                    value={marginPct}
                    onChange={(e) => setMarginPct(parseFloat(e.target.value) || 25)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Overhead (%)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                    value={overheadPct}
                    onChange={(e) => setOverheadPct(parseFloat(e.target.value) || 12)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Risiko (%)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                    value={riskPct}
                    onChange={(e) => setRiskPct(parseFloat(e.target.value) || 3)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Rabat (%)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                    value={discountPct}
                    onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Room List */}
            <div className="bg-white rounded-lg border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-sm">Rum ({rooms.length})</h3>
                <span className="text-xs text-gray-500">{totalPoints} el-punkter</span>
              </div>

              <div className="space-y-1">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between items-center ${
                      activeRoomId === room.id
                        ? 'bg-blue-50 border border-blue-200 text-blue-700'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                    onClick={() => setActiveRoomId(room.id)}
                  >
                    <span className="font-medium">{room.room_name || 'Nyt rum'}</span>
                    <span className="text-xs text-gray-400">
                      {Object.values(room.points).reduce((s, v) => s + v, 0)} pkt
                    </span>
                  </button>
                ))}
              </div>

              {/* Quick add from template */}
              <div className="border-t pt-3">
                <label className="text-xs text-gray-500 mb-1 block">Tilføj rum fra skabelon</label>
                <select
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addRoom(e.target.value)
                    e.target.value = ''
                  }}
                >
                  <option value="">Vælg rumtype...</option>
                  {roomTemplates.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name} ({Object.values(rt.default_points).reduce((s, v) => s + v, 0)} pkt)
                    </option>
                  ))}
                </select>
                <button
                  className="w-full mt-2 px-3 py-1.5 text-sm border border-dashed border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                  onClick={() => addRoom()}
                >
                  + Tomt rum
                </button>
              </div>
            </div>

            {/* Calculate button */}
            <button
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={runCalculation}
              disabled={rooms.length === 0 || isCalculating}
            >
              {isCalculating ? 'Beregner...' : `Beregn projekt (${rooms.length} rum, ${totalPoints} punkter)`}
            </button>
          </div>

          {/* Right: Active room editor */}
          <div className="lg:col-span-2">
            {activeRoom ? (
              <div className="bg-white rounded-lg border p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-500">Rumnavn</label>
                        <input
                          type="text"
                          className="w-full border rounded px-3 py-2 text-sm mt-1"
                          value={activeRoom.room_name}
                          onChange={(e) => updateRoom(activeRoom.id, { room_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Skabelon</label>
                        <select
                          className="w-full border rounded px-2 py-2 text-sm mt-1"
                          value={activeRoom.room_template_id}
                          onChange={(e) => applyTemplate(activeRoom.id, e.target.value)}
                        >
                          <option value="">Ingen skabelon</option>
                          {roomTemplates.map((rt) => (
                            <option key={rt.id} value={rt.id}>{rt.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">Areal (m²)</label>
                        <input
                          type="number"
                          className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                          value={activeRoom.size_m2 || ''}
                          onChange={(e) => updateRoom(activeRoom.id, { size_m2: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Etage</label>
                        <input
                          type="number"
                          className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                          value={activeRoom.floor_number}
                          onChange={(e) => updateRoom(activeRoom.id, { floor_number: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Lofthøjde (m)</label>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                          value={activeRoom.ceiling_height_m}
                          onChange={(e) => updateRoom(activeRoom.id, { ceiling_height_m: parseFloat(e.target.value) || 2.5 })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Installationstype</label>
                        <select
                          className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                          value={activeRoom.installation_type_id}
                          onChange={(e) => updateRoom(activeRoom.id, { installation_type_id: e.target.value })}
                        >
                          <option value="">Standard (gips)</option>
                          {installationTypes.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name} (×{it.time_multiplier})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <button
                    className="ml-4 text-red-500 hover:text-red-700 text-sm"
                    onClick={() => removeRoom(activeRoom.id)}
                  >
                    Fjern
                  </button>
                </div>

                {/* Electrical Points */}
                <div className="border-t pt-4">
                  <h4 className="font-semibold text-sm mb-3">Elektriske punkter</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(POINT_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-600 block">{label}</label>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            className="w-6 h-6 rounded border text-xs flex items-center justify-center hover:bg-gray-100"
                            onClick={() => updatePoint(activeRoom.id, key, (activeRoom.points[key] || 0) - 1)}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            className="w-12 border rounded px-1 py-0.5 text-sm text-center"
                            value={activeRoom.points[key] || 0}
                            onChange={(e) => updatePoint(activeRoom.id, key, parseInt(e.target.value) || 0)}
                            min={0}
                          />
                          <button
                            className="w-6 h-6 rounded border text-xs flex items-center justify-center hover:bg-gray-100"
                            onClick={() => updatePoint(activeRoom.id, key, (activeRoom.points[key] || 0) + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Room Summary */}
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Total punkter i rum:</span>
                    <span className="font-semibold">
                      {Object.values(activeRoom.points).reduce((s, v) => s + v, 0)}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                <div className="border-t pt-4">
                  <label className="text-xs text-gray-500">Noter</label>
                  <textarea
                    className="w-full border rounded px-3 py-2 text-sm mt-1"
                    rows={2}
                    value={activeRoom.notes}
                    onChange={(e) => updateRoom(activeRoom.id, { notes: e.target.value })}
                    placeholder="Eventuelle noter om rummet..."
                  />
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
                <p className="text-lg mb-2">Tilføj et rum for at komme i gang</p>
                <p className="text-sm">Brug skabelonerne til venstre eller opret et tomt rum</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== RESULTS TAB ===================== */}
      {activeTab === 'results' && estimate && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetricCard label="Kostpris" value={formatCurrency(estimate.cost_price)} />
            <MetricCard label="Salgspris ekskl. moms" value={formatCurrency(estimate.sale_price_excl_vat)} />
            <MetricCard label="Moms" value={formatCurrency(estimate.vat_amount)} />
            <MetricCard
              label="Slutpris inkl. moms"
              value={formatCurrency(estimate.final_amount)}
              highlight
            />
            <MetricCard
              label="DB%"
              value={`${estimate.db_percentage.toFixed(1)}%`}
              status={getDBLevel(estimate.db_percentage) === 'red' ? 'danger' : getDBLevel(estimate.db_percentage) === 'yellow' ? 'warning' : 'success'}
            />
            <MetricCard label="DB/time" value={formatCurrency(estimate.db_per_hour)} />
          </div>

          {/* Time and Material Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <h4 className="text-sm font-semibold mb-2">Tid</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Arbejdstimer:</span>
                  <span className="font-medium">{estimate.total_labor_hours.toFixed(1)} timer</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Arbejdsdage (8t):</span>
                  <span>{Math.ceil(estimate.total_labor_hours / 8)} dage</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Arbejdsløn:</span>
                  <span>{formatCurrency(estimate.total_labor_cost)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border p-4">
              <h4 className="text-sm font-semibold mb-2">Materialer</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Materialekostpris:</span>
                  <span className="font-medium">{formatCurrency(estimate.total_material_cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Kabel (total):</span>
                  <span>{Math.round(estimate.total_cable_meters)} m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Overhead:</span>
                  <span>{formatCurrency(estimate.overhead_amount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border p-4">
              <h4 className="text-sm font-semibold mb-2">El-tavle</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Grupper:</span>
                  <span className="font-medium">{estimate.panel_requirements.total_groups_needed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">HPFI grupper:</span>
                  <span>{estimate.panel_requirements.rcd_groups_needed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tavleomk.:</span>
                  <span>{formatCurrency(estimate.panel_requirements.estimated_panel_cost)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Room Breakdown */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b">
              <h4 className="font-semibold text-sm">Rum-opdeling</h4>
            </div>
            <div className="divide-y">
              {estimate.rooms.map((room, idx) => (
                <div key={idx} className="px-4 py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium text-sm">{room.room_name}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {Object.values(room.points).reduce((s, v) => s + v, 0)} punkter
                      </span>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <span className="text-gray-500">
                        {(room.total_time_seconds / 3600).toFixed(1)}t
                      </span>
                      <span className="text-gray-500">
                        Mat: {formatCurrency(room.total_material_cost)}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(room.total_cost)}
                      </span>
                    </div>
                  </div>
                  {room.warnings.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {room.warnings.map((w, wi) => (
                        <p key={wi} className="text-xs text-amber-600">{w}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Risk Analysis */}
          {estimate.risk_analysis && (
            <div className="bg-white rounded-lg border p-4">
              <h4 className="font-semibold text-sm mb-3">Risikoanalyse</h4>
              <div className="flex items-center gap-3 mb-3">
                <RiskBadge level={estimate.risk_analysis.risk_level} />
                <span className="text-sm">
                  Score: {estimate.risk_analysis.risk_score}/5 |
                  Anbefalet buffer: {estimate.risk_analysis.recommended_buffer_percentage}%
                </span>
              </div>
              {estimate.risk_analysis.factors.length > 0 && (
                <div className="space-y-1">
                  {estimate.risk_analysis.factors.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={`inline-block w-2 h-2 rounded-full mt-1.5 ${
                        f.severity === 'high' ? 'bg-red-500' :
                        f.severity === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                      }`} />
                      <span className="text-gray-600">{f.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OBS Points */}
          {estimate.obs_points.length > 0 && (
            <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
              <h4 className="font-semibold text-sm mb-2 text-amber-800">OBS-punkter til tilbud</h4>
              <ul className="space-y-1">
                {estimate.obs_points.map((obs, i) => (
                  <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">!</span>
                    {obs}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cable Summary */}
          <div className="bg-white rounded-lg border p-4">
            <h4 className="font-semibold text-sm mb-3">Kabeloversigt</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Kabeltype</th>
                  <th className="pb-2 text-right">Meter</th>
                  <th className="pb-2 text-right">Pris/m</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {estimate.cable_summary.cable_types.map((ct, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5">{ct.type}</td>
                    <td className="py-1.5 text-right">{ct.total_meters.toFixed(1)} m</td>
                    <td className="py-1.5 text-right">{formatCurrency(ct.estimated_cost_per_meter)}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(ct.total_cost)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-right">{estimate.cable_summary.total_meters.toFixed(1)} m</td>
                  <td />
                  <td className="pt-2 text-right">{formatCurrency(estimate.cable_summary.total_cable_cost)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              onClick={handleConvertToOffer}
              disabled={isConverting}
            >
              {isConverting ? 'Konverterer...' : 'Konverter til tilbud'}
            </button>
            <button
              className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
              onClick={() => setActiveTab('rooms')}
            >
              Rediger rum
            </button>
            <button
              className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
              onClick={() => setActiveTab('profit')}
            >
              Profit simulator
            </button>
          </div>
          {convertResult && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
              {convertResult}
            </div>
          )}
        </div>
      )}

      {/* ===================== PROFIT TAB ===================== */}
      {activeTab === 'profit' && profitSim && (
        <div className="space-y-6">
          {/* Base costs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Materialekost" value={formatCurrency(profitSim.material_cost)} />
            <MetricCard label="Arbejdskost" value={formatCurrency(profitSim.labor_cost)} />
            <MetricCard label="Kostpris" value={formatCurrency(profitSim.cost_price)} highlight />
          </div>

          {/* Scenario table */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b">
              <h4 className="font-semibold text-sm">Scenarie-analyse</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50">
                    <th className="px-4 py-2">Scenarie</th>
                    <th className="px-4 py-2 text-right">Margin%</th>
                    <th className="px-4 py-2 text-right">Rabat%</th>
                    <th className="px-4 py-2 text-right">Salgspris</th>
                    <th className="px-4 py-2 text-right">Slutpris inkl. moms</th>
                    <th className="px-4 py-2 text-right">DB kr</th>
                    <th className="px-4 py-2 text-right">DB%</th>
                    <th className="px-4 py-2 text-right">DB/time</th>
                  </tr>
                </thead>
                <tbody>
                  {profitSim.scenarios.map((s, i) => (
                    <tr
                      key={i}
                      className={`border-b last:border-0 ${
                        s.name === 'Standard margin' ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-4 py-2 font-medium">{s.name}</td>
                      <td className="px-4 py-2 text-right">{s.margin_percentage}%</td>
                      <td className="px-4 py-2 text-right">{s.discount_percentage}%</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(s.net_price)}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatCurrency(s.final_amount)}</td>
                      <td className={`px-4 py-2 text-right ${s.db_amount < 0 ? 'text-red-600' : ''}`}>
                        {formatCurrency(s.db_amount)}
                      </td>
                      <td className={`px-4 py-2 text-right ${getDBTextColor(s.db_percentage)}`}>
                        {s.db_percentage.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-right">{formatCurrency(s.db_per_hour)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
            onClick={() => setActiveTab('results')}
          >
            Tilbage til resultat
          </button>
        </div>
      )}
    </div>
  )
}

// =====================================================
// Helper Components
// =====================================================

function MetricCard({
  label,
  value,
  highlight,
  status,
}: {
  label: string
  value: string
  highlight?: boolean
  status?: 'success' | 'warning' | 'danger'
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${
        status === 'danger' ? 'text-red-600' :
        status === 'warning' ? 'text-amber-600' :
        status === 'success' ? 'text-green-600' :
        highlight ? 'text-blue-700' : ''
      }`}>
        {value}
      </div>
    </div>
  )
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-amber-100 text-amber-800',
    high: 'bg-red-100 text-red-800',
    critical: 'bg-red-200 text-red-900',
  }
  const labels: Record<string, string> = {
    low: 'Lav risiko',
    medium: 'Middel risiko',
    high: 'Høj risiko',
    critical: 'Kritisk risiko',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[level] || colors.low}`}>
      {labels[level] || level}
    </span>
  )
}

