/**
 * Electrical Calculation Types
 *
 * Types for professional electrical calculations based on
 * Danish DS/HD 60364 standards and IEC 60364-5-52.
 *
 * Covers: cable sizing, load calculations, panel configuration,
 * voltage drop, breaker sizing, RCD requirements, and compliance.
 */

// =====================================================
// Cable Sizing
// =====================================================

/** Installation method per IEC 60364-5-52 Table B.52.1 */
export type InstallationMethod =
  | 'A1' // Insulated conductors in conduit in thermally insulating wall
  | 'A2' // Multi-core cable in conduit in thermally insulating wall
  | 'B1' // Insulated conductors in conduit on wall
  | 'B2' // Multi-core cable in conduit on wall
  | 'C'  // Multi-core cable clipped direct to wall
  | 'E'  // Multi-core cable on perforated cable tray
  | 'F'  // Single-core cables touching on cable tray

/** Standard cable cross-sections in mm² */
export type CableCrossSection = 1.5 | 2.5 | 4 | 6 | 10 | 16 | 25 | 35 | 50 | 70 | 95 | 120

/** Cable type commonly used in Danish installations */
export type CableType =
  | 'PVT'       // Standard installation cable (most common)
  | 'NOIKLX'    // Armoured cable for underground/outdoor
  | 'PR'        // Flexible cable
  | 'PFSP'      // Shielded cable for data/sensitive
  | 'FK'        // Halogen-free cable

/** Number of loaded cores */
export type CoreCount = 2 | 3

/** Phase configuration */
export type PhaseType = '1-phase' | '3-phase'

/** Cable sizing input parameters */
export interface CableSizingInput {
  /** Load power in watts */
  power_watts: number
  /** Voltage (230V single-phase, 400V three-phase) */
  voltage: number
  /** Phase configuration */
  phase: PhaseType
  /** Power factor (cos φ), default 1.0 for resistive loads */
  power_factor: number
  /** Cable length in meters (one way) */
  length_meters: number
  /** Installation method */
  installation_method: InstallationMethod
  /** Number of loaded cores */
  core_count: CoreCount
  /** Ambient temperature in °C (default 30°C) */
  ambient_temp_c?: number
  /** Number of grouped cables (for derating) */
  grouped_cables?: number
  /** Cable type */
  cable_type?: CableType
  /** Maximum allowed voltage drop percentage (default 4%) */
  max_voltage_drop_percent?: number
  /** Description for the circuit */
  circuit_description?: string
}

/** Cable sizing calculation result */
export interface CableSizingResult {
  /** Recommended cable cross-section in mm² */
  recommended_cross_section: CableCrossSection
  /** Minimum cross-section based on current only */
  min_cross_section_current: CableCrossSection
  /** Minimum cross-section based on voltage drop */
  min_cross_section_voltage_drop: CableCrossSection
  /** Design current in amperes */
  design_current_a: number
  /** Current carrying capacity of selected cable */
  cable_capacity_a: number
  /** Voltage drop in volts */
  voltage_drop_v: number
  /** Voltage drop as percentage */
  voltage_drop_percent: number
  /** Derating factor applied */
  derating_factor: number
  /** Cable designation string (e.g., "PVT 3G2.5") */
  cable_designation: string
  /** Estimated cable cost per meter in DKK */
  cost_per_meter: number
  /** Total cable cost */
  total_cable_cost: number
  /** Whether the result passes all checks */
  compliant: boolean
  /** Any warnings */
  warnings: string[]
}

// =====================================================
// Load Calculation
// =====================================================

/** Load type classification */
export type LoadCategory =
  | 'lighting'
  | 'socket_outlet'
  | 'fixed_appliance'
  | 'motor'
  | 'heating'
  | 'cooking'
  | 'ev_charger'
  | 'data_equipment'

/** Single load entry for load analysis */
export interface LoadEntry {
  /** Description */
  description: string
  /** Load category */
  category: LoadCategory
  /** Rated power in watts */
  rated_power_watts: number
  /** Quantity */
  quantity: number
  /** Power factor (cos φ) */
  power_factor: number
  /** Phase assignment (1, 2, 3 for three-phase, or 1 for single-phase) */
  phase_assignment?: 1 | 2 | 3
  /** Whether this is a continuous load (>3 hours) */
  is_continuous?: boolean
  /** Demand factor override (0-1). If not set, standard factors are used. */
  demand_factor?: number
}

/** Diversity/demand factors per DS/HD 60364-3 (Danish standards) */
export interface DiversityFactors {
  lighting: number
  socket_outlet: number
  fixed_appliance: number
  motor: number
  heating: number
  cooking: number
  ev_charger: number
  data_equipment: number
}

/** Load calculation result */
export interface LoadAnalysisResult {
  /** Total connected load in watts */
  total_connected_load_w: number
  /** Total demand load after diversity in watts */
  total_demand_load_w: number
  /** Total current after diversity in amperes */
  total_demand_current_a: number
  /** Per-phase breakdown (for 3-phase systems) */
  phase_loads: {
    phase_1_w: number
    phase_2_w: number
    phase_3_w: number
  }
  /** Phase imbalance percentage (max deviation from average) */
  phase_imbalance_percent: number
  /** Recommended main breaker size in amperes */
  recommended_main_breaker_a: number
  /** Whether the existing supply is adequate */
  supply_adequate: boolean
  /** Recommended supply fuse in amperes */
  recommended_supply_fuse_a: number
  /** Diversity factors applied */
  diversity_factors_used: DiversityFactors
  /** Load breakdown by category */
  category_breakdown: {
    category: LoadCategory
    connected_load_w: number
    demand_factor: number
    demand_load_w: number
    count: number
  }[]
  /** Warnings */
  warnings: string[]
}

// =====================================================
// Panel / Distribution Board Configuration
// =====================================================

/** Breaker type */
export type BreakerType =
  | 'MCB'  // Miniature Circuit Breaker
  | 'RCBO' // Combined RCD + MCB
  | 'RCD'  // Residual Current Device (HPFI in Danish)

/** RCD type classification */
export type RCDType =
  | 'A'    // AC + pulsating DC (standard for most circuits)
  | 'B'    // All current types (required for EV chargers, VFDs)
  | 'F'    // Type A + high-frequency components

/** Breaker trip characteristic */
export type BreakerCharacteristic =
  | 'B'  // General use (3-5× In)
  | 'C'  // Motor starting (5-10× In)
  | 'D'  // Heavy inductive loads (10-20× In)

/** Standard breaker current ratings in amperes */
export type BreakerRating = 6 | 10 | 13 | 16 | 20 | 25 | 32 | 40 | 50 | 63 | 80 | 100

/** Single circuit in the panel */
export interface CircuitConfig {
  /** Circuit number/position */
  position: number
  /** Circuit description */
  description: string
  /** Breaker type */
  breaker_type: BreakerType
  /** Current rating */
  rating_a: BreakerRating
  /** Trip characteristic */
  characteristic: BreakerCharacteristic
  /** Phase assignment for 3-phase panels */
  phase: 1 | 2 | 3
  /** Cable cross-section for this circuit */
  cable_cross_section: CableCrossSection
  /** Cable type */
  cable_type: CableType
  /** RCD type (if RCBO or under RCD group) */
  rcd_type?: RCDType
  /** RCD sensitivity in mA */
  rcd_sensitivity_ma?: 10 | 30 | 100 | 300
  /** Connected load on this circuit in watts */
  connected_load_w: number
  /** Load category */
  load_category: LoadCategory
  /** Associated room/area */
  area?: string
  /** Number of outlets/points on this circuit */
  point_count?: number
}

/** Complete panel/distribution board configuration */
export interface PanelConfiguration {
  /** Panel name/identifier */
  name: string
  /** Panel type */
  panel_type: 'main' | 'sub'
  /** Total module slots available */
  total_modules: number
  /** Modules used */
  modules_used: number
  /** Spare capacity percentage */
  spare_capacity_percent: number
  /** Main switch rating */
  main_switch_rating_a: BreakerRating
  /** Phase type */
  phase_type: PhaseType
  /** RCD/HPFI protection groups */
  rcd_groups: {
    description: string
    rcd_type: RCDType
    sensitivity_ma: 10 | 30 | 100 | 300
    rating_a: BreakerRating
    circuits: number[] // circuit positions under this RCD
    modules: number
  }[]
  /** All circuits */
  circuits: CircuitConfig[]
  /** Surge protection */
  surge_protection: {
    required: boolean
    type?: 'Type1' | 'Type2' | 'Type1+2'
    modules: number
  }
  /** Total cost estimate */
  estimated_material_cost: number
  /** Estimated installation time in seconds */
  estimated_time_seconds: number
  /** Cost breakdown */
  cost_breakdown: {
    item: string
    quantity: number
    unit_cost: number
    total_cost: number
  }[]
  /** Compliance notes */
  compliance_notes: string[]
  /** Warnings */
  warnings: string[]
}

// =====================================================
// Compliance Checking
// =====================================================

/** Compliance check severity */
export type ComplianceSeverity = 'error' | 'warning' | 'info'

/** Single compliance check result */
export interface ComplianceIssue {
  /** Unique code for the check */
  code: string
  /** Severity level */
  severity: ComplianceSeverity
  /** Standard reference (e.g., "DS/HD 60364-4-41 §411.3.3") */
  standard_ref: string
  /** Description of the issue */
  description: string
  /** Affected circuit or area */
  affected_area?: string
  /** Recommendation to fix */
  recommendation: string
}

/** Full compliance check result */
export interface ComplianceCheckResult {
  /** Overall pass/fail */
  compliant: boolean
  /** List of issues found */
  issues: ComplianceIssue[]
  /** Summary counts */
  summary: {
    errors: number
    warnings: number
    info: number
  }
  /** Standards checked */
  standards_checked: string[]
}

// =====================================================
// Project-Level Electrical Calculation
// =====================================================

/** Input for a full project electrical calculation */
export interface ElectricalProjectInput {
  /** Building type */
  building_type: 'residential' | 'commercial' | 'industrial'
  /** Building age (affects renovation complexity) */
  building_year?: number
  /** Total area in m² */
  total_area_m2?: number
  /** Phase type of the supply */
  supply_phase: PhaseType
  /** Existing main fuse size in amperes (for renovation) */
  existing_main_fuse_a?: number
  /** Whether this is a renovation or new build */
  is_renovation: boolean
  /** Installation method (dominant for the building) */
  default_installation_method: InstallationMethod
  /** Maximum cable run length in meters */
  max_cable_run_m?: number
  /** Rooms with their loads */
  rooms: ElectricalRoomInput[]
}

/** Room input for electrical calculation */
export interface ElectricalRoomInput {
  /** Room name */
  name: string
  /** Room type code */
  room_type: string
  /** Room area in m² */
  area_m2: number
  /** Floor number (0 = ground) */
  floor: number
  /** Whether this is a wet room */
  is_wet_room: boolean
  /** Installation type for this room */
  installation_type?: string
  /** Ceiling height in meters */
  ceiling_height_m?: number
  /** Electrical loads in this room */
  loads: LoadEntry[]
  /** Cable distance from panel in meters (estimated if not provided) */
  cable_distance_m?: number
}

/** Full electrical project calculation result */
export interface ElectricalProjectResult {
  /** Load analysis for the entire project */
  load_analysis: LoadAnalysisResult
  /** Panel configuration */
  panel: PanelConfiguration
  /** Cable sizing for each circuit */
  cable_sizing: CableSizingResult[]
  /** Compliance check */
  compliance: ComplianceCheckResult
  /** Room-level summaries */
  room_summaries: {
    room_name: string
    room_type: string
    total_load_w: number
    circuit_count: number
    cable_meters: number
    material_cost: number
    labor_time_seconds: number
  }[]
  /** Total cable meters */
  total_cable_meters: number
  /** Total material cost for electrical components */
  total_electrical_material_cost: number
  /** Total labor time for electrical work in seconds */
  total_electrical_labor_seconds: number
  /** Project-level warnings */
  warnings: string[]
}

// =====================================================
// Reference Data Types
// =====================================================

/** Current carrying capacity table entry */
export interface CurrentCapacityEntry {
  cross_section: CableCrossSection
  method: InstallationMethod
  core_count: CoreCount
  capacity_a: number
}

/** Cable cost reference */
export interface CableCostEntry {
  cable_type: CableType
  cross_section: CableCrossSection
  core_count: CoreCount
  cost_per_meter_dkk: number
}

/** Breaker cost reference */
export interface BreakerCostEntry {
  breaker_type: BreakerType
  rating_a: BreakerRating
  characteristic?: BreakerCharacteristic
  rcd_type?: RCDType
  rcd_sensitivity_ma?: number
  cost_dkk: number
  modules: number
}
