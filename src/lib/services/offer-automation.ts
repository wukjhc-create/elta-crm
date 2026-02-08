// =====================================================
// Offer Automation Service
// Auto-generate professional offers from calculations
// with risk analysis, margin warnings, and smart text
// =====================================================

import type { ProjectEstimate, OfferTextTemplate } from '@/types/calculation-intelligence.types'
import type { KalkiaCalculationWithRelations } from '@/types/kalkia.types'

// =====================================================
// Types
// =====================================================

export interface OfferGenerationInput {
  // Source data
  projectEstimate?: ProjectEstimate
  kalkiaCalculation?: KalkiaCalculationWithRelations

  // Customer info
  customer_name?: string
  customer_address?: string
  project_description?: string

  // Project context
  building_type?: string
  project_type?: string // 'renovation', 'new_build', 'extension', 'repair'

  // Configuration
  include_detailed_breakdown?: boolean
  include_obs_points?: boolean
  include_risk_analysis?: boolean
  language?: string
}

export interface GeneratedOffer {
  title: string
  description: string
  introduction: string
  scope_text: string
  line_items: GeneratedLineItem[]
  obs_points: string[]
  terms_and_conditions: string
  warranty_text: string
  disclaimers: string[]
  margin_analysis: MarginAnalysis
  risk_summary: string | null
  total_amount: number
  discount_percentage: number
  tax_percentage: number
  final_amount: number
  upsell_suggestions: UpsellSuggestion[]
}

export interface GeneratedLineItem {
  position: number
  section: string | null
  description: string
  quantity: number
  unit: string
  unit_price: number
  discount_percentage: number
  total: number
  is_optional: boolean
  cost_price: number | null
  notes: string | null
}

export interface MarginAnalysis {
  total_cost_price: number
  total_sale_price: number
  margin_percentage: number
  margin_amount: number
  db_amount: number
  db_percentage: number
  db_per_hour: number
  total_hours: number
  status: 'healthy' | 'low' | 'critical' | 'negative'
  warnings: string[]
  recommendations: string[]
}

export interface UpsellSuggestion {
  title: string
  description: string
  estimated_cost: number
  estimated_additional_margin: number
  priority: 'high' | 'medium' | 'low'
}

// =====================================================
// Offer Generator
// =====================================================

export class OfferAutomationEngine {
  private templates: OfferTextTemplate[]

  constructor(templates: OfferTextTemplate[] = []) {
    this.templates = templates
  }

  // =====================================================
  // Generate Complete Offer
  // =====================================================

  generateOfferFromProject(input: OfferGenerationInput): GeneratedOffer {
    const estimate = input.projectEstimate
    if (!estimate) {
      throw new Error('ProjectEstimate required')
    }

    // Generate title
    const title = this.generateTitle(input)

    // Generate description
    const description = this.generateDescription(input)

    // Generate introduction text
    const introduction = this.getTemplateText('intro', input) ||
      this.generateIntroduction(input)

    // Generate scope text
    const scopeText = this.getTemplateText('scope', input) ||
      this.generateScopeText(input, estimate)

    // Generate line items from rooms
    const lineItems = this.generateLineItems(estimate, input)

    // Generate OBS points
    const obsPoints = input.include_obs_points !== false
      ? this.generateObsPoints(estimate, input)
      : []

    // Generate terms
    const termsAndConditions = this.getTemplateText('terms', input) ||
      'Tilbuddet er gældende i 30 dage fra tilbudsdato. Priser er ekskl. moms. Betalingsbetingelser: Netto 14 dage.'

    // Generate warranty
    const warrantyText = this.getTemplateText('warranty', input) ||
      'Der ydes 5 års garanti på det udførte arbejde iht. AB18. Garanti på materialer følger producentens garantibetingelser.'

    // Generate disclaimers
    const disclaimers = this.generateDisclaimers(estimate, input)

    // Margin analysis
    const marginAnalysis = this.analyzeMargin(estimate)

    // Risk summary
    const riskSummary = input.include_risk_analysis !== false
      ? this.generateRiskSummary(estimate)
      : null

    // Upsell suggestions
    const upsellSuggestions = this.generateUpsellSuggestions(estimate, input)

    return {
      title,
      description,
      introduction,
      scope_text: scopeText,
      line_items: lineItems,
      obs_points: obsPoints,
      terms_and_conditions: termsAndConditions,
      warranty_text: warrantyText,
      disclaimers,
      margin_analysis: marginAnalysis,
      risk_summary: riskSummary,
      total_amount: estimate.sale_price_excl_vat,
      discount_percentage: 0,
      tax_percentage: 25,
      final_amount: estimate.final_amount,
      upsell_suggestions: upsellSuggestions,
    }
  }

  // =====================================================
  // Generate from Kalkia Calculation
  // =====================================================

  generateOfferFromKalkia(
    calculation: KalkiaCalculationWithRelations,
    templates?: OfferTextTemplate[]
  ): GeneratedOffer {
    if (templates) {
      this.templates = templates
    }

    const title = `El-installation: ${calculation.name}`
    const description = calculation.description || ''

    const lineItems: GeneratedLineItem[] = (calculation.rows || [])
      .filter((row) => row.show_on_offer)
      .map((row, idx) => ({
        position: idx + 1,
        section: row.section,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.sale_price,
        discount_percentage: 0,
        total: row.total_sale,
        is_optional: row.is_optional,
        cost_price: row.total_cost,
        notes: null,
      }))

    const marginAnalysis: MarginAnalysis = {
      total_cost_price: calculation.cost_price,
      total_sale_price: calculation.sale_price_excl_vat,
      margin_percentage: calculation.margin_percentage,
      margin_amount: calculation.margin_amount,
      db_amount: calculation.db_amount,
      db_percentage: calculation.db_percentage,
      db_per_hour: calculation.db_per_hour,
      total_hours: calculation.total_labor_time_seconds / 3600,
      status: this.getMarginStatus(calculation.db_percentage),
      warnings: [],
      recommendations: [],
    }

    // Add margin warnings
    if (marginAnalysis.db_percentage < 15) {
      marginAnalysis.warnings.push(
        `Lav dækningsgrad: ${marginAnalysis.db_percentage.toFixed(1)}% (anbefalet min. 15%)`
      )
    }
    if (marginAnalysis.db_per_hour < 200) {
      marginAnalysis.warnings.push(
        `Lav DB/time: ${marginAnalysis.db_per_hour.toFixed(0)} kr (anbefalet min. 200 kr/time)`
      )
    }

    return {
      title,
      description,
      introduction: this.getTemplateText('intro', {}) ||
        'Tak for jeres henvendelse. Vi har hermed fornøjelsen af at fremsende tilbud på el-installation som beskrevet nedenfor.',
      scope_text: this.getTemplateText('scope', {}) ||
        'Tilbuddet omfatter levering og montering af alle angivne materialer samt al nødvendig kabelføring.',
      line_items: lineItems,
      obs_points: [],
      terms_and_conditions: this.getTemplateText('terms', {}) ||
        'Tilbuddet er gældende i 30 dage fra tilbudsdato. Priser er ekskl. moms.',
      warranty_text: this.getTemplateText('warranty', {}) ||
        'Der ydes 5 års garanti på det udførte arbejde.',
      disclaimers: [
        this.getTemplateText('disclaimer', {}) ||
        'Eventuelle skjulte installationer er ikke inkluderet i tilbuddet.',
      ],
      margin_analysis: marginAnalysis,
      risk_summary: null,
      total_amount: calculation.sale_price_excl_vat,
      discount_percentage: calculation.discount_percentage,
      tax_percentage: calculation.vat_percentage,
      final_amount: calculation.final_amount,
      upsell_suggestions: [],
    }
  }

  // =====================================================
  // Private Helpers
  // =====================================================

  private generateTitle(input: OfferGenerationInput): string {
    const parts: string[] = ['El-installation']

    if (input.project_type) {
      const typeLabels: Record<string, string> = {
        renovation: 'Renovering',
        new_build: 'Nybyggeri',
        extension: 'Tilbygning',
        repair: 'Reparation',
      }
      parts[0] = typeLabels[input.project_type] || input.project_type
    }

    if (input.customer_name) {
      parts.push(`- ${input.customer_name}`)
    }

    return parts.join(' ')
  }

  private generateDescription(input: OfferGenerationInput): string {
    const parts: string[] = []

    if (input.project_description) {
      parts.push(input.project_description)
    }

    if (input.projectEstimate) {
      const est = input.projectEstimate
      parts.push(
        `${est.rooms.length} rum, ca. ${est.total_labor_hours.toFixed(0)} arbejdstimer`
      )
    }

    return parts.join('. ')
  }

  private generateIntroduction(input: OfferGenerationInput): string {
    if (input.project_type === 'renovation') {
      return 'I forlængelse af vores besigtigelse af ejendommen, fremsender vi hermed tilbud på el-renovation som beskrevet nedenfor.'
    }
    if (input.project_type === 'new_build') {
      return 'Med reference til det fremsendte tegningsmateriale, fremsender vi hermed tilbud på komplet el-installation som beskrevet nedenfor.'
    }
    return 'Tak for jeres henvendelse. Vi har hermed fornøjelsen af at fremsende tilbud på el-installation som beskrevet nedenfor.'
  }

  private generateScopeText(
    input: OfferGenerationInput,
    estimate: ProjectEstimate
  ): string {
    const parts = [
      'Tilbuddet omfatter levering og montering af alle angivne materialer samt al nødvendig kabelføring.',
    ]

    parts.push(
      `Arbejdet omfatter installation i ${estimate.rooms.length} rum med i alt ca. ${Math.round(estimate.total_cable_meters)} meter kabelføring.`
    )

    if (estimate.panel_requirements.total_groups_needed > 0) {
      parts.push(
        `El-tavle: ${estimate.panel_requirements.total_groups_needed} grupper inkl. ${estimate.panel_requirements.rcd_groups_needed} HPFI-grupper.`
      )
    }

    parts.push(
      'Arbejdet udføres af autoriserede elektrikere iht. gældende Stærkstrømsbekendtgørelse og DS/HD 60364.'
    )

    return parts.join(' ')
  }

  private generateLineItems(
    estimate: ProjectEstimate,
    input: OfferGenerationInput
  ): GeneratedLineItem[] {
    const items: GeneratedLineItem[] = []
    let position = 0

    // Material section
    items.push({
      position: ++position,
      section: 'Materialer',
      description: 'MATERIALER',
      quantity: 1,
      unit: 'stk',
      unit_price: 0,
      discount_percentage: 0,
      total: 0,
      is_optional: false,
      cost_price: null,
      notes: 'Sektion',
    })

    // Add room-based material lines
    for (const room of estimate.rooms) {
      const totalPoints = Object.values(room.points).reduce((s, v) => s + v, 0)
      items.push({
        position: ++position,
        section: 'Materialer',
        description: `${room.room_name} - Materialer (${totalPoints} el-punkter)`,
        quantity: 1,
        unit: 'sæt',
        unit_price: room.total_material_cost,
        discount_percentage: 0,
        total: room.total_material_cost,
        is_optional: false,
        cost_price: room.total_material_cost * 0.7,
        notes: this.formatRoomPointsSummary(room.points),
      })
    }

    // Panel materials
    if (estimate.panel_requirements.estimated_panel_cost > 0) {
      items.push({
        position: ++position,
        section: 'Materialer',
        description: `El-tavle: ${estimate.panel_requirements.total_groups_needed} grupper, ${estimate.panel_requirements.rcd_groups_needed} HPFI`,
        quantity: 1,
        unit: 'sæt',
        unit_price: estimate.panel_requirements.estimated_panel_cost,
        discount_percentage: 0,
        total: estimate.panel_requirements.estimated_panel_cost,
        is_optional: false,
        cost_price: estimate.panel_requirements.estimated_panel_cost * 0.7,
        notes: null,
      })
    }

    // Cable
    if (estimate.cable_summary.total_cable_cost > 0) {
      items.push({
        position: ++position,
        section: 'Materialer',
        description: `Kabelføring: ${Math.round(estimate.cable_summary.total_meters)} meter`,
        quantity: 1,
        unit: 'sæt',
        unit_price: estimate.cable_summary.total_cable_cost,
        discount_percentage: 0,
        total: estimate.cable_summary.total_cable_cost,
        is_optional: false,
        cost_price: estimate.cable_summary.total_cable_cost * 0.8,
        notes: estimate.cable_summary.cable_types.map((ct) => `${ct.type}: ${ct.total_meters}m`).join(', '),
      })
    }

    // Labor section
    items.push({
      position: ++position,
      section: 'Arbejdsløn',
      description: 'ARBEJDSLØN',
      quantity: 1,
      unit: 'stk',
      unit_price: 0,
      discount_percentage: 0,
      total: 0,
      is_optional: false,
      cost_price: null,
      notes: 'Sektion',
    })

    // Add room-based labor lines
    for (const room of estimate.rooms) {
      const hours = room.total_time_seconds / 3600
      items.push({
        position: ++position,
        section: 'Arbejdsløn',
        description: `${room.room_name} - Installation og montering`,
        quantity: Math.round(hours * 100) / 100,
        unit: 'time',
        unit_price: input.projectEstimate?.total_labor_cost
          ? input.projectEstimate.total_labor_cost / (input.projectEstimate.total_labor_hours || 1)
          : 495,
        discount_percentage: 0,
        total: room.total_labor_cost,
        is_optional: false,
        cost_price: room.total_labor_cost * 0.65,
        notes: null,
      })
    }

    // Transport/other costs
    if (estimate.total_other_costs > 0) {
      items.push({
        position: ++position,
        section: 'Transport',
        description: 'Transport og udstyr',
        quantity: 1,
        unit: 'sæt',
        unit_price: estimate.total_other_costs,
        discount_percentage: 0,
        total: estimate.total_other_costs,
        is_optional: false,
        cost_price: estimate.total_other_costs,
        notes: null,
      })
    }

    return items
  }

  private formatRoomPointsSummary(points: Record<string, number>): string {
    const labels: Record<string, string> = {
      outlets: 'stikkontakter',
      outlets_countertop: 'bordstik',
      outlets_ip44: 'stik IP44',
      switches: 'afbrydere',
      ceiling_lights: 'loftudtag',
      spots: 'spots',
      data_points: 'dataudtag',
      ventilation: 'ventilation',
      gulvvarme_tilslutning: 'gulvvarme',
      elbil_lader: 'elbilslader',
      ovn_tilslutning: 'ovntilslutning',
      induktion_tilslutning: 'induktion',
    }

    return Object.entries(points)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => `${qty} ${labels[key] || key}`)
      .join(', ')
  }

  private generateObsPoints(
    estimate: ProjectEstimate,
    input: OfferGenerationInput
  ): string[] {
    // Combine estimate OBS with template OBS
    const obsPoints = [...estimate.obs_points]

    // Add template-based OBS
    const templateObs = this.templates
      .filter((t) => t.template_type === 'obs_point' && t.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)

    // Filter relevant template OBS (avoid duplicates)
    for (const tmpl of templateObs) {
      if (!obsPoints.some((p) => p.includes(tmpl.template_text.substring(0, 30)))) {
        // Check applicability
        if (tmpl.applicable_building_types.length > 0) {
          if (input.building_type && !tmpl.applicable_building_types.includes(input.building_type)) {
            continue
          }
        }
        // Only add a few extra template OBS to avoid overwhelming
        if (obsPoints.length < 8) {
          obsPoints.push(tmpl.template_text)
        }
      }
    }

    return obsPoints
  }

  private generateDisclaimers(
    estimate: ProjectEstimate,
    input: OfferGenerationInput
  ): string[] {
    const disclaimers: string[] = []

    disclaimers.push(
      this.getTemplateText('disclaimer', input) ||
      'Eventuelle skjulte installationer, asbest eller andre uforudsete forhold er ikke inkluderet i tilbuddet.'
    )

    disclaimers.push(
      'Tillægsarbejde faktureres efter medgået tid og materialer.'
    )

    if (estimate.risk_analysis.risk_level !== 'low') {
      disclaimers.push(
        'Ved uforudsete forhold eller ændringer i projektets omfang vil der blive fremsendt tillægstilbud.'
      )
    }

    return disclaimers
  }

  private analyzeMargin(estimate: ProjectEstimate): MarginAnalysis {
    const costPrice = estimate.cost_price
    const salePrice = estimate.sale_price_excl_vat
    const marginPct = salePrice > 0 ? ((salePrice - costPrice) / salePrice) * 100 : 0
    const dbPct = estimate.db_percentage
    const dbPerHour = estimate.db_per_hour
    const hours = estimate.total_labor_hours

    const warnings: string[] = []
    const recommendations: string[] = []

    // Margin status
    const status = this.getMarginStatus(dbPct)

    if (status === 'critical') {
      warnings.push(`KRITISK: Dækningsgrad kun ${dbPct.toFixed(1)}% - projektet er i risiko for tab`)
      recommendations.push('Overvej at hæve prisen eller reducere omfanget')
    } else if (status === 'low') {
      warnings.push(`Lav dækningsgrad: ${dbPct.toFixed(1)}% (anbefalet min. 20%)`)
      recommendations.push('Overvej højere materialemargin eller reducerede rabatter')
    } else if (status === 'negative') {
      warnings.push(`NEGATIVT DB: Projektet giver tab på ${Math.abs(estimate.db_amount).toFixed(0)} kr`)
      recommendations.push('Projektet bør IKKE gennemføres med denne pris')
    }

    if (dbPerHour < 200 && hours > 0) {
      warnings.push(`Lav DB/time: ${dbPerHour.toFixed(0)} kr/time (anbefalet min. 200 kr/time)`)
    }

    if (hours > 40 && dbPct < 25) {
      recommendations.push('For projekter over 40 timer anbefales min. 25% dækningsgrad')
    }

    return {
      total_cost_price: costPrice,
      total_sale_price: salePrice,
      margin_percentage: Math.round(marginPct * 100) / 100,
      margin_amount: estimate.margin_amount,
      db_amount: estimate.db_amount,
      db_percentage: dbPct,
      db_per_hour: dbPerHour,
      total_hours: hours,
      status,
      warnings,
      recommendations,
    }
  }

  private getMarginStatus(dbPercentage: number): MarginAnalysis['status'] {
    if (dbPercentage < 0) return 'negative'
    if (dbPercentage < 10) return 'critical'
    if (dbPercentage < 20) return 'low'
    return 'healthy'
  }

  private generateRiskSummary(estimate: ProjectEstimate): string {
    const risk = estimate.risk_analysis
    const levelLabels: Record<string, string> = {
      low: 'Lav',
      medium: 'Middel',
      high: 'Høj',
      critical: 'Kritisk',
    }

    const parts = [
      `Risikoprofil: ${levelLabels[risk.risk_level]} (score: ${risk.risk_score}/5)`,
    ]

    if (risk.factors.length > 0) {
      parts.push(`Risikofaktorer: ${risk.factors.map((f) => f.description).join('; ')}`)
    }

    parts.push(`Anbefalet risikobuffer: ${risk.recommended_buffer_percentage}%`)

    return parts.join('. ')
  }

  private generateUpsellSuggestions(
    estimate: ProjectEstimate,
    input: OfferGenerationInput
  ): UpsellSuggestion[] {
    const suggestions: UpsellSuggestion[] = []

    // Check for missing surge protection
    if (!estimate.panel_requirements.surge_protection_recommended) {
      suggestions.push({
        title: 'Overspændingsbeskyttelse',
        description: 'Beskytter mod lynnedslag og spændingsspidser. Anbefales til alle installationer.',
        estimated_cost: 2500,
        estimated_additional_margin: 750,
        priority: 'high',
      })
    }

    // Smart home suggestion for new builds
    if (input.project_type === 'new_build') {
      suggestions.push({
        title: 'Smart Home forberedelse',
        description: 'Forberedelse til smart home med ekstra datapunkter og smarte afbrydere.',
        estimated_cost: 5000,
        estimated_additional_margin: 2000,
        priority: 'medium',
      })
    }

    // EV charger if not included
    const hasEvCharger = estimate.rooms.some((r) => (r.points.elbil_lader || 0) > 0)
    if (!hasEvCharger) {
      suggestions.push({
        title: 'Elbils-lader forberedelse',
        description: 'Forberedelse af kabel og gruppe til fremtidig elbilslader. Betydeligt billigere nu end som tillægsarbejde.',
        estimated_cost: 4500,
        estimated_additional_margin: 1500,
        priority: 'high',
      })
    }

    // LED upgrade
    const totalSpots = estimate.rooms.reduce((s, r) => s + (r.points.spots || 0), 0)
    if (totalSpots > 10) {
      suggestions.push({
        title: 'LED Premium opgradering',
        description: `Opgradering til premium LED spots (${totalSpots} stk) med bedre farvegengivelse og dæmpning.`,
        estimated_cost: totalSpots * 150,
        estimated_additional_margin: totalSpots * 60,
        priority: 'low',
      })
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  }

  private getTemplateText(
    type: string,
    input: OfferGenerationInput | Record<string, unknown>
  ): string | null {
    const matching = this.templates
      .filter((t) => t.template_type === type && t.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)

    if (matching.length === 0) return null

    // Find best match based on context
    const offerInput = input as OfferGenerationInput
    for (const tmpl of matching) {
      // Check building type match
      if (tmpl.applicable_building_types.length > 0) {
        if (offerInput.building_type && !tmpl.applicable_building_types.includes(offerInput.building_type)) {
          continue
        }
      }
      // Check project type match
      if (tmpl.applicable_project_types.length > 0) {
        if (offerInput.project_type && !tmpl.applicable_project_types.includes(offerInput.project_type)) {
          continue
        }
      }

      // Replace placeholders
      let text = tmpl.template_text
      text = text.replace('{{customer_name}}', offerInput.customer_name || '')
      text = text.replace('{{project_type}}', offerInput.project_type || '')
      text = text.replace('{{building_type}}', offerInput.building_type || '')

      return text
    }

    // Fallback to first template
    return matching[0].template_text
  }
}
