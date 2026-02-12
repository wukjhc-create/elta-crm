// =====================================================
// Calculation Intelligence Service
// Professional electrician calculation engine with
// room-based estimation, component time intelligence,
// material consumption, and risk analysis
// =====================================================

import type {
  InstallationType,
  RoomTemplate,
  ComponentTimeIntelligence,
  ComponentBreakdownItem,
  RoomEstimate,
  ProjectEstimate,
  PanelRequirements,
  CableSummary,
  RiskAnalysisResult,
  RiskFactor,
  ProfitSimulationInput,
  ProfitSimulationResult,
  ProfitScenario,
  CreateRoomCalculationInput,
  ProjectCalculationInput,
} from '@/types/calculation-intelligence.types'
import type { ElectricalProjectResult, LoadEntry, ElectricalRoomInput } from '@/types/electrical.types'
import { calculateElectricalProject } from '@/lib/services/electrical-engine'

// =====================================================
// Constants
// =====================================================

const DEFAULT_HOURLY_RATE = 495
const DEFAULT_OVERHEAD_PERCENTAGE = 12
const DEFAULT_RISK_PERCENTAGE = 3
const DEFAULT_MARGIN_PERCENTAGE = 25
const DEFAULT_VAT_PERCENTAGE = 25
const DEFAULT_CABLE_WASTE_FACTOR = 1.10 // 10% cable waste

// Component type to point key mapping
const POINT_TO_COMPONENT_MAP: Record<string, { type: string; subtype: string }> = {
  outlets: { type: 'outlet', subtype: 'single' },
  outlets_countertop: { type: 'outlet', subtype: 'double' },
  outlets_ip44: { type: 'outlet', subtype: 'ip44' },
  switches: { type: 'switch', subtype: 'single' },
  ceiling_lights: { type: 'light', subtype: 'ceiling' },
  spots: { type: 'light', subtype: 'spot' },
  data_points: { type: 'outlet', subtype: 'data' },
  tv_udtag: { type: 'outlet', subtype: 'data' },
  ventilation: { type: 'appliance', subtype: 'ventilation' },
  gulvvarme_tilslutning: { type: 'appliance', subtype: 'floor_heating' },
  emhætte_tilslutning: { type: 'appliance', subtype: 'ventilation' },
  opvaskemaskine: { type: 'outlet', subtype: 'single' },
  vaskemaskine: { type: 'outlet', subtype: 'single' },
  tørretumbler: { type: 'outlet', subtype: 'single' },
  ovn_tilslutning: { type: 'appliance', subtype: 'oven_3phase' },
  induktion_tilslutning: { type: 'appliance', subtype: 'induction' },
  elbil_lader: { type: 'appliance', subtype: 'ev_charger' },
  udendørs_lamper: { type: 'light', subtype: 'outdoor_wall' },
  havepæle: { type: 'light', subtype: 'garden_pole' },
  gruppeafbrydere: { type: 'panel', subtype: 'group_breaker' },
  hpfi_afbrydere: { type: 'panel', subtype: 'rcd' },
  hovedafbryder: { type: 'panel', subtype: 'main_breaker' },
  overspændingsbeskyttelse: { type: 'panel', subtype: 'surge_protection' },
}

// =====================================================
// Calculation Intelligence Engine
// =====================================================

export class CalculationIntelligenceEngine {
  private componentTimeData: Map<string, ComponentTimeIntelligence>
  private installationTypes: Map<string, InstallationType>
  private roomTemplates: Map<string, RoomTemplate>
  private hourlyRate: number

  constructor(
    componentTimeData: ComponentTimeIntelligence[],
    installationTypes: InstallationType[],
    roomTemplates: RoomTemplate[],
    hourlyRate: number = DEFAULT_HOURLY_RATE
  ) {
    this.componentTimeData = new Map()
    for (const ctd of componentTimeData) {
      const key = `${ctd.component_type}:${ctd.component_subtype || ''}:${ctd.installation_type_id || ''}`
      this.componentTimeData.set(key, ctd)
    }

    this.installationTypes = new Map()
    for (const it of installationTypes) {
      this.installationTypes.set(it.id, it)
    }

    this.roomTemplates = new Map()
    for (const rt of roomTemplates) {
      this.roomTemplates.set(rt.id, rt)
    }

    this.hourlyRate = hourlyRate
  }

  // =====================================================
  // Component Time Lookup
  // =====================================================

  /**
   * Get total time for a component in a specific installation type
   */
  getComponentTime(
    componentType: string,
    componentSubtype: string | null,
    installationTypeId: string | null,
    quantity: number = 1
  ): {
    totalTimeSeconds: number
    installTimeSeconds: number
    wiringTimeSeconds: number
    finishingTimeSeconds: number
    cableMeters: number
    cableType: string
    materialCost: number
    materials: ComponentBreakdownItem['materials']
  } {
    // Try exact match first
    let key = `${componentType}:${componentSubtype || ''}:${installationTypeId || ''}`
    let ctd = this.componentTimeData.get(key)

    // Fallback to any installation type
    if (!ctd) {
      for (const [k, v] of this.componentTimeData) {
        if (k.startsWith(`${componentType}:${componentSubtype || ''}:`)) {
          ctd = v
          break
        }
      }
    }

    // Fallback to just component type
    if (!ctd) {
      for (const [k, v] of this.componentTimeData) {
        if (k.startsWith(`${componentType}:`)) {
          ctd = v
          break
        }
      }
    }

    if (!ctd) {
      // Default estimate
      return {
        totalTimeSeconds: 900 * quantity,
        installTimeSeconds: 600 * quantity,
        wiringTimeSeconds: 300 * quantity,
        finishingTimeSeconds: 0,
        cableMeters: 3.0 * quantity,
        cableType: 'PVT 3x1.5mm²',
        materialCost: 100 * quantity,
        materials: [],
      }
    }

    // Apply installation type multipliers
    const installationType = installationTypeId
      ? this.installationTypes.get(installationTypeId)
      : null

    const timeMultiplier = installationType?.time_multiplier ?? 1
    const difficultyMultiplier = installationType?.difficulty_multiplier ?? 1
    const wasteMultiplier = installationType?.material_waste_multiplier ?? 1

    const baseInstall = ctd.base_install_time_seconds * timeMultiplier * difficultyMultiplier
    const baseWiring = ctd.wiring_time_seconds * timeMultiplier
    const baseFinishing = ctd.finishing_time_seconds * timeMultiplier

    const totalPerUnit = baseInstall + baseWiring + baseFinishing
    const cablePerUnit = ctd.cable_meters_per_unit * DEFAULT_CABLE_WASTE_FACTOR

    // Build materials list
    const materials: ComponentBreakdownItem['materials'] = (ctd.materials_per_unit || []).map(
      (mat) => ({
        name: mat.name,
        quantity: mat.quantity * quantity * wasteMultiplier,
        unit: mat.unit,
        unit_cost: 0, // Will be filled by supplier lookup
        total_cost: 0,
      })
    )

    return {
      totalTimeSeconds: Math.round(totalPerUnit * quantity),
      installTimeSeconds: Math.round(baseInstall * quantity),
      wiringTimeSeconds: Math.round(baseWiring * quantity),
      finishingTimeSeconds: Math.round(baseFinishing * quantity),
      cableMeters: Math.round(cablePerUnit * quantity * 100) / 100,
      cableType: ctd.cable_type,
      materialCost: ctd.material_cost_estimate * quantity * wasteMultiplier,
      materials,
    }
  }

  // =====================================================
  // Room Calculation
  // =====================================================

  /**
   * Calculate a single room based on its electrical points
   */
  calculateRoom(input: CreateRoomCalculationInput): RoomEstimate {
    const template = input.room_template_id
      ? this.roomTemplates.get(input.room_template_id)
      : null

    const warnings: string[] = []
    const recommendations: string[] = []
    const breakdown: ComponentBreakdownItem[] = []
    let totalTimeSeconds = 0
    let totalMaterialCost = 0
    let totalCableMeters = 0

    // Merge template defaults with overrides
    const points = { ...input.points }

    // Calculate each point type
    for (const [pointKey, quantity] of Object.entries(points)) {
      if (quantity <= 0) continue

      const mapping = POINT_TO_COMPONENT_MAP[pointKey]
      if (!mapping) continue

      const result = this.getComponentTime(
        mapping.type,
        mapping.subtype,
        input.installation_type_id || null,
        quantity
      )

      totalTimeSeconds += result.totalTimeSeconds
      totalMaterialCost += result.materialCost
      totalCableMeters += result.cableMeters

      breakdown.push({
        type: mapping.type,
        subtype: mapping.subtype,
        quantity,
        time_seconds: result.totalTimeSeconds,
        material_cost: result.materialCost,
        cable_meters: result.cableMeters,
        materials: result.materials,
      })
    }

    // Calculate labor cost
    const totalLaborHours = totalTimeSeconds / 3600
    const totalLaborCost = totalLaborHours * this.hourlyRate
    const totalCost = totalMaterialCost + totalLaborCost

    // Generate warnings
    if (template) {
      // Check for special requirements
      for (const req of template.special_requirements || []) {
        warnings.push(`${req.requirement}: ${req.description}`)
      }

      // Check if room needs RCD
      if (template.recommended_rcd && !points.hpfi_afbrydere) {
        recommendations.push(
          `Anbefalet: HPFI/RCD beskyttelse for ${input.room_name} (${template.room_type})`
        )
      }
    }

    // Installation type warnings
    if (input.installation_type_id) {
      const installType = this.installationTypes.get(input.installation_type_id)
      if (installType && installType.difficulty_multiplier > 1.5) {
        warnings.push(
          `Sværhedsgrad: ${installType.name} kræver ekstra tid (×${installType.difficulty_multiplier})`
        )
      }
      if (installType?.required_tools) {
        const specialTools = installType.required_tools.filter((t) => t.is_special)
        if (specialTools.length > 0) {
          recommendations.push(
            `Specialværktøj påkrævet: ${specialTools.map((t) => t.tool_name).join(', ')}`
          )
        }
      }
    }

    // Size-based recommendations
    if (input.size_m2 && input.size_m2 > 0) {
      const outletsPerM2 = (points.outlets || 0) / input.size_m2
      if (outletsPerM2 < 0.3) {
        recommendations.push(
          `Få stikkontakter per m² (${outletsPerM2.toFixed(2)}/m²). Overvej flere for komfort.`
        )
      }
    }

    // Ceiling height adjustments
    if (input.ceiling_height_m && input.ceiling_height_m > 3.0) {
      const heightFactor = input.ceiling_height_m / 2.5
      totalTimeSeconds = Math.round(totalTimeSeconds * heightFactor)
      warnings.push(
        `Forhøjet lofthøjde (${input.ceiling_height_m}m) - ekstra tid tillagt`
      )
    }

    return {
      room_name: input.room_name,
      room_type: input.room_type,
      points,
      total_time_seconds: totalTimeSeconds,
      total_material_cost: Math.round(totalMaterialCost * 100) / 100,
      total_cable_meters: Math.round(totalCableMeters * 100) / 100,
      total_labor_cost: Math.round(totalLaborCost * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      component_breakdown: breakdown,
      warnings,
      recommendations,
    }
  }

  // =====================================================
  // Full Project Calculation
  // =====================================================

  /**
   * Calculate an entire project with multiple rooms
   */
  calculateProject(input: ProjectCalculationInput): ProjectEstimate {
    const hourlyRate = input.hourly_rate || this.hourlyRate
    const overheadPct = input.overhead_percentage ?? DEFAULT_OVERHEAD_PERCENTAGE
    const riskPct = input.risk_percentage ?? DEFAULT_RISK_PERCENTAGE
    const marginPct = input.margin_percentage ?? DEFAULT_MARGIN_PERCENTAGE
    const discountPct = input.discount_percentage ?? 0
    const vatPct = input.vat_percentage ?? DEFAULT_VAT_PERCENTAGE

    // Calculate each room
    const rooms: RoomEstimate[] = input.rooms.map((room) => this.calculateRoom(room))

    // Aggregate totals
    let totalTimeSeconds = 0
    let totalMaterialCost = 0
    let totalCableMeters = 0
    const allWarnings: string[] = []
    const allObsPoints: string[] = []

    for (const room of rooms) {
      totalTimeSeconds += room.total_time_seconds
      totalMaterialCost += room.total_material_cost
      totalCableMeters += room.total_cable_meters
      allWarnings.push(...room.warnings)
    }

    // Calculate panel requirements
    const panelReqs = this.calculatePanelRequirements(rooms, input)

    // Cable summary
    const cableSummary = this.calculateCableSummary(rooms)

    // Add panel costs and cable costs
    totalMaterialCost += panelReqs.estimated_panel_cost
    totalMaterialCost += cableSummary.total_cable_cost

    // Add panel installation time (1 hour per group + 2 hours base)
    const panelTimeSeconds = (panelReqs.total_groups_needed * 3600) + 7200
    totalTimeSeconds += panelTimeSeconds

    // Total labor
    const totalLaborHours = totalTimeSeconds / 3600
    const totalLaborCost = totalLaborHours * hourlyRate

    // Other costs (transport, equipment rental, etc.)
    const totalOtherCosts = this.estimateOtherCosts(input, totalLaborHours)

    // Cost price
    const costPrice = totalMaterialCost + totalLaborCost + totalOtherCosts

    // Overhead and risk
    const overheadAmount = costPrice * (overheadPct / 100)
    const riskAmount = costPrice * (riskPct / 100)

    // Margin
    const salesBasis = costPrice + overheadAmount + riskAmount
    const marginAmount = salesBasis * (marginPct / 100)
    const salePriceExclVat = salesBasis + marginAmount

    // Discount
    const discountAmount = salePriceExclVat * (discountPct / 100)
    const netPrice = salePriceExclVat - discountAmount

    // VAT
    const vatAmount = netPrice * (vatPct / 100)
    const finalAmount = netPrice + vatAmount

    // DB metrics
    const dbAmount = netPrice - costPrice
    const dbPercentage = netPrice > 0 ? (dbAmount / netPrice) * 100 : 0
    const dbPerHour = totalLaborHours > 0 ? dbAmount / totalLaborHours : 0

    // Risk analysis
    const riskAnalysis = this.analyzeRisks(input, rooms, costPrice)

    // Generate OBS points
    allObsPoints.push(...this.generateObsPoints(input, rooms, riskAnalysis))

    return {
      rooms,
      panel_requirements: panelReqs,
      cable_summary: cableSummary,
      total_time_seconds: totalTimeSeconds,
      total_labor_hours: Math.round(totalLaborHours * 100) / 100,
      total_material_cost: Math.round(totalMaterialCost * 100) / 100,
      total_cable_meters: Math.round(totalCableMeters * 100) / 100,
      total_labor_cost: Math.round(totalLaborCost * 100) / 100,
      total_other_costs: Math.round(totalOtherCosts * 100) / 100,
      cost_price: Math.round(costPrice * 100) / 100,
      overhead_amount: Math.round(overheadAmount * 100) / 100,
      risk_amount: Math.round(riskAmount * 100) / 100,
      margin_amount: Math.round(marginAmount * 100) / 100,
      sale_price_excl_vat: Math.round(salePriceExclVat * 100) / 100,
      vat_amount: Math.round(vatAmount * 100) / 100,
      final_amount: Math.round(finalAmount * 100) / 100,
      db_amount: Math.round(dbAmount * 100) / 100,
      db_percentage: Math.round(dbPercentage * 100) / 100,
      db_per_hour: Math.round(dbPerHour * 100) / 100,
      warnings: allWarnings,
      obs_points: allObsPoints,
      risk_analysis: riskAnalysis,
    }
  }

  // =====================================================
  // Panel Requirements
  // =====================================================

  private calculatePanelRequirements(
    rooms: RoomEstimate[],
    input: ProjectCalculationInput
  ): PanelRequirements {
    let totalGroups = 0
    let rcdGroups = 0
    const details: PanelRequirements['details'] = []

    for (const room of rooms) {
      // Count outlets and lights to estimate circuit groups
      const totalOutlets = Object.entries(room.points)
        .filter(([key]) => key.includes('outlet') || key === 'outlets' || key === 'outlets_countertop' || key === 'outlets_ip44')
        .reduce((sum, [, qty]) => sum + qty, 0)

      const totalLights = Object.entries(room.points)
        .filter(([key]) => key.includes('light') || key === 'spots' || key === 'ceiling_lights')
        .reduce((sum, [, qty]) => sum + qty, 0)

      // Rough group calculation: 1 group per 6 outlets, 1 per 10 lights
      const outletGroups = Math.ceil(totalOutlets / 6)
      const lightGroups = Math.ceil(totalLights / 10)

      // Special groups for high-power appliances
      const specialGroups =
        (room.points.ovn_tilslutning || 0) +
        (room.points.induktion_tilslutning || 0) +
        (room.points.elbil_lader || 0) +
        (room.points.gulvvarme_tilslutning || 0)

      const roomGroups = outletGroups + lightGroups + specialGroups

      // Wet rooms need RCD
      if (['bathroom', 'kitchen', 'utility', 'outdoor'].includes(room.room_type)) {
        rcdGroups += Math.ceil(roomGroups / 2)
      }

      totalGroups += roomGroups

      if (roomGroups > 0) {
        details.push({
          description: `${room.room_name}: ${outletGroups} stik-grupper, ${lightGroups} lys-grupper, ${specialGroups} special-grupper`,
          quantity: roomGroups,
          estimated_cost: roomGroups * 85 + specialGroups * 200,
        })
      }
    }

    // Minimum 1 RCD for safety
    rcdGroups = Math.max(rcdGroups, 1)

    // Main breaker upgrade needed for large installations
    const mainBreakerUpgrade = totalGroups > 20

    // Surge protection recommended for all new installations
    const surgeProtection = true

    // Estimate costs
    const groupBreakerCost = totalGroups * 85
    const rcdCost = rcdGroups * 650
    const mainBreakerCost = mainBreakerUpgrade ? 2500 : 0
    const surgeCost = surgeProtection ? 1200 : 0
    const panelBoxCost = totalGroups > 12 ? 2800 : 1500
    const estimatedPanelCost = groupBreakerCost + rcdCost + mainBreakerCost + surgeCost + panelBoxCost

    return {
      total_groups_needed: totalGroups,
      rcd_groups_needed: rcdGroups,
      main_breaker_upgrade: mainBreakerUpgrade,
      surge_protection_recommended: surgeProtection,
      estimated_panel_cost: Math.round(estimatedPanelCost * 100) / 100,
      details,
    }
  }

  // =====================================================
  // Cable Summary
  // =====================================================

  private calculateCableSummary(rooms: RoomEstimate[]): CableSummary {
    const cableMap = new Map<string, { meters: number; costPerMeter: number }>()

    // Cable cost estimates per meter
    const cableCosts: Record<string, number> = {
      'PVT 3x1.5mm²': 8.5,
      'PVT 3x2.5mm²': 12.0,
      'PVT 5x2.5mm²': 22.0,
      'PVT 5x4mm²': 28.0,
      'PVT 5x6mm²': 42.0,
      'PVT 5x10mm²': 65.0,
      CAT6: 12.0,
    }

    for (const room of rooms) {
      for (const comp of room.component_breakdown) {
        if (comp.cable_meters > 0) {
          // Find the cable type from component time data
          const mapping = POINT_TO_COMPONENT_MAP[comp.type] || { type: comp.type, subtype: comp.subtype }
          const existing = cableMap.get(mapping.type) || { meters: 0, costPerMeter: 8.5 }

          // Look up cable type based on component
          let cableType = 'PVT 3x1.5mm²'
          for (const [, ctd] of this.componentTimeData) {
            if (ctd.component_type === comp.type && ctd.component_subtype === comp.subtype) {
              cableType = ctd.cable_type
              break
            }
          }

          const entry = cableMap.get(cableType) || {
            meters: 0,
            costPerMeter: cableCosts[cableType] || 10,
          }
          entry.meters += comp.cable_meters
          cableMap.set(cableType, entry)
        }
      }
    }

    const cableTypes = Array.from(cableMap.entries()).map(([type, data]) => ({
      type,
      total_meters: Math.round(data.meters * 100) / 100,
      estimated_cost_per_meter: data.costPerMeter,
      total_cost: Math.round(data.meters * data.costPerMeter * 100) / 100,
    }))

    const totalMeters = cableTypes.reduce((sum, ct) => sum + ct.total_meters, 0)
    const totalCableCost = cableTypes.reduce((sum, ct) => sum + ct.total_cost, 0)

    return {
      cable_types: cableTypes,
      total_meters: Math.round(totalMeters * 100) / 100,
      total_cable_cost: Math.round(totalCableCost * 100) / 100,
    }
  }

  // =====================================================
  // Other Costs Estimation
  // =====================================================

  private estimateOtherCosts(
    input: ProjectCalculationInput,
    totalLaborHours: number
  ): number {
    let otherCosts = 0

    // Transport: base + per hour
    const transportDays = Math.ceil(totalLaborHours / 8)
    otherCosts += transportDays * 350 // 350 kr per dag

    // Equipment rental for special installations
    for (const room of input.rooms) {
      const installType = room.installation_type_id
        ? this.installationTypes.get(room.installation_type_id)
        : null

      if (installType) {
        const specialTools = (installType.required_tools || []).filter((t) => t.is_special)
        otherCosts += specialTools.length * 500 // 500 kr per special tool rental
      }
    }

    return Math.round(otherCosts * 100) / 100
  }

  // =====================================================
  // Risk Analysis
  // =====================================================

  private analyzeRisks(
    input: ProjectCalculationInput,
    rooms: RoomEstimate[],
    costPrice: number
  ): RiskAnalysisResult {
    const factors: RiskFactor[] = []

    // Building age risk
    if (input.building_age_years && input.building_age_years > 30) {
      factors.push({
        type: 'old_building',
        description: `Bygning over ${input.building_age_years} år - risiko for uforudsete installationer`,
        severity: input.building_age_years > 50 ? 'high' : 'medium',
        impact_percentage: input.building_age_years > 50 ? 15 : 8,
      })
    }

    // Complex installation types
    for (const room of input.rooms) {
      if (room.installation_type_id) {
        const installType = this.installationTypes.get(room.installation_type_id)
        if (installType && installType.difficulty_multiplier > 1.5) {
          factors.push({
            type: 'difficult_installation',
            description: `${room.room_name}: ${installType.name} installation (sværhedsgrad ×${installType.difficulty_multiplier})`,
            severity: installType.difficulty_multiplier > 2 ? 'high' : 'medium',
            impact_percentage: (installType.difficulty_multiplier - 1) * 10,
          })
        }
      }
    }

    // Large project risk
    const totalPoints = rooms.reduce(
      (sum, room) =>
        sum + Object.values(room.points).reduce((s, v) => s + v, 0),
      0
    )
    if (totalPoints > 100) {
      factors.push({
        type: 'large_project',
        description: `Stort projekt med ${totalPoints} elektriske punkter`,
        severity: totalPoints > 200 ? 'high' : 'medium',
        impact_percentage: 5,
      })
    }

    // High-value risk
    if (costPrice > 200000) {
      factors.push({
        type: 'high_value',
        description: `Høj projektværdi (${Math.round(costPrice).toLocaleString('da-DK')} kr)`,
        severity: costPrice > 500000 ? 'high' : 'medium',
        impact_percentage: 3,
      })
    }

    // Wet room risk
    const wetRooms = rooms.filter((r) =>
      ['bathroom', 'outdoor'].includes(r.room_type)
    )
    if (wetRooms.length > 0) {
      factors.push({
        type: 'wet_rooms',
        description: `${wetRooms.length} vådrum/udendørs installationer - kræver IP-klassificerede materialer`,
        severity: 'medium',
        impact_percentage: 5,
      })
    }

    // Calculate overall risk
    const totalImpact = factors.reduce((sum, f) => sum + f.impact_percentage, 0)
    const riskScore = Math.min(5, Math.max(1, Math.ceil(totalImpact / 10)))
    const riskLevel: RiskAnalysisResult['risk_level'] =
      riskScore <= 1 ? 'low' :
      riskScore <= 2 ? 'medium' :
      riskScore <= 4 ? 'high' : 'critical'

    const recommendedBuffer = Math.min(20, Math.max(3, Math.round(totalImpact / 3)))

    return {
      risk_score: riskScore,
      risk_level: riskLevel,
      factors,
      recommended_buffer_percentage: recommendedBuffer,
    }
  }

  // =====================================================
  // OBS Points Generator
  // =====================================================

  private generateObsPoints(
    input: ProjectCalculationInput,
    rooms: RoomEstimate[],
    riskAnalysis: RiskAnalysisResult
  ): string[] {
    const obsPoints: string[] = []

    // Building age OBS
    if (input.building_age_years && input.building_age_years > 30) {
      obsPoints.push(
        'OBS: Ved ældre installationer kan der forekomme behov for udskiftning af eksisterende kabler og dåser, som ikke er inkluderet i dette tilbud.'
      )
    }

    // Concrete/masonry OBS
    const hasConcreteRooms = input.rooms.some((r) => {
      if (!r.installation_type_id) return false
      const it = this.installationTypes.get(r.installation_type_id)
      return it && ['BETON', 'MUR'].includes(it.code)
    })
    if (hasConcreteRooms) {
      obsPoints.push(
        'OBS: Ved boring/fræsning i beton/mur kan der forekomme støjgener. Malerarbejde og reetablering af overflader er ikke inkluderet.'
      )
    }

    // Wet room OBS
    const hasWetRooms = rooms.some((r) => r.room_type === 'bathroom')
    if (hasWetRooms) {
      obsPoints.push(
        'OBS: Installation i vådrum udføres iht. DS/HD 60364 zonebestemmelser. Alle materialer er IP44 eller bedre.'
      )
    }

    // EV charger OBS
    const hasEvCharger = rooms.some((r) => (r.points.elbil_lader || 0) > 0)
    if (hasEvCharger) {
      obsPoints.push(
        'OBS: Elbilslader kræver dedikeret gruppe i tavlen. Tilslutning forudsætter tilstrækkelig kapacitet i hovedtilslutningen.'
      )
    }

    // High risk OBS
    if (riskAnalysis.risk_level === 'high' || riskAnalysis.risk_level === 'critical') {
      obsPoints.push(
        `OBS: Projektet har en forhøjet risikoprofil (score: ${riskAnalysis.risk_score}/5). Der er tillagt ${riskAnalysis.recommended_buffer_percentage}% risikobuffer.`
      )
    }

    // Panel OBS
    obsPoints.push(
      'OBS: Tilbuddet forudsætter tilstrækkelig plads i eksisterende el-tavle. Evt. tavleudvidelse eller ny tavle er estimeret men kan variere.'
    )

    return obsPoints
  }

  // =====================================================
  // Enhanced Electrical Project Calculation
  // =====================================================

  /**
   * Calculate project with full electrical engineering analysis.
   * Uses the ElectricalEngine for cable sizing, load analysis,
   * panel configuration, and DS/HD 60364 compliance checking.
   */
  calculateProjectWithElectrical(
    input: ProjectCalculationInput
  ): ProjectEstimate & { electrical?: ElectricalProjectResult } {
    // First get the standard estimate
    const baseEstimate = this.calculateProject(input)

    // Build electrical input from rooms
    const electricalRooms: ElectricalRoomInput[] = input.rooms.map(room => {
      const loads: LoadEntry[] = []
      const points = room.points || {}

      // Convert room points to electrical loads
      const outletCount = (points.outlets || 0) + (points.outlets_countertop || 0) + (points.outlets_ip44 || 0)
      if (outletCount > 0) {
        loads.push({
          description: `Stikkontakter ${room.room_name}`,
          category: 'socket_outlet',
          rated_power_watts: 230,
          quantity: outletCount,
          power_factor: 1.0,
        })
      }

      const lightCount = (points.ceiling_lights || 0) + (points.spots || 0) + (points.udendørs_lamper || 0)
      if (lightCount > 0) {
        loads.push({
          description: `Belysning ${room.room_name}`,
          category: 'lighting',
          rated_power_watts: 60, // Average LED + driver
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
          rated_power_watts: 100 * (room.size_m2 || 10), // ~100W/m²
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

      const isWetRoom = ['bathroom', 'outdoor', 'utility'].includes(room.room_type)

      return {
        name: room.room_name,
        room_type: room.room_type,
        area_m2: room.size_m2 || 10,
        floor: room.floor_number || 0,
        is_wet_room: isWetRoom,
        installation_type: room.installation_type_id || undefined,
        ceiling_height_m: room.ceiling_height_m || 2.5,
        loads,
      }
    })

    // Run electrical calculations
    try {
      const electricalResult = calculateElectricalProject({
        building_type: 'residential',
        building_year: input.building_age_years ? (new Date().getFullYear() - input.building_age_years) : undefined,
        supply_phase: '3-phase', // Most Danish installations are 3-phase
        is_renovation: (input.building_age_years ?? 0) > 0,
        default_installation_method: 'B2',
        rooms: electricalRooms,
      })

      // Merge electrical warnings into the estimate
      baseEstimate.warnings.push(...electricalResult.warnings)

      // Add compliance issues as OBS points
      if (!electricalResult.compliance.compliant) {
        for (const issue of electricalResult.compliance.issues) {
          if (issue.severity === 'error') {
            baseEstimate.obs_points.push(`FEJL: ${issue.description} (${issue.standard_ref})`)
          }
        }
      }

      return { ...baseEstimate, electrical: electricalResult }
    } catch {
      // If electrical calculation fails, return base estimate
      return { ...baseEstimate, electrical: undefined }
    }
  }

  // =====================================================
  // Profit Simulator
  // =====================================================

  static simulateProfit(input: ProfitSimulationInput): ProfitSimulationResult {
    const laborCost = input.hourly_rate * input.total_hours
    const costPrice = input.material_cost + laborCost
    const overheadAmount = costPrice * (input.overhead_percentage / 100)
    const riskAmount = costPrice * (input.risk_percentage / 100)
    const salesBasis = costPrice + overheadAmount + riskAmount

    // Generate scenarios
    const marginScenarios = [
      { name: 'Minimal margin', margin: 10, discount: 0 },
      { name: 'Lav margin', margin: 15, discount: 0 },
      { name: 'Standard margin', margin: input.margin_percentage, discount: input.discount_percentage },
      { name: 'Høj margin', margin: 30, discount: 0 },
      { name: 'Premium margin', margin: 40, discount: 0 },
      { name: 'Med 5% rabat', margin: input.margin_percentage, discount: 5 },
      { name: 'Med 10% rabat', margin: input.margin_percentage, discount: 10 },
    ]

    const scenarios: ProfitScenario[] = marginScenarios.map((s) => {
      const marginAmount = salesBasis * (s.margin / 100)
      const salePriceExclVat = salesBasis + marginAmount
      const discountAmount = salePriceExclVat * (s.discount / 100)
      const netPrice = salePriceExclVat - discountAmount
      const vatAmount = netPrice * (input.vat_percentage / 100)
      const finalAmount = netPrice + vatAmount
      const dbAmount = netPrice - costPrice
      const dbPercentage = netPrice > 0 ? (dbAmount / netPrice) * 100 : 0
      const dbPerHour = input.total_hours > 0 ? dbAmount / input.total_hours : 0

      return {
        name: s.name,
        margin_percentage: s.margin,
        discount_percentage: s.discount,
        sale_price_excl_vat: Math.round(salePriceExclVat * 100) / 100,
        discount_amount: Math.round(discountAmount * 100) / 100,
        net_price: Math.round(netPrice * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        final_amount: Math.round(finalAmount * 100) / 100,
        db_amount: Math.round(dbAmount * 100) / 100,
        db_percentage: Math.round(dbPercentage * 100) / 100,
        db_per_hour: Math.round(dbPerHour * 100) / 100,
      }
    })

    return {
      cost_price: Math.round(costPrice * 100) / 100,
      labor_cost: Math.round(laborCost * 100) / 100,
      material_cost: Math.round(input.material_cost * 100) / 100,
      overhead_amount: Math.round(overheadAmount * 100) / 100,
      risk_amount: Math.round(riskAmount * 100) / 100,
      sales_basis: Math.round(salesBasis * 100) / 100,
      scenarios,
    }
  }
}

// =====================================================
// Anomaly Detection
// =====================================================

export interface AnomalyCheckInput {
  calculation_id: string
  rooms: RoomEstimate[]
  total_hours: number
  cost_price: number
  margin_percentage: number
  material_cost: number
}

export function detectAnomalies(
  input: AnomalyCheckInput
): Array<{
  anomaly_type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  details: Record<string, unknown>
}> {
  const anomalies: ReturnType<typeof detectAnomalies> = []

  // Check for extremely high or low hours per point
  const totalPoints = input.rooms.reduce(
    (sum, r) => sum + Object.values(r.points).reduce((s, v) => s + v, 0),
    0
  )
  if (totalPoints > 0) {
    const hoursPerPoint = input.total_hours / totalPoints
    if (hoursPerPoint > 2) {
      anomalies.push({
        anomaly_type: 'time_outlier',
        severity: 'warning',
        message: `Høj tidsestimat: ${hoursPerPoint.toFixed(1)} timer per el-punkt (normalt 0.3-1.5 timer)`,
        details: { hours_per_point: hoursPerPoint, total_points: totalPoints },
      })
    }
    if (hoursPerPoint < 0.1) {
      anomalies.push({
        anomaly_type: 'time_outlier',
        severity: 'warning',
        message: `Lavt tidsestimat: ${hoursPerPoint.toFixed(2)} timer per el-punkt (normalt 0.3-1.5 timer)`,
        details: { hours_per_point: hoursPerPoint, total_points: totalPoints },
      })
    }
  }

  // Check margin
  if (input.margin_percentage < 15) {
    anomalies.push({
      anomaly_type: 'margin_warning',
      severity: 'warning',
      message: `Lav margin: ${input.margin_percentage}% (anbefalet minimum 15%)`,
      details: { margin_percentage: input.margin_percentage },
    })
  }
  if (input.margin_percentage < 10) {
    anomalies.push({
      anomaly_type: 'margin_warning',
      severity: 'critical',
      message: `Kritisk lav margin: ${input.margin_percentage}% (risiko for tab)`,
      details: { margin_percentage: input.margin_percentage },
    })
  }

  // Check for missing RCD in wet rooms
  for (const room of input.rooms) {
    if (['bathroom', 'outdoor'].includes(room.room_type)) {
      if (!room.points.hpfi_afbrydere && !room.component_breakdown.some((c) => c.type === 'panel' && c.subtype === 'rcd')) {
        anomalies.push({
          anomaly_type: 'missing_rcd',
          severity: 'critical',
          message: `Manglende HPFI/RCD i ${room.room_name} (${room.room_type}) - lovkrav`,
          details: { room_name: room.room_name, room_type: room.room_type },
        })
      }
    }
  }

  // Check material cost ratio
  if (input.cost_price > 0) {
    const materialRatio = input.material_cost / input.cost_price
    if (materialRatio < 0.2) {
      anomalies.push({
        anomaly_type: 'price_deviation',
        severity: 'info',
        message: `Lav materialeandel (${(materialRatio * 100).toFixed(0)}%) - typisk 30-50%`,
        details: { material_ratio: materialRatio },
      })
    }
    if (materialRatio > 0.7) {
      anomalies.push({
        anomaly_type: 'price_deviation',
        severity: 'warning',
        message: `Høj materialeandel (${(materialRatio * 100).toFixed(0)}%) - tjek materialepriser`,
        details: { material_ratio: materialRatio },
      })
    }
  }

  return anomalies
}
