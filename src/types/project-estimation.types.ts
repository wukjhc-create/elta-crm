import type { ProjectEstimate } from '@/types/calculation-intelligence.types'
import type { ElectricalProjectResult, PhaseType } from '@/types/electrical.types'
import type { CustomerTier, MarginAnalysis } from '@/lib/services/price-engine'

/** Input for a complete project estimation */
export interface ProjectEstimationInput {
  /** Project name */
  name: string
  /** Customer ID (optional - affects pricing tier) */
  customer_id?: string
  /** Building type */
  building_type: 'residential' | 'commercial' | 'industrial'
  /** Building year (for renovation assessment) */
  building_year?: number
  /** Supply phase type */
  supply_phase: PhaseType
  /** Whether this is a renovation */
  is_renovation: boolean
  /** Rooms with electrical requirements */
  rooms: RoomEstimationInput[]
  /** Pricing settings */
  pricing?: {
    hourly_rate?: number
    margin_percentage?: number
    discount_percentage?: number
    overhead_percentage?: number
    risk_percentage?: number
  }
}

/** Room input for estimation */
export interface RoomEstimationInput {
  /** Room name */
  name: string
  /** Room type code (e.g., 'BATHROOM', 'KITCHEN') */
  room_type: string
  /** Area in m² */
  area_m2: number
  /** Floor number */
  floor: number
  /** Ceiling height */
  ceiling_height_m?: number
  /** Installation type code (e.g., 'GIPS', 'BETON') */
  installation_type?: string
  /** Electrical points */
  points: Record<string, number>
}

/** Complete project estimation result */
export interface ProjectEstimationResult {
  /** Standard calculation estimate */
  estimate: ProjectEstimate
  /** Electrical analysis (cable sizing, panel config, compliance) */
  electrical: ElectricalProjectResult | null
  /** Margin analysis per line item */
  margin_analysis: MarginAnalysis
  /** Customer tier applied */
  customer_tier: CustomerTier
  /** Combined OBS points from all analyses */
  all_obs_points: string[]
  /** Combined warnings from all analyses */
  all_warnings: string[]
  /** Summary for quick overview */
  summary: {
    total_rooms: number
    total_electrical_points: number
    total_labor_hours: number
    total_material_cost: number
    total_cable_meters: number
    panel_circuits: number
    cost_price: number
    sale_price_excl_vat: number
    final_amount: number
    db_percentage: number
    db_per_hour: number
    compliant: boolean
    risk_level: string
  }
}
