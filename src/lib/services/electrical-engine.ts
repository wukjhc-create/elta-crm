/**
 * Electrical Calculation Engine
 *
 * Professional electrical calculations for Danish electrician installations.
 * Based on DS/HD 60364 (Danish implementation of IEC 60364) and
 * Stærkstrømsbekendtgørelsen.
 *
 * Features:
 * - Cable sizing with voltage drop verification
 * - Load calculation with diversity/demand factors
 * - Panel/distribution board configuration
 * - Breaker and RCD sizing
 * - Phase balancing for 3-phase systems
 * - Compliance checking against Danish standards
 */

import type {
  CableCrossSection,
  CableSizingInput,
  CableSizingResult,
  CableType,
  InstallationMethod,
  CoreCount,
  LoadEntry,
  LoadCategory,
  LoadAnalysisResult,
  DiversityFactors,
  CircuitConfig,
  PanelConfiguration,
  BreakerRating,
  BreakerCharacteristic,
  BreakerType,
  RCDType,
  ComplianceCheckResult,
  ComplianceIssue,
  ElectricalProjectInput,
  ElectricalProjectResult,
  ElectricalRoomInput,
  CurrentCapacityEntry,
  CableCostEntry,
  BreakerCostEntry,
  PhaseType,
} from '@/types/electrical.types'

// =====================================================
// Reference Data (IEC 60364-5-52 / DS/HD 60364-5-52)
// =====================================================

/** Standard cable cross-sections in ascending order */
const CABLE_SIZES: CableCrossSection[] = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120]

/** Standard breaker ratings in ascending order */
const BREAKER_RATINGS: BreakerRating[] = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100]

/**
 * Current carrying capacity table (IEC 60364-5-52 Table B.52.2-B.52.5)
 * Values for PVC-insulated copper conductors at 30°C ambient
 * Format: [method][coreCount][crossSection] = amperes
 */
const CURRENT_CAPACITY: Record<InstallationMethod, Record<CoreCount, Partial<Record<CableCrossSection, number>>>> = {
  A1: {
    2: { 1.5: 15.5, 2.5: 21, 4: 28, 6: 36, 10: 50, 16: 68, 25: 89, 35: 110, 50: 134, 70: 171, 95: 207, 120: 239 },
    3: { 1.5: 13.5, 2.5: 18, 4: 24, 6: 31, 10: 42, 16: 57, 25: 75, 35: 92, 50: 110, 70: 139, 95: 167, 120: 192 },
  },
  A2: {
    2: { 1.5: 15, 2.5: 20, 4: 27, 6: 34, 10: 46, 16: 62, 25: 80, 35: 99, 50: 119, 70: 151, 95: 182, 120: 210 },
    3: { 1.5: 13, 2.5: 17.5, 4: 23, 6: 29, 10: 39, 16: 52, 25: 68, 35: 83, 50: 99, 70: 125, 95: 150, 120: 172 },
  },
  B1: {
    2: { 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125, 50: 151, 70: 192, 95: 232, 120: 269 },
    3: { 1.5: 15.5, 2.5: 21, 4: 28, 6: 36, 10: 50, 16: 68, 25: 89, 35: 110, 50: 134, 70: 171, 95: 207, 120: 239 },
  },
  B2: {
    2: { 1.5: 16.5, 2.5: 23, 4: 30, 6: 38, 10: 52, 16: 69, 25: 90, 35: 111, 50: 133, 70: 168, 95: 201, 120: 232 },
    3: { 1.5: 15, 2.5: 20, 4: 27, 6: 34, 10: 46, 16: 62, 25: 80, 35: 99, 50: 119, 70: 151, 95: 182, 120: 210 },
  },
  C: {
    2: { 1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138, 50: 168, 70: 213, 95: 258, 120: 299 },
    3: { 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 96, 35: 119, 50: 144, 70: 184, 95: 223, 120: 259 },
  },
  E: {
    2: { 1.5: 22, 2.5: 30, 4: 40, 6: 51, 10: 70, 16: 94, 25: 119, 35: 148, 50: 180, 70: 232, 95: 282, 120: 328 },
    3: { 1.5: 19.5, 2.5: 26, 4: 35, 6: 44, 10: 60, 16: 80, 25: 101, 35: 126, 50: 153, 70: 196, 95: 238, 120: 276 },
  },
  F: {
    2: { 1.5: 24, 2.5: 33, 4: 45, 6: 58, 10: 80, 16: 107, 25: 138, 35: 169, 50: 207, 70: 268, 95: 328, 120: 382 },
    3: { 1.5: 22, 2.5: 30, 4: 40, 6: 51, 10: 70, 16: 94, 25: 119, 35: 147, 50: 179, 70: 229, 95: 278, 120: 322 },
  },
}

/**
 * Temperature correction factors (IEC 60364-5-52 Table B.52.14)
 * Reference temperature: 30°C for PVC insulated cables
 */
const TEMP_CORRECTION: Record<number, number> = {
  10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06,
  30: 1.00, 35: 0.94, 40: 0.87, 45: 0.79,
  50: 0.71, 55: 0.61, 60: 0.50,
}

/**
 * Grouping correction factors (IEC 60364-5-52 Table B.52.17)
 * For cables bundled together or on same tray
 */
const GROUPING_CORRECTION: Record<number, number> = {
  1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65,
  5: 0.60, 6: 0.57, 7: 0.54, 8: 0.52,
  9: 0.50, 10: 0.48, 12: 0.45, 16: 0.41,
  20: 0.38,
}

/** Copper resistivity at 20°C in Ω·mm²/m */
const COPPER_RESISTIVITY = 0.0175

/** Copper resistivity at operating temperature (~70°C for PVC) in Ω·mm²/m */
const COPPER_RESISTIVITY_70C = 0.0225

/**
 * Danish residential diversity factors (DS/HD 60364-3)
 * Conservative values for residential installations
 */
const DEFAULT_DIVERSITY_RESIDENTIAL: DiversityFactors = {
  lighting: 0.85,
  socket_outlet: 0.40,
  fixed_appliance: 0.75,
  motor: 0.70,
  heating: 0.85,
  cooking: 0.65,
  ev_charger: 1.00, // Usually continuous, no diversity
  data_equipment: 0.60,
}

/** Commercial diversity factors */
const DEFAULT_DIVERSITY_COMMERCIAL: DiversityFactors = {
  lighting: 0.90,
  socket_outlet: 0.30,
  fixed_appliance: 0.80,
  motor: 0.75,
  heating: 0.80,
  cooking: 0.70,
  ev_charger: 0.80,
  data_equipment: 0.70,
}

/**
 * Cable costs per meter in DKK (approximate Danish market prices)
 * PVT = standard Danish installation cable
 */
const CABLE_COSTS: CableCostEntry[] = [
  { cable_type: 'PVT', cross_section: 1.5, core_count: 3, cost_per_meter_dkk: 8 },
  { cable_type: 'PVT', cross_section: 2.5, core_count: 3, cost_per_meter_dkk: 12 },
  { cable_type: 'PVT', cross_section: 4, core_count: 3, cost_per_meter_dkk: 18 },
  { cable_type: 'PVT', cross_section: 6, core_count: 3, cost_per_meter_dkk: 26 },
  { cable_type: 'PVT', cross_section: 10, core_count: 3, cost_per_meter_dkk: 42 },
  { cable_type: 'PVT', cross_section: 16, core_count: 3, cost_per_meter_dkk: 65 },
  { cable_type: 'PVT', cross_section: 25, core_count: 3, cost_per_meter_dkk: 98 },
  { cable_type: 'PVT', cross_section: 1.5, core_count: 2, cost_per_meter_dkk: 6 },
  { cable_type: 'PVT', cross_section: 2.5, core_count: 2, cost_per_meter_dkk: 9 },
  { cable_type: 'PVT', cross_section: 4, core_count: 2, cost_per_meter_dkk: 14 },
  { cable_type: 'NOIKLX', cross_section: 4, core_count: 3, cost_per_meter_dkk: 35 },
  { cable_type: 'NOIKLX', cross_section: 6, core_count: 3, cost_per_meter_dkk: 48 },
  { cable_type: 'NOIKLX', cross_section: 10, core_count: 3, cost_per_meter_dkk: 72 },
  { cable_type: 'NOIKLX', cross_section: 16, core_count: 3, cost_per_meter_dkk: 105 },
  { cable_type: 'NOIKLX', cross_section: 25, core_count: 3, cost_per_meter_dkk: 155 },
]

/**
 * Breaker component costs in DKK (approximate Danish market prices)
 */
const BREAKER_COSTS: BreakerCostEntry[] = [
  // MCB breakers (1 module each)
  { breaker_type: 'MCB', rating_a: 6, characteristic: 'B', cost_dkk: 85, modules: 1 },
  { breaker_type: 'MCB', rating_a: 10, characteristic: 'B', cost_dkk: 85, modules: 1 },
  { breaker_type: 'MCB', rating_a: 13, characteristic: 'B', cost_dkk: 90, modules: 1 },
  { breaker_type: 'MCB', rating_a: 16, characteristic: 'B', cost_dkk: 90, modules: 1 },
  { breaker_type: 'MCB', rating_a: 20, characteristic: 'B', cost_dkk: 95, modules: 1 },
  { breaker_type: 'MCB', rating_a: 25, characteristic: 'C', cost_dkk: 110, modules: 1 },
  { breaker_type: 'MCB', rating_a: 32, characteristic: 'C', cost_dkk: 130, modules: 1 },
  { breaker_type: 'MCB', rating_a: 40, characteristic: 'C', cost_dkk: 165, modules: 1 },
  // RCBO breakers (2 modules each)
  { breaker_type: 'RCBO', rating_a: 10, characteristic: 'B', rcd_type: 'A', rcd_sensitivity_ma: 30, cost_dkk: 450, modules: 2 },
  { breaker_type: 'RCBO', rating_a: 16, characteristic: 'B', rcd_type: 'A', rcd_sensitivity_ma: 30, cost_dkk: 450, modules: 2 },
  { breaker_type: 'RCBO', rating_a: 20, characteristic: 'B', rcd_type: 'A', rcd_sensitivity_ma: 30, cost_dkk: 480, modules: 2 },
  { breaker_type: 'RCBO', rating_a: 25, characteristic: 'C', rcd_type: 'A', rcd_sensitivity_ma: 30, cost_dkk: 520, modules: 2 },
  { breaker_type: 'RCBO', rating_a: 32, characteristic: 'C', rcd_type: 'B', rcd_sensitivity_ma: 30, cost_dkk: 850, modules: 2 },
  // RCD groups (4 modules - 2-pole or 2 modules for single-pole)
  { breaker_type: 'RCD', rating_a: 25, rcd_type: 'A', rcd_sensitivity_ma: 30, cost_dkk: 650, modules: 2 },
  { breaker_type: 'RCD', rating_a: 40, rcd_type: 'A', rcd_sensitivity_ma: 30, cost_dkk: 750, modules: 2 },
  { breaker_type: 'RCD', rating_a: 63, rcd_type: 'A', rcd_sensitivity_ma: 30, cost_dkk: 850, modules: 4 },
  { breaker_type: 'RCD', rating_a: 40, rcd_type: 'B', rcd_sensitivity_ma: 30, cost_dkk: 2200, modules: 4 },
]

/** Panel/enclosure costs */
const PANEL_COSTS: Record<number, number> = {
  12: 450, 24: 750, 36: 1100, 48: 1500, 72: 2200,
}

/** Surge protection costs */
const SURGE_PROTECTION_COST = {
  Type2: 1200,
  'Type1+2': 3500,
  Type1: 2500,
}

// =====================================================
// Cable Sizing Engine
// =====================================================

/**
 * Calculate the required cable size for a circuit.
 * Considers: current capacity, voltage drop, installation method, derating.
 */
export function calculateCableSize(input: CableSizingInput): CableSizingResult {
  const {
    power_watts,
    voltage,
    phase,
    power_factor,
    length_meters,
    installation_method,
    core_count,
    ambient_temp_c = 30,
    grouped_cables = 1,
    cable_type = 'PVT',
    max_voltage_drop_percent = 4,
  } = input

  const warnings: string[] = []

  // 1. Calculate design current
  const design_current_a = phase === '1-phase'
    ? power_watts / (voltage * power_factor)
    : power_watts / (Math.sqrt(3) * voltage * power_factor)

  // 2. Calculate derating factor
  const tempFactor = getTemperatureCorrection(ambient_temp_c)
  const groupFactor = getGroupingCorrection(grouped_cables)
  const derating_factor = tempFactor * groupFactor

  // 3. Find minimum cross-section by current carrying capacity
  const derated_current = design_current_a / derating_factor
  const min_cross_section_current = findMinCrossSectionByCurrent(
    derated_current, installation_method, core_count
  )

  // 4. Find minimum cross-section by voltage drop
  const min_cross_section_voltage_drop = findMinCrossSectionByVoltageDrop(
    design_current_a, length_meters, voltage, phase, max_voltage_drop_percent
  )

  // 5. Select the larger of the two
  const recommended = selectLargerCrossSection(min_cross_section_current, min_cross_section_voltage_drop)

  // 6. Get actual capacity of selected cable
  const capacityTable = CURRENT_CAPACITY[installation_method]?.[core_count]
  const cable_capacity_a = (capacityTable?.[recommended] ?? 0) * derating_factor

  // 7. Calculate actual voltage drop with selected cable
  const { voltage_drop_v, voltage_drop_percent } = calculateVoltageDrop(
    design_current_a, length_meters, recommended, voltage, phase
  )

  // 8. Get cable cost
  const costEntry = CABLE_COSTS.find(
    c => c.cable_type === cable_type && c.cross_section === recommended && c.core_count === core_count
  )
  const cost_per_meter = costEntry?.cost_per_meter_dkk ?? estimateCableCost(cable_type, recommended)

  // 9. Build designation
  const coreDesignation = core_count === 2 ? `2x${recommended}` : `3G${recommended}`
  const cable_designation = `${cable_type} ${coreDesignation}`

  // 10. Check compliance
  let compliant = true
  if (voltage_drop_percent > max_voltage_drop_percent) {
    warnings.push(`Spændingsfald ${voltage_drop_percent.toFixed(1)}% overskrider grænsen på ${max_voltage_drop_percent}%`)
    compliant = false
  }
  if (cable_capacity_a < design_current_a) {
    warnings.push(`Kabelkapacitet ${cable_capacity_a.toFixed(1)}A er under designstrøm ${design_current_a.toFixed(1)}A`)
    compliant = false
  }
  if (design_current_a > 32 && phase === '1-phase') {
    warnings.push('Belastning over 32A bør overvejes med 3-faset tilslutning')
  }
  if (grouped_cables > 6) {
    warnings.push('Mange kabler samlet - overvej separate føringsveje for bedre køling')
  }

  return {
    recommended_cross_section: recommended,
    min_cross_section_current,
    min_cross_section_voltage_drop,
    design_current_a: Math.round(design_current_a * 100) / 100,
    cable_capacity_a: Math.round(cable_capacity_a * 100) / 100,
    voltage_drop_v: Math.round(voltage_drop_v * 100) / 100,
    voltage_drop_percent: Math.round(voltage_drop_percent * 100) / 100,
    derating_factor: Math.round(derating_factor * 1000) / 1000,
    cable_designation,
    cost_per_meter,
    total_cable_cost: Math.round(cost_per_meter * length_meters * 100) / 100,
    compliant,
    warnings,
  }
}

// =====================================================
// Load Calculation Engine
// =====================================================

/**
 * Calculate total electrical load with diversity factors.
 * Determines main breaker size and supply requirements.
 */
export function calculateLoad(
  loads: LoadEntry[],
  phase: PhaseType,
  building_type: 'residential' | 'commercial' | 'industrial' = 'residential'
): LoadAnalysisResult {
  const warnings: string[] = []

  // Select diversity factors based on building type
  const diversityFactors = building_type === 'commercial'
    ? { ...DEFAULT_DIVERSITY_COMMERCIAL }
    : { ...DEFAULT_DIVERSITY_RESIDENTIAL }

  // Calculate per-category breakdown
  const categoryMap = new Map<LoadCategory, { connected: number; count: number }>()
  const phaseLoads = { phase_1_w: 0, phase_2_w: 0, phase_3_w: 0 }

  let totalConnected = 0
  let totalDemand = 0

  for (const load of loads) {
    const connected = load.rated_power_watts * load.quantity
    const demandFactor = load.demand_factor ?? diversityFactors[load.category] ?? 0.5
    const demand = connected * demandFactor

    totalConnected += connected
    totalDemand += demand

    // Track per category
    const cat = categoryMap.get(load.category) ?? { connected: 0, count: 0 }
    cat.connected += connected
    cat.count += load.quantity
    categoryMap.set(load.category, cat)

    // Phase distribution
    if (phase === '3-phase') {
      const assignment = load.phase_assignment ?? autoAssignPhase(phaseLoads)
      switch (assignment) {
        case 1: phaseLoads.phase_1_w += demand; break
        case 2: phaseLoads.phase_2_w += demand; break
        case 3: phaseLoads.phase_3_w += demand; break
      }
    } else {
      phaseLoads.phase_1_w += demand
    }
  }

  // Phase imbalance check
  let phaseImbalance = 0
  if (phase === '3-phase') {
    const avg = (phaseLoads.phase_1_w + phaseLoads.phase_2_w + phaseLoads.phase_3_w) / 3
    if (avg > 0) {
      const maxDev = Math.max(
        Math.abs(phaseLoads.phase_1_w - avg),
        Math.abs(phaseLoads.phase_2_w - avg),
        Math.abs(phaseLoads.phase_3_w - avg)
      )
      phaseImbalance = (maxDev / avg) * 100
    }
  }

  // Calculate total current
  const voltage = phase === '1-phase' ? 230 : 400
  const totalCurrent = phase === '1-phase'
    ? totalDemand / voltage
    : totalDemand / (Math.sqrt(3) * voltage)

  // Determine main breaker
  const recommendedBreaker = selectBreakerRating(totalCurrent)

  // Supply fuse recommendation (next standard size above main breaker)
  const supplyFuseIdx = BREAKER_RATINGS.indexOf(recommendedBreaker)
  const recommendedFuse = supplyFuseIdx < BREAKER_RATINGS.length - 1
    ? BREAKER_RATINGS[supplyFuseIdx + 1]
    : recommendedBreaker

  // Build category breakdown
  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => {
    const factor = diversityFactors[category] ?? 0.5
    return {
      category,
      connected_load_w: Math.round(data.connected),
      demand_factor: factor,
      demand_load_w: Math.round(data.connected * factor),
      count: data.count,
    }
  })

  // Warnings
  if (phaseImbalance > 20) {
    warnings.push(`Fasebelastning er skæv med ${phaseImbalance.toFixed(0)}% afvigelse - overvej omfordeling`)
  }
  if (totalCurrent > 63 && phase === '1-phase') {
    warnings.push('Totalbelastning kræver 3-faset forsyning')
  }
  if (totalDemand > 17000 && phase === '1-phase') {
    warnings.push('Samlet effektbehov overskrider typisk 1-faset tilslutning (25A × 230V = 5750W per fase)')
  }

  return {
    total_connected_load_w: Math.round(totalConnected),
    total_demand_load_w: Math.round(totalDemand),
    total_demand_current_a: Math.round(totalCurrent * 100) / 100,
    phase_loads: {
      phase_1_w: Math.round(phaseLoads.phase_1_w),
      phase_2_w: Math.round(phaseLoads.phase_2_w),
      phase_3_w: Math.round(phaseLoads.phase_3_w),
    },
    phase_imbalance_percent: Math.round(phaseImbalance * 10) / 10,
    recommended_main_breaker_a: recommendedBreaker,
    supply_adequate: true, // Will be checked at project level
    recommended_supply_fuse_a: recommendedFuse,
    diversity_factors_used: diversityFactors,
    category_breakdown: categoryBreakdown,
    warnings,
  }
}

// =====================================================
// Panel Configuration Engine
// =====================================================

/**
 * Configure a distribution panel based on loads and rooms.
 * Groups circuits by area and type, assigns breakers and RCD protection.
 */
export function configurePanelFromLoads(
  loads: LoadEntry[],
  rooms: ElectricalRoomInput[],
  phase: PhaseType,
  is_renovation: boolean
): PanelConfiguration {
  const circuits: CircuitConfig[] = []
  const warnings: string[] = []
  const compliance_notes: string[] = []
  let position = 1

  // Phase load tracking for balanced distribution
  const phaseLoadTracker = { 1: 0, 2: 0, 3: 0 }

  // Group loads by room and type for circuit creation
  for (const room of rooms) {
    const roomLoads = room.loads
    if (roomLoads.length === 0) continue

    // Separate by circuit requirements
    const lightingLoads = roomLoads.filter(l => l.category === 'lighting')
    const outletLoads = roomLoads.filter(l => l.category === 'socket_outlet')
    const heavyLoads = roomLoads.filter(l =>
      l.category === 'fixed_appliance' || l.category === 'cooking' || l.category === 'ev_charger'
    )
    const heatingLoads = roomLoads.filter(l => l.category === 'heating')
    const otherLoads = roomLoads.filter(l =>
      !['lighting', 'socket_outlet', 'fixed_appliance', 'cooking', 'ev_charger', 'heating'].includes(l.category)
    )

    // Lighting circuit(s)
    if (lightingLoads.length > 0) {
      const totalLightW = lightingLoads.reduce((s, l) => s + l.rated_power_watts * l.quantity, 0)
      const circuitCount = Math.ceil(totalLightW / 2300) // Max ~10A on lighting circuit
      const wPerCircuit = totalLightW / circuitCount

      for (let i = 0; i < circuitCount; i++) {
        const ph = phase === '3-phase' ? getLeastLoadedPhase(phaseLoadTracker) : 1
        phaseLoadTracker[ph as 1 | 2 | 3] += wPerCircuit

        circuits.push({
          position: position++,
          description: circuitCount > 1
            ? `Belysning ${room.name} (${i + 1}/${circuitCount})`
            : `Belysning ${room.name}`,
          breaker_type: 'MCB',
          rating_a: 10,
          characteristic: 'B',
          phase: ph as 1 | 2 | 3,
          cable_cross_section: 1.5,
          cable_type: 'PVT',
          connected_load_w: Math.round(wPerCircuit),
          load_category: 'lighting',
          area: room.name,
          point_count: Math.ceil(lightingLoads.reduce((s, l) => s + l.quantity, 0) / circuitCount),
        })
      }
    }

    // Outlet circuit(s) - max 10 outlets per 16A circuit (Danish practice)
    if (outletLoads.length > 0) {
      const totalOutlets = outletLoads.reduce((s, l) => s + l.quantity, 0)
      const totalOutletW = outletLoads.reduce((s, l) => s + l.rated_power_watts * l.quantity, 0)
      const maxOutletsPerCircuit = 10
      const circuitCount = Math.max(
        Math.ceil(totalOutlets / maxOutletsPerCircuit),
        Math.ceil(totalOutletW / 3680) // Max 16A × 230V
      )
      const wPerCircuit = totalOutletW / circuitCount
      const outletsPerCircuit = Math.ceil(totalOutlets / circuitCount)

      for (let i = 0; i < circuitCount; i++) {
        const ph = phase === '3-phase' ? getLeastLoadedPhase(phaseLoadTracker) : 1
        phaseLoadTracker[ph as 1 | 2 | 3] += wPerCircuit

        circuits.push({
          position: position++,
          description: circuitCount > 1
            ? `Stikkontakter ${room.name} (${i + 1}/${circuitCount})`
            : `Stikkontakter ${room.name}`,
          breaker_type: room.is_wet_room ? 'RCBO' : 'MCB',
          rating_a: 16,
          characteristic: 'B',
          phase: ph as 1 | 2 | 3,
          cable_cross_section: 2.5,
          cable_type: 'PVT',
          rcd_type: room.is_wet_room ? 'A' : undefined,
          rcd_sensitivity_ma: room.is_wet_room ? 30 : undefined,
          connected_load_w: Math.round(wPerCircuit),
          load_category: 'socket_outlet',
          area: room.name,
          point_count: outletsPerCircuit,
        })
      }
    }

    // Heavy load circuits (dedicated per appliance)
    for (const load of heavyLoads) {
      const totalW = load.rated_power_watts * load.quantity
      const current = totalW / 230
      const breakerRating = selectBreakerRating(current)
      const cableSize = selectCableForBreaker(breakerRating)
      const isEV = load.category === 'ev_charger'
      const ph = phase === '3-phase' ? getLeastLoadedPhase(phaseLoadTracker) : 1
      phaseLoadTracker[ph as 1 | 2 | 3] += totalW

      circuits.push({
        position: position++,
        description: `${load.description} (${room.name})`,
        breaker_type: isEV ? 'RCBO' : 'MCB',
        rating_a: breakerRating,
        characteristic: load.category === 'motor' ? 'C' : 'B',
        phase: ph as 1 | 2 | 3,
        cable_cross_section: cableSize,
        cable_type: 'PVT',
        rcd_type: isEV ? 'B' : undefined,
        rcd_sensitivity_ma: isEV ? 30 : undefined,
        connected_load_w: Math.round(totalW),
        load_category: load.category,
        area: room.name,
      })

      if (isEV) {
        compliance_notes.push('EV-lader kræver RCD Type B (30mA) iht. DS/HD 60364-7-722')
      }
    }

    // Heating circuits
    for (const load of heatingLoads) {
      const totalW = load.rated_power_watts * load.quantity
      const current = totalW / 230
      const breakerRating = selectBreakerRating(current)
      const cableSize = selectCableForBreaker(breakerRating)
      const ph = phase === '3-phase' ? getLeastLoadedPhase(phaseLoadTracker) : 1
      phaseLoadTracker[ph as 1 | 2 | 3] += totalW

      circuits.push({
        position: position++,
        description: `${load.description} (${room.name})`,
        breaker_type: room.is_wet_room ? 'RCBO' : 'MCB',
        rating_a: breakerRating,
        characteristic: 'B',
        phase: ph as 1 | 2 | 3,
        cable_cross_section: cableSize,
        cable_type: 'PVT',
        rcd_type: room.is_wet_room ? 'A' : undefined,
        rcd_sensitivity_ma: room.is_wet_room ? 30 : undefined,
        connected_load_w: Math.round(totalW),
        load_category: 'heating',
        area: room.name,
      })
    }

    // Other loads
    for (const load of otherLoads) {
      const totalW = load.rated_power_watts * load.quantity
      const ph = phase === '3-phase' ? getLeastLoadedPhase(phaseLoadTracker) : 1
      phaseLoadTracker[ph as 1 | 2 | 3] += totalW

      circuits.push({
        position: position++,
        description: `${load.description} (${room.name})`,
        breaker_type: 'MCB',
        rating_a: 16,
        characteristic: 'B',
        phase: ph as 1 | 2 | 3,
        cable_cross_section: 2.5,
        cable_type: 'PVT',
        connected_load_w: Math.round(totalW),
        load_category: load.category,
        area: room.name,
      })
    }

    // Wet room compliance
    if (room.is_wet_room) {
      compliance_notes.push(`${room.name}: Alle kredsløb kræver HPFI/RCD 30mA iht. DS/HD 60364-7-701`)
    }
  }

  // Determine RCD groups (group MCB circuits under shared RCDs)
  const rcd_groups = buildRCDGroups(circuits, phase)

  // Calculate modules needed
  let modulesUsed = 2 // Main switch (2 modules for single-phase, 4 for three-phase)
  if (phase === '3-phase') modulesUsed = 4

  for (const group of rcd_groups) {
    modulesUsed += group.modules
  }
  for (const circuit of circuits) {
    if (circuit.breaker_type === 'RCBO') {
      modulesUsed += 2
    } else {
      modulesUsed += 1
    }
  }

  // Surge protection
  const surgeRequired = true // Standard in Danish installations
  const surgeModules = 3
  modulesUsed += surgeModules

  // Select panel size (with 20% spare capacity)
  const minModules = Math.ceil(modulesUsed * 1.2)
  const panelSizes = [12, 24, 36, 48, 72]
  const totalModules = panelSizes.find(s => s >= minModules) ?? 72

  // Main switch rating
  const totalLoad = circuits.reduce((s, c) => s + c.connected_load_w, 0)
  const mainCurrent = phase === '1-phase'
    ? totalLoad / 230
    : totalLoad / (Math.sqrt(3) * 400)
  const mainSwitchRating = selectBreakerRating(mainCurrent * 0.6) // With diversity

  // Cost calculation
  const costBreakdown = calculatePanelCosts(circuits, rcd_groups, totalModules, surgeRequired, mainSwitchRating)

  // Time estimation (panel work is significant)
  const baseTimeSec = 3600 // 1 hour base for panel setup
  const perCircuitTimeSec = 900 // 15 min per circuit
  const estimatedTime = baseTimeSec + circuits.length * perCircuitTimeSec

  if (is_renovation) {
    compliance_notes.push('Renovering: Eksisterende installation skal undersøges for kompatibilitet')
    warnings.push('Ved renovering bør eksisterende HPFI/RCD og jordingsforhold kontrolleres')
  }

  const sparePercent = ((totalModules - modulesUsed) / totalModules) * 100

  if (sparePercent < 15) {
    warnings.push('Lav reservekapacitet i tavlen - overvej større tavle for fremtidige udvidelser')
  }

  return {
    name: 'Hovedtavle',
    panel_type: 'main',
    total_modules: totalModules,
    modules_used: modulesUsed,
    spare_capacity_percent: Math.round(sparePercent),
    main_switch_rating_a: mainSwitchRating,
    phase_type: phase,
    rcd_groups,
    circuits,
    surge_protection: {
      required: surgeRequired,
      type: 'Type2',
      modules: surgeModules,
    },
    estimated_material_cost: costBreakdown.reduce((s, c) => s + c.total_cost, 0),
    estimated_time_seconds: estimatedTime,
    cost_breakdown: costBreakdown,
    compliance_notes,
    warnings,
  }
}

// =====================================================
// Compliance Check Engine
// =====================================================

/**
 * Run compliance checks against Danish electrical standards.
 * Checks: RCD protection, cable sizing, voltage drop, circuit grouping, etc.
 */
export function checkCompliance(
  panel: PanelConfiguration,
  cableSizing: CableSizingResult[],
  rooms: ElectricalRoomInput[]
): ComplianceCheckResult {
  const issues: ComplianceIssue[] = []

  // DS/HD 60364-4-41: RCD protection for socket outlets ≤32A
  for (const circuit of panel.circuits) {
    if (circuit.load_category === 'socket_outlet' && circuit.rating_a <= 32) {
      const hasRCD = circuit.breaker_type === 'RCBO' ||
        panel.rcd_groups.some(g => g.circuits.includes(circuit.position))
      if (!hasRCD) {
        issues.push({
          code: 'RCD_SOCKET',
          severity: 'error',
          standard_ref: 'DS/HD 60364-4-41 §411.3.3',
          description: `Stikkontaktkreds "${circuit.description}" mangler HPFI/RCD-beskyttelse`,
          affected_area: circuit.area,
          recommendation: 'Tilføj HPFI/RCD 30mA beskyttelse til alle stikkontaktkredse ≤32A',
        })
      }
    }
  }

  // DS/HD 60364-7-701: Wet room protection
  for (const room of rooms) {
    if (!room.is_wet_room) continue
    const roomCircuits = panel.circuits.filter(c => c.area === room.name)
    for (const circuit of roomCircuits) {
      const hasRCD30 = (circuit.breaker_type === 'RCBO' && circuit.rcd_sensitivity_ma === 30) ||
        panel.rcd_groups.some(g =>
          g.circuits.includes(circuit.position) && g.sensitivity_ma <= 30
        )
      if (!hasRCD30) {
        issues.push({
          code: 'RCD_WET_ROOM',
          severity: 'error',
          standard_ref: 'DS/HD 60364-7-701 §701.411.3.3',
          description: `Kreds "${circuit.description}" i vådrum "${room.name}" mangler 30mA HPFI`,
          affected_area: room.name,
          recommendation: 'Alle kredse i vådrum skal have HPFI/RCD ≤30mA',
        })
      }
    }
  }

  // DS/HD 60364-7-722: EV charger Type B RCD
  for (const circuit of panel.circuits) {
    if (circuit.load_category === 'ev_charger') {
      if (circuit.rcd_type !== 'B') {
        issues.push({
          code: 'EV_RCD_TYPE',
          severity: 'error',
          standard_ref: 'DS/HD 60364-7-722 §722.531.3.101',
          description: `EV-lader kreds "${circuit.description}" kræver RCD Type B`,
          affected_area: circuit.area,
          recommendation: 'EV-ladere med DC-fejlstrøm kræver RCD Type B (eller Type A med DC-fejlstrømsdetektering)',
        })
      }
    }
  }

  // Cable-breaker coordination check
  for (const circuit of panel.circuits) {
    const maxCableCurrent = getMaxCurrentForCable(circuit.cable_cross_section, 'B2', 3)
    if (maxCableCurrent < circuit.rating_a) {
      issues.push({
        code: 'CABLE_BREAKER_MISMATCH',
        severity: 'error',
        standard_ref: 'DS/HD 60364-4-43 §433.1',
        description: `Kabel ${circuit.cable_cross_section}mm² (${maxCableCurrent}A) kan ikke beskyttes af ${circuit.rating_a}A sikring`,
        affected_area: circuit.area,
        recommendation: `Brug minimum ${selectCableForBreaker(circuit.rating_a)}mm² kabel eller reducer sikringsstørrelsen`,
      })
    }
  }

  // Voltage drop check
  for (const cable of cableSizing) {
    if (!cable.compliant) {
      issues.push({
        code: 'VOLTAGE_DROP',
        severity: 'warning',
        standard_ref: 'DS/HD 60364-5-52 §525',
        description: `Spændingsfald ${cable.voltage_drop_percent}% overstiger anbefalet grænse`,
        recommendation: 'Øg kabeltværsnit eller reducer kabelafstand',
      })
    }
  }

  // Phase balance check (3-phase)
  if (panel.phase_type === '3-phase') {
    const phaseLoads = [0, 0, 0]
    for (const circuit of panel.circuits) {
      phaseLoads[circuit.phase - 1] += circuit.connected_load_w
    }
    const avg = (phaseLoads[0] + phaseLoads[1] + phaseLoads[2]) / 3
    if (avg > 0) {
      const maxImbalance = Math.max(...phaseLoads.map(p => Math.abs(p - avg) / avg)) * 100
      if (maxImbalance > 25) {
        issues.push({
          code: 'PHASE_IMBALANCE',
          severity: 'warning',
          standard_ref: 'DS/HD 60364-5-52',
          description: `Fasebelastning er ${maxImbalance.toFixed(0)}% skæv - anbefalet max 20%`,
          recommendation: 'Omfordel kredsløb mellem faserne for bedre balance',
        })
      }
    }
  }

  // Spare capacity check
  if (panel.spare_capacity_percent < 10) {
    issues.push({
      code: 'SPARE_CAPACITY',
      severity: 'warning',
      standard_ref: 'Generel god praksis',
      description: `Kun ${panel.spare_capacity_percent}% ledig kapacitet i tavlen`,
      recommendation: 'Overvej større tavle for fremtidige udvidelser (min. 20% reserve anbefales)',
    })
  }

  // Surge protection check
  if (!panel.surge_protection.required) {
    issues.push({
      code: 'SURGE_PROTECTION',
      severity: 'info',
      standard_ref: 'DS/HD 60364-4-44 §443',
      description: 'Overspændingsbeskyttelse er anbefalet for alle nye installationer',
      recommendation: 'Installer Type 2 overspændingsbeskyttelse i hovedtavlen',
    })
  }

  const errors = issues.filter(i => i.severity === 'error').length
  const warningsCount = issues.filter(i => i.severity === 'warning').length
  const info = issues.filter(i => i.severity === 'info').length

  return {
    compliant: errors === 0,
    issues,
    summary: { errors, warnings: warningsCount, info },
    standards_checked: [
      'DS/HD 60364-3 (Lastberegning)',
      'DS/HD 60364-4-41 (Beskyttelse mod elektrisk stød)',
      'DS/HD 60364-4-43 (Overstrømsbeskyttelse)',
      'DS/HD 60364-4-44 (Overspændingsbeskyttelse)',
      'DS/HD 60364-5-52 (Kabelinstallation)',
      'DS/HD 60364-7-701 (Vådrum)',
      'DS/HD 60364-7-722 (EV-ladestandere)',
    ],
  }
}

// =====================================================
// Full Project Calculation
// =====================================================

/**
 * Calculate a complete electrical project.
 * Combines load analysis, panel configuration, cable sizing, and compliance.
 */
export function calculateElectricalProject(input: ElectricalProjectInput): ElectricalProjectResult {
  const warnings: string[] = []

  // 1. Collect all loads
  const allLoads: LoadEntry[] = input.rooms.flatMap(r => r.loads)

  // 2. Load analysis
  const loadAnalysis = calculateLoad(allLoads, input.supply_phase, input.building_type)
  warnings.push(...loadAnalysis.warnings)

  // Check supply adequacy
  if (input.existing_main_fuse_a) {
    loadAnalysis.supply_adequate = loadAnalysis.total_demand_current_a <= input.existing_main_fuse_a
    if (!loadAnalysis.supply_adequate) {
      warnings.push(
        `Nuværende hovedsikring ${input.existing_main_fuse_a}A er utilstrækkelig. ` +
        `Behov: ${loadAnalysis.total_demand_current_a.toFixed(0)}A. Opgradering nødvendig.`
      )
    }
  }

  // 3. Panel configuration
  const panel = configurePanelFromLoads(allLoads, input.rooms, input.supply_phase, input.is_renovation)
  warnings.push(...panel.warnings)

  // 4. Cable sizing for each circuit
  const cableSizing: CableSizingResult[] = panel.circuits.map(circuit => {
    // Estimate cable length based on room
    const room = input.rooms.find(r => r.name === circuit.area)
    const cableLength = room?.cable_distance_m ?? estimateCableLength(room, input.max_cable_run_m)

    return calculateCableSize({
      power_watts: circuit.connected_load_w,
      voltage: circuit.phase === 1 && input.supply_phase === '1-phase' ? 230 : 230,
      phase: '1-phase', // Individual circuits are typically single-phase
      power_factor: circuit.load_category === 'motor' ? 0.8 : 1.0,
      length_meters: cableLength,
      installation_method: input.default_installation_method,
      core_count: 3,
      cable_type: circuit.cable_type,
      circuit_description: circuit.description,
    })
  })

  // 5. Compliance check
  const compliance = checkCompliance(panel, cableSizing, input.rooms)
  warnings.push(...compliance.issues.filter(i => i.severity === 'warning').map(i => i.description))

  // 6. Build room summaries
  const roomSummaries = input.rooms.map(room => {
    const roomCircuits = panel.circuits.filter(c => c.area === room.name)
    const roomCables = cableSizing.filter((_, idx) =>
      panel.circuits[idx]?.area === room.name
    )

    return {
      room_name: room.name,
      room_type: room.room_type,
      total_load_w: roomCircuits.reduce((s, c) => s + c.connected_load_w, 0),
      circuit_count: roomCircuits.length,
      cable_meters: roomCables.reduce((s, c) => s + (room.cable_distance_m ?? 15), 0),
      material_cost: roomCables.reduce((s, c) => s + c.total_cable_cost, 0),
      labor_time_seconds: roomCircuits.length * 900, // 15 min per circuit baseline
    }
  })

  // 7. Totals
  const totalCableMeters = cableSizing.reduce((s, c) => {
    const circuit = panel.circuits[cableSizing.indexOf(c)]
    const room = input.rooms.find(r => r.name === circuit?.area)
    return s + (room?.cable_distance_m ?? 15)
  }, 0)

  const totalElectricalMaterial = panel.estimated_material_cost +
    cableSizing.reduce((s, c) => s + c.total_cable_cost, 0)

  const totalElectricalLabor = panel.estimated_time_seconds +
    roomSummaries.reduce((s, r) => s + r.labor_time_seconds, 0)

  return {
    load_analysis: loadAnalysis,
    panel,
    cable_sizing: cableSizing,
    compliance,
    room_summaries: roomSummaries,
    total_cable_meters: Math.round(totalCableMeters),
    total_electrical_material_cost: Math.round(totalElectricalMaterial),
    total_electrical_labor_seconds: totalElectricalLabor,
    warnings: [...new Set(warnings)], // Deduplicate
  }
}

// =====================================================
// Helper Functions
// =====================================================

function getTemperatureCorrection(tempC: number): number {
  // Find closest entry
  const temps = Object.keys(TEMP_CORRECTION).map(Number).sort((a, b) => a - b)
  let closest = temps[0]
  for (const t of temps) {
    if (Math.abs(t - tempC) < Math.abs(closest - tempC)) closest = t
  }
  return TEMP_CORRECTION[closest] ?? 1.0
}

function getGroupingCorrection(count: number): number {
  if (count <= 1) return 1.0
  const counts = Object.keys(GROUPING_CORRECTION).map(Number).sort((a, b) => a - b)
  let closest = counts[0]
  for (const c of counts) {
    if (c <= count) closest = c
  }
  return GROUPING_CORRECTION[closest] ?? 0.38
}

function findMinCrossSectionByCurrent(
  current: number,
  method: InstallationMethod,
  coreCount: CoreCount
): CableCrossSection {
  const capacityTable = CURRENT_CAPACITY[method]?.[coreCount]
  if (!capacityTable) return 2.5 // Safe default

  for (const size of CABLE_SIZES) {
    const capacity = capacityTable[size]
    if (capacity && capacity >= current) return size
  }
  return 120 // Maximum available
}

function findMinCrossSectionByVoltageDrop(
  current: number,
  length: number,
  voltage: number,
  phase: PhaseType,
  maxDropPercent: number
): CableCrossSection {
  const maxDropV = (maxDropPercent / 100) * voltage

  for (const size of CABLE_SIZES) {
    const drop = phase === '1-phase'
      ? (2 * length * current * COPPER_RESISTIVITY_70C) / size
      : (Math.sqrt(3) * length * current * COPPER_RESISTIVITY_70C) / size

    if (drop <= maxDropV) return size
  }
  return 120
}

function calculateVoltageDrop(
  current: number,
  length: number,
  crossSection: CableCrossSection,
  voltage: number,
  phase: PhaseType
): { voltage_drop_v: number; voltage_drop_percent: number } {
  const drop = phase === '1-phase'
    ? (2 * length * current * COPPER_RESISTIVITY_70C) / crossSection
    : (Math.sqrt(3) * length * current * COPPER_RESISTIVITY_70C) / crossSection

  return {
    voltage_drop_v: drop,
    voltage_drop_percent: (drop / voltage) * 100,
  }
}

function selectLargerCrossSection(a: CableCrossSection, b: CableCrossSection): CableCrossSection {
  return a >= b ? a : b
}

function selectBreakerRating(current: number): BreakerRating {
  for (const rating of BREAKER_RATINGS) {
    if (rating >= current) return rating
  }
  return 100
}

function selectCableForBreaker(breakerRating: BreakerRating): CableCrossSection {
  // Cable must be rated ≥ breaker rating (Ib ≤ In ≤ Iz)
  // Using method B2 (most common) as reference
  const mapping: Partial<Record<BreakerRating, CableCrossSection>> = {
    6: 1.5, 10: 1.5, 13: 1.5, 16: 2.5, 20: 2.5,
    25: 4, 32: 6, 40: 10, 50: 16, 63: 16, 80: 25, 100: 35,
  }
  return mapping[breakerRating] ?? 2.5
}

function getMaxCurrentForCable(
  crossSection: CableCrossSection,
  method: InstallationMethod,
  coreCount: CoreCount
): number {
  return CURRENT_CAPACITY[method]?.[coreCount]?.[crossSection] ?? 0
}

function estimateCableCost(cableType: CableType, crossSection: CableCrossSection): number {
  // Rough estimate if not in table
  const baseCost = crossSection * 3 // ~3 DKK per mm² per meter for PVT
  const typeMultiplier = cableType === 'NOIKLX' ? 2.0 : cableType === 'PFSP' ? 2.5 : 1.0
  return Math.round(baseCost * typeMultiplier)
}

function autoAssignPhase(tracker: { phase_1_w: number; phase_2_w: number; phase_3_w: number }): 1 | 2 | 3 {
  if (tracker.phase_1_w <= tracker.phase_2_w && tracker.phase_1_w <= tracker.phase_3_w) return 1
  if (tracker.phase_2_w <= tracker.phase_3_w) return 2
  return 3
}

function getLeastLoadedPhase(tracker: Record<number, number>): number {
  const loads = [
    { phase: 1, load: tracker[1] ?? 0 },
    { phase: 2, load: tracker[2] ?? 0 },
    { phase: 3, load: tracker[3] ?? 0 },
  ]
  loads.sort((a, b) => a.load - b.load)
  return loads[0].phase
}

function buildRCDGroups(
  circuits: CircuitConfig[],
  phase: PhaseType
): PanelConfiguration['rcd_groups'] {
  const groups: PanelConfiguration['rcd_groups'] = []

  // Circuits without individual RCD protection need group RCD
  const unprotectedCircuits = circuits.filter(c => c.breaker_type === 'MCB')

  if (unprotectedCircuits.length === 0) return groups

  // Danish standard: All socket outlet circuits ≤32A must have RCD
  // Group them under shared RCD groups (max 6 circuits per RCD group)
  const maxCircuitsPerGroup = 6

  // Separate socket outlets (require RCD) from lighting (can share)
  const socketCircuits = unprotectedCircuits.filter(c => c.load_category === 'socket_outlet')
  const otherCircuits = unprotectedCircuits.filter(c => c.load_category !== 'socket_outlet')

  // Socket outlet RCD groups
  for (let i = 0; i < socketCircuits.length; i += maxCircuitsPerGroup) {
    const batch = socketCircuits.slice(i, i + maxCircuitsPerGroup)
    const groupLoad = batch.reduce((s, c) => s + c.connected_load_w, 0)
    const ratingNeeded = selectBreakerRating(groupLoad / 230 * 0.5) // With diversity

    groups.push({
      description: `HPFI stikkontakter (gruppe ${groups.length + 1})`,
      rcd_type: 'A',
      sensitivity_ma: 30,
      rating_a: Math.max(ratingNeeded, 40) as BreakerRating,
      circuits: batch.map(c => c.position),
      modules: 2,
    })
  }

  // Lighting and other circuits - group RCD (optional but recommended)
  if (otherCircuits.length > 0) {
    for (let i = 0; i < otherCircuits.length; i += maxCircuitsPerGroup) {
      const batch = otherCircuits.slice(i, i + maxCircuitsPerGroup)
      groups.push({
        description: `HPFI belysning/øvrige (gruppe ${groups.length + 1})`,
        rcd_type: 'A',
        sensitivity_ma: 30,
        rating_a: 40,
        circuits: batch.map(c => c.position),
        modules: 2,
      })
    }
  }

  return groups
}

function calculatePanelCosts(
  circuits: CircuitConfig[],
  rcdGroups: PanelConfiguration['rcd_groups'],
  panelModules: number,
  surgeProtection: boolean,
  mainSwitchRating: BreakerRating
): PanelConfiguration['cost_breakdown'] {
  const costs: PanelConfiguration['cost_breakdown'] = []

  // Panel enclosure
  const panelCost = PANEL_COSTS[panelModules] ?? 1500
  costs.push({ item: `Tavle ${panelModules} moduler`, quantity: 1, unit_cost: panelCost, total_cost: panelCost })

  // Main switch
  const mainSwitchCost = 350 + (mainSwitchRating > 40 ? 200 : 0)
  costs.push({ item: `Hovedafbryder ${mainSwitchRating}A`, quantity: 1, unit_cost: mainSwitchCost, total_cost: mainSwitchCost })

  // Breakers per circuit
  const breakerCounts = new Map<string, { count: number; cost: number }>()
  for (const circuit of circuits) {
    const key = `${circuit.breaker_type} ${circuit.rating_a}A ${circuit.characteristic}`
    const existing = breakerCounts.get(key) ?? { count: 0, cost: 0 }
    const costEntry = BREAKER_COSTS.find(b =>
      b.breaker_type === circuit.breaker_type &&
      b.rating_a === circuit.rating_a
    )
    existing.count++
    existing.cost = costEntry?.cost_dkk ?? (circuit.breaker_type === 'RCBO' ? 480 : 95)
    breakerCounts.set(key, existing)
  }

  for (const [key, data] of breakerCounts) {
    costs.push({ item: key, quantity: data.count, unit_cost: data.cost, total_cost: data.count * data.cost })
  }

  // RCD groups
  for (const group of rcdGroups) {
    const rcdCost = BREAKER_COSTS.find(b =>
      b.breaker_type === 'RCD' && b.rcd_type === group.rcd_type && b.rating_a === group.rating_a
    )?.cost_dkk ?? 750
    costs.push({
      item: `${group.description}`,
      quantity: 1,
      unit_cost: rcdCost,
      total_cost: rcdCost,
    })
  }

  // Surge protection
  if (surgeProtection) {
    costs.push({
      item: 'Overspændingsbeskyttelse Type 2',
      quantity: 1,
      unit_cost: SURGE_PROTECTION_COST.Type2,
      total_cost: SURGE_PROTECTION_COST.Type2,
    })
  }

  // Miscellaneous (bus bars, terminals, labels, etc.)
  const miscCost = Math.round(circuits.length * 25 + 200) // ~25 DKK per circuit + base
  costs.push({ item: 'Skinner, klemmer, mærkning', quantity: 1, unit_cost: miscCost, total_cost: miscCost })

  return costs
}

function estimateCableLength(
  room: ElectricalRoomInput | undefined,
  maxRun?: number
): number {
  if (!room) return 15 // Default 15m
  // Estimate based on floor and room size
  const baseLength = Math.sqrt(room.area_m2) * 2 // Diagonal + routing
  const floorLength = room.floor * 3 // 3m per floor
  const estimated = baseLength + floorLength + 3 // +3m for panel entry
  return Math.min(estimated, maxRun ?? 50)
}

// =====================================================
// Exported Reference Data (for UI/display)
// =====================================================

export { CABLE_SIZES, BREAKER_RATINGS, CURRENT_CAPACITY, CABLE_COSTS, BREAKER_COSTS }
export { DEFAULT_DIVERSITY_RESIDENTIAL, DEFAULT_DIVERSITY_COMMERCIAL }
