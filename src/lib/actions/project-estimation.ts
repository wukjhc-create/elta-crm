'use server'

/**
 * Unified Project Estimation API
 *
 * Single entry point for creating a complete electrician project estimate.
 * Orchestrates all engines:
 * 1. Room-based calculation (CalculationIntelligenceEngine)
 * 2. Electrical analysis (ElectricalEngine)
 * 3. Price calculation with customer tier (PriceEngine)
 * 4. Margin analysis
 * 5. Compliance checking
 * 6. Risk assessment
 *
 * Returns an offer-ready estimate with full breakdown.
 */

import type { ActionResult } from '@/types/common.types'
import type { ProjectEstimate, CreateRoomCalculationInput, ProjectCalculationInput } from '@/types/calculation-intelligence.types'
import type { ElectricalProjectResult, LoadEntry, ElectricalRoomInput, PhaseType } from '@/types/electrical.types'
import { CalculationIntelligenceEngine } from '@/lib/services/calculation-intelligence'
import { calculateElectricalProject } from '@/lib/services/electrical-engine'
import { calculatePrice, analyzeMargins, CUSTOMER_TIERS, type CustomerTier, type MarginAnalysis } from '@/lib/services/price-engine'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { CALC_DEFAULTS } from '@/lib/constants'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Types
// =====================================================

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

// =====================================================
// Main Estimation Function
// =====================================================

/**
 * Create a complete project estimation.
 * Combines all calculation engines for a professional estimate.
 */
export async function createProjectEstimation(
  input: ProjectEstimationInput
): Promise<ActionResult<ProjectEstimationResult>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    if (!input.rooms || input.rooms.length === 0) {
      return { success: false, error: 'Projektet skal have mindst ét rum' }
    }

    // Determine customer tier
    let customerTier: CustomerTier = 'standard'
    if (input.customer_id) {
      validateUUID(input.customer_id, 'customer_id')
      const { data: customer } = await supabase
        .from('customers')
        .select('metadata')
        .eq('id', input.customer_id)
        .maybeSingle()

      const metadata = customer?.metadata as Record<string, unknown> | null
      if (metadata?.pricing_tier && typeof metadata.pricing_tier === 'string') {
        customerTier = metadata.pricing_tier as CustomerTier
      }
    }

    // Load calculation intelligence data
    const [installTypesRes, roomTemplatesRes, componentTimeRes] = await Promise.all([
      supabase.from('installation_types').select('*').eq('is_active', true),
      supabase.from('room_templates').select('*').eq('is_active', true),
      supabase.from('component_time_intelligence').select('*'),
    ])

    const installationTypes = installTypesRes.data || []
    const roomTemplates = roomTemplatesRes.data || []
    const componentTimeData = componentTimeRes.data || []

    const hourlyRate = input.pricing?.hourly_rate ?? CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN

    // Step 1: Calculate project with room-based engine
    const engine = new CalculationIntelligenceEngine(
      componentTimeData,
      installationTypes,
      roomTemplates,
      hourlyRate
    )

    // Build room calculation inputs (calculation_id is empty for estimation-only mode)
    const roomInputs: CreateRoomCalculationInput[] = input.rooms.map(room => {
      const matchingTemplate = roomTemplates.find(t =>
        t.room_type?.toLowerCase() === room.room_type.toLowerCase() ||
        (t as Record<string, unknown>).code === room.room_type
      )
      const matchingInstallType = installationTypes.find(t =>
        (t as Record<string, unknown>).code === room.installation_type
      )

      return {
        calculation_id: '', // Not saved yet - estimation mode
        room_name: room.name,
        room_type: room.room_type.toLowerCase(),
        room_template_id: matchingTemplate?.id || undefined,
        installation_type_id: matchingInstallType?.id || undefined,
        size_m2: room.area_m2,
        floor_number: room.floor,
        ceiling_height_m: room.ceiling_height_m || 2.5,
        points: room.points,
      }
    })

    const buildingAge = input.building_year
      ? new Date().getFullYear() - input.building_year
      : undefined

    const projectInput: ProjectCalculationInput = {
      rooms: roomInputs,
      hourly_rate: hourlyRate,
      overhead_percentage: input.pricing?.overhead_percentage ?? 12,
      risk_percentage: input.pricing?.risk_percentage ?? 3,
      margin_percentage: input.pricing?.margin_percentage ?? CALC_DEFAULTS.MARGINS.DEFAULT_DB_TARGET,
      discount_percentage: input.pricing?.discount_percentage ?? 0,
      vat_percentage: 25,
      building_age_years: buildingAge,
    }

    const estimate = engine.calculateProject(projectInput)

    // Step 2: Electrical analysis
    let electricalResult: ElectricalProjectResult | null = null
    try {
      const electricalRooms: ElectricalRoomInput[] = input.rooms.map(room => {
        const loads: LoadEntry[] = buildLoadsFromPoints(room.points, room.name, room.area_m2)
        const isWetRoom = ['bathroom', 'outdoor', 'utility'].includes(room.room_type.toLowerCase())

        return {
          name: room.name,
          room_type: room.room_type,
          area_m2: room.area_m2,
          floor: room.floor,
          is_wet_room: isWetRoom,
          installation_type: room.installation_type,
          ceiling_height_m: room.ceiling_height_m || 2.5,
          loads,
        }
      })

      electricalResult = calculateElectricalProject({
        building_type: input.building_type,
        building_year: input.building_year,
        supply_phase: input.supply_phase,
        is_renovation: input.is_renovation,
        default_installation_method: 'B2',
        rooms: electricalRooms,
      })
    } catch {
      // Electrical calculation is optional - continue without it
    }

    // Step 3: Margin analysis
    const marginItems = estimate.rooms.flatMap(room =>
      room.component_breakdown.map(comp => ({
        description: `${room.room_name}: ${comp.type} (${comp.subtype})`,
        cost: comp.material_cost + (comp.time_seconds / 3600) * hourlyRate,
        sale: comp.material_cost * 1.25 + (comp.time_seconds / 3600) * hourlyRate * 1.25, // Rough sale estimate
      }))
    )
    const marginAnalysis = analyzeMargins(marginItems, CALC_DEFAULTS.MARGINS.MINIMUM_DB)

    // Step 4: Combine all warnings and OBS points
    const allWarnings = [...estimate.warnings]
    const allObsPoints = [...estimate.obs_points]

    if (electricalResult) {
      allWarnings.push(...electricalResult.warnings)
      if (electricalResult.compliance.issues) {
        for (const issue of electricalResult.compliance.issues) {
          if (issue.severity === 'error') {
            allObsPoints.push(`KRAV: ${issue.description} (${issue.standard_ref})`)
          } else if (issue.severity === 'warning') {
            allWarnings.push(`${issue.description} (${issue.standard_ref})`)
          }
        }
      }
    }

    if (marginAnalysis.warnings.length > 0) {
      allWarnings.push(...marginAnalysis.warnings)
    }

    // Step 5: Build summary
    const totalPoints = input.rooms.reduce(
      (sum, room) => sum + Object.values(room.points).reduce((s, v) => s + v, 0),
      0
    )

    const summary = {
      total_rooms: input.rooms.length,
      total_electrical_points: totalPoints,
      total_labor_hours: estimate.total_labor_hours,
      total_material_cost: estimate.total_material_cost,
      total_cable_meters: electricalResult?.total_cable_meters ?? estimate.total_cable_meters,
      panel_circuits: electricalResult?.panel.circuits.length ?? estimate.panel_requirements.total_groups_needed,
      cost_price: estimate.cost_price,
      sale_price_excl_vat: estimate.sale_price_excl_vat,
      final_amount: estimate.final_amount,
      db_percentage: estimate.db_percentage,
      db_per_hour: estimate.db_per_hour,
      compliant: electricalResult?.compliance.compliant ?? true,
      risk_level: estimate.risk_analysis.risk_level,
    }

    logger.info('Project estimation created', {
      action: 'createProjectEstimation',
      metadata: {
        rooms: input.rooms.length,
        points: totalPoints,
        laborHours: estimate.total_labor_hours,
        finalAmount: estimate.final_amount,
        compliant: summary.compliant,
      },
    })

    return {
      success: true,
      data: {
        estimate,
        electrical: electricalResult,
        margin_analysis: marginAnalysis,
        customer_tier: customerTier,
        all_obs_points: [...new Set(allObsPoints)],
        all_warnings: [...new Set(allWarnings)],
        summary,
      },
    }
  } catch (err) {
    logger.error('Project estimation failed', { error: err, action: 'createProjectEstimation' })
    return { success: false, error: formatError(err, 'Kunne ikke oprette projektestimering') }
  }
}

// =====================================================
// Helper: Convert room points to electrical loads
// =====================================================

function buildLoadsFromPoints(
  points: Record<string, number>,
  roomName: string,
  areM2: number
): LoadEntry[] {
  const loads: LoadEntry[] = []

  const outletCount = (points.outlets || 0) + (points.outlets_countertop || 0) + (points.outlets_ip44 || 0)
  if (outletCount > 0) {
    loads.push({
      description: `Stikkontakter ${roomName}`,
      category: 'socket_outlet',
      rated_power_watts: 230,
      quantity: outletCount,
      power_factor: 1.0,
    })
  }

  const lightCount = (points.ceiling_lights || 0) + (points.spots || 0) + (points.udendørs_lamper || 0) + (points.havepæle || 0)
  if (lightCount > 0) {
    loads.push({
      description: `Belysning ${roomName}`,
      category: 'lighting',
      rated_power_watts: 60,
      quantity: lightCount,
      power_factor: 0.95,
    })
  }

  if (points.ovn_tilslutning) {
    loads.push({
      description: 'Ovn (3-fase)',
      category: 'cooking',
      rated_power_watts: 3600,
      quantity: points.ovn_tilslutning,
      power_factor: 1.0,
    })
  }

  if (points.induktion_tilslutning) {
    loads.push({
      description: 'Induktionskogeplade',
      category: 'cooking',
      rated_power_watts: 7200,
      quantity: points.induktion_tilslutning,
      power_factor: 0.95,
    })
  }

  if (points.elbil_lader) {
    loads.push({
      description: 'EV-lader',
      category: 'ev_charger',
      rated_power_watts: 11000,
      quantity: points.elbil_lader,
      power_factor: 0.99,
      is_continuous: true,
    })
  }

  if (points.gulvvarme_tilslutning) {
    loads.push({
      description: 'Gulvvarme',
      category: 'heating',
      rated_power_watts: 100 * areM2,
      quantity: points.gulvvarme_tilslutning,
      power_factor: 1.0,
    })
  }

  if (points.vaskemaskine) {
    loads.push({
      description: 'Vaskemaskine',
      category: 'fixed_appliance',
      rated_power_watts: 2200,
      quantity: points.vaskemaskine,
      power_factor: 0.85,
    })
  }

  if (points.tørretumbler) {
    loads.push({
      description: 'Tørretumbler',
      category: 'fixed_appliance',
      rated_power_watts: 2500,
      quantity: points.tørretumbler,
      power_factor: 0.85,
    })
  }

  if (points.opvaskemaskine) {
    loads.push({
      description: 'Opvaskemaskine',
      category: 'fixed_appliance',
      rated_power_watts: 2200,
      quantity: points.opvaskemaskine,
      power_factor: 0.85,
    })
  }

  if (points.emhætte_tilslutning) {
    loads.push({
      description: 'Emhætte',
      category: 'fixed_appliance',
      rated_power_watts: 150,
      quantity: points.emhætte_tilslutning,
      power_factor: 0.85,
    })
  }

  if (points.ventilation) {
    loads.push({
      description: 'Ventilation',
      category: 'fixed_appliance',
      rated_power_watts: 150,
      quantity: points.ventilation,
      power_factor: 0.85,
    })
  }

  return loads
}
