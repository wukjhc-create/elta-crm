/**
 * Auto Offer Text Generator
 *
 * Generates professional Danish offer text from:
 * - Project interpretation
 * - Calculation results
 * - Risk analysis
 *
 * Output sections:
 * - Arbejdsbeskrivelse (Work description)
 * - Omfang (Scope)
 * - Materialer (Materials)
 * - Tidsplan (Timeline)
 * - Forbehold (Reservations)
 * - Betingelser (Terms)
 */

import type {
  ProjectInterpretation,
  AutoCalculation,
  OfferTextSections,
  AutoOfferText,
  CalculationComponent,
  CalculationMaterial,
} from '@/types/auto-project.types'
import type { RiskAnalysis } from './riskEngine'
import { formatCurrency, formatHours, estimateWorkdays } from './calculationEngine'

// =====================================================
// Types
// =====================================================

interface GeneratorContext {
  interpretation: ProjectInterpretation
  calculation: AutoCalculation
  riskAnalysis: RiskAnalysis
  customerName?: string
  projectAddress?: string
}

// =====================================================
// Section Generators
// =====================================================

function generateWorkDescription(ctx: GeneratorContext): string {
  const { interpretation, calculation } = ctx
  const lines: string[] = []

  // Building info
  const buildingText = getBuildingDescription(interpretation)
  lines.push(`El-installation i ${buildingText}.`)
  lines.push('')

  // Main work areas
  const workAreas = groupComponentsByCategory(calculation.components)
  lines.push('Arbejdet omfatter:')
  lines.push('')

  for (const [category, components] of Object.entries(workAreas)) {
    const categoryName = getCategoryName(category)
    const items = components.map((c) => `${c.quantity} stk. ${c.name.toLowerCase()}`).join(', ')
    lines.push(`• ${categoryName}: ${items}`)
  }

  // Panel work if any
  const panelWork = calculation.components.find((c) => c.category === 'panel')
  if (panelWork) {
    lines.push('')
    lines.push('Tavlearbejde indgår i projektet.')
  }

  return lines.join('\n')
}

function generateScopeDescription(ctx: GeneratorContext): string {
  const { interpretation, calculation } = ctx
  const lines: string[] = []

  // Summary counts
  const totalPoints = calculation.components.reduce((sum, c) => sum + c.quantity, 0)

  lines.push('OMFANG')
  lines.push('------')
  lines.push(`Samlet antal elpunkter: ${totalPoints} stk.`)
  lines.push('')

  // Detail by category
  lines.push('Specificeret:')

  // Group and format
  const grouped = groupComponentsByCategory(calculation.components)

  for (const [category, components] of Object.entries(grouped)) {
    lines.push('')
    lines.push(`${getCategoryName(category)}:`)

    for (const comp of components) {
      lines.push(`  - ${comp.name}: ${comp.quantity} ${comp.unit}`)
    }
  }

  // Cable work
  if (calculation.materials.some((m) => m.name.toLowerCase().includes('kabel'))) {
    lines.push('')
    lines.push('Kabelarbejde:')

    const cables = calculation.materials.filter((m) => m.name.toLowerCase().includes('kabel'))
    for (const cable of cables) {
      lines.push(`  - ${cable.name}: ${cable.quantity} ${cable.unit}`)
    }
  }

  return lines.join('\n')
}

function generateMaterialsDescription(ctx: GeneratorContext): string {
  const { calculation } = ctx
  const lines: string[] = []

  lines.push('MATERIALER')
  lines.push('----------')
  lines.push('Følgende materialer er inkluderet i tilbuddet:')
  lines.push('')

  // Group materials by type
  const cables = calculation.materials.filter(
    (m) => m.name.toLowerCase().includes('kabel') || m.name.toLowerCase().includes('ledning')
  )
  const components = calculation.materials.filter(
    (m) =>
      m.name.toLowerCase().includes('kontakt') ||
      m.name.toLowerCase().includes('afbryder') ||
      m.name.toLowerCase().includes('spot')
  )
  const other = calculation.materials.filter(
    (m) =>
      !cables.includes(m) && !components.includes(m)
  )

  if (cables.length > 0) {
    lines.push('Kabler og ledninger:')
    for (const mat of cables) {
      lines.push(`  • ${mat.name} - ${mat.quantity} ${mat.unit}`)
    }
    lines.push('')
  }

  if (components.length > 0) {
    lines.push('Komponenter:')
    for (const mat of components) {
      lines.push(`  • ${mat.name} - ${mat.quantity} ${mat.unit}`)
    }
    lines.push('')
  }

  if (other.length > 0) {
    lines.push('Øvrige materialer:')
    for (const mat of other) {
      lines.push(`  • ${mat.name} - ${mat.quantity} ${mat.unit}`)
    }
    lines.push('')
  }

  lines.push('Alle materialer er af professionel kvalitet.')
  lines.push('Materialespecifikationer kan ændres efter aftale.')

  return lines.join('\n')
}

function generateTimelineDescription(ctx: GeneratorContext): string {
  const { calculation } = ctx
  const lines: string[] = []

  const hours = calculation.time.total_hours
  const workdays = estimateWorkdays(hours)

  lines.push('TIDSPLAN')
  lines.push('--------')
  lines.push('')
  lines.push(`Estimeret arbejdstid: ${formatHours(hours)}`)
  lines.push(`Forventet varighed: ${workdays} arbejdsdag${workdays > 1 ? 'e' : ''}`)
  lines.push('')

  // Breakdown
  if (calculation.time.breakdown.length > 0) {
    lines.push('Fordeling:')
    for (const item of calculation.time.breakdown) {
      lines.push(`  • ${item.description}: ${formatHours(item.hours)}`)
    }
    lines.push('')
  }

  lines.push('Tidsplanen er vejledende og afhænger af:')
  lines.push('  • Adgangsforhold på stedet')
  lines.push('  • Evt. koordinering med andre håndværkere')
  lines.push('  • Vejrforhold ved udendørs arbejde')
  lines.push('')
  lines.push('Præcis startdato aftales særskilt.')

  return lines.join('\n')
}

function generateReservations(ctx: GeneratorContext): string {
  const { riskAnalysis } = ctx
  const lines: string[] = []

  lines.push('FORBEHOLD')
  lines.push('---------')
  lines.push('')

  if (riskAnalysis.offer_reservations.length > 0) {
    lines.push('Særlige forbehold for dette projekt:')
    lines.push('')
    for (const reservation of riskAnalysis.offer_reservations) {
      lines.push(`• ${reservation}`)
    }
    lines.push('')
  }

  // Standard reservations
  lines.push('Generelle forbehold:')
  lines.push('')
  lines.push('• Tilbuddet forudsætter normal adgang til arbejdsstedet.')
  lines.push('• Skjulte forhold, der kræver ekstra arbejde, faktureres særskilt.')
  lines.push('• Tilbuddet omfatter ikke maler- eller tømrerarbejde.')
  lines.push('• El-attest (lovpligtig) udstedes ved projektets afslutning.')

  if (riskAnalysis.requires_inspection) {
    lines.push('')
    lines.push('BEMÆRK: Besigtigelse anbefales før endelig ordrebekræftelse.')
  }

  return lines.join('\n')
}

function generateTerms(ctx: GeneratorContext): string {
  const { calculation } = ctx
  const lines: string[] = []

  lines.push('BETINGELSER')
  lines.push('-----------')
  lines.push('')
  lines.push('Betaling:')
  lines.push('  • Betaling: 8 dage netto fra fakturadato')

  if (calculation.price.total_price > 50000) {
    lines.push('  • Ved ordrer over 50.000 kr: 30% ved ordrebekræftelse, rest ved aflevering')
  }

  lines.push('')
  lines.push('Tilbuddets gyldighed:')
  lines.push('  • Tilbuddet er gældende i 30 dage fra dato')
  lines.push('  • Priserne er ekskl. moms')
  lines.push('')
  lines.push('Garanti:')
  lines.push('  • 2 års garanti på udført arbejde')
  lines.push('  • Producentgaranti på materialer iht. producentens vilkår')
  lines.push('')
  lines.push('Ansvar og forsikring:')
  lines.push('  • Entreprisen udføres iht. gældende lovgivning')
  lines.push('  • Autoriseret elinstallatørvirksomhed')
  lines.push('  • Erhvervsansvarsforsikring tegnet')

  return lines.join('\n')
}

function generateFullOfferText(sections: OfferTextSections, ctx: GeneratorContext): string {
  const { calculation, customerName, projectAddress } = ctx
  const lines: string[] = []

  // Header
  lines.push('=' .repeat(50))
  lines.push('TILBUD - EL-INSTALLATION')
  lines.push('=' .repeat(50))
  lines.push('')

  if (customerName) {
    lines.push(`Til: ${customerName}`)
  }
  if (projectAddress) {
    lines.push(`Adresse: ${projectAddress}`)
  }
  lines.push(`Dato: ${new Intl.DateTimeFormat('da-DK').format(new Date())}`)
  lines.push('')

  // Price summary at top
  lines.push('-'.repeat(50))
  lines.push('TILBUDSPRIS')
  lines.push('-'.repeat(50))
  lines.push('')
  lines.push(`Materialer:     ${formatCurrency(calculation.price.material_cost)}`)
  lines.push(`Arbejdsløn:     ${formatCurrency(calculation.price.labor_cost)}`)
  lines.push(`                ${'-'.repeat(20)}`)
  lines.push(`Subtotal:       ${formatCurrency(calculation.price.subtotal)}`)
  lines.push('')
  lines.push(`TOTAL PRIS:     ${formatCurrency(calculation.price.total_price)} ekskl. moms`)
  lines.push('')

  // Sections
  lines.push('-'.repeat(50))
  lines.push(sections.work_description)
  lines.push('')
  lines.push('-'.repeat(50))
  lines.push(sections.scope_description)
  lines.push('')
  lines.push('-'.repeat(50))
  lines.push(sections.materials_description)
  lines.push('')
  lines.push('-'.repeat(50))
  lines.push(sections.timeline_description)
  lines.push('')
  lines.push('-'.repeat(50))
  lines.push(sections.reservations)
  lines.push('')
  lines.push('-'.repeat(50))
  lines.push(sections.terms)
  lines.push('')

  // Footer
  lines.push('=' .repeat(50))
  lines.push('Med venlig hilsen')
  lines.push('')
  lines.push('Elta Solar ApS')
  lines.push('Autoriseret elinstallatør')
  lines.push('=' .repeat(50))

  return lines.join('\n')
}

// =====================================================
// Helper Functions
// =====================================================

function getBuildingDescription(interpretation: ProjectInterpretation): string {
  const parts: string[] = []

  // Building type
  const buildingTypes: Record<string, string> = {
    house: 'villa/parcelhus',
    apartment: 'lejlighed',
    commercial: 'erhvervslokale',
    industrial: 'industribygning',
    unknown: 'bygning',
  }

  parts.push(buildingTypes[interpretation.building_type] || 'bygning')

  // Size
  if (interpretation.building_size_m2) {
    parts.push(`på ${interpretation.building_size_m2} m²`)
  }

  return parts.join(' ')
}

function groupComponentsByCategory(
  components: CalculationComponent[]
): Record<string, CalculationComponent[]> {
  const grouped: Record<string, CalculationComponent[]> = {}

  for (const comp of components) {
    const cat = comp.category || 'other'
    if (!grouped[cat]) {
      grouped[cat] = []
    }
    grouped[cat].push(comp)
  }

  return grouped
}

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    outlet: 'Stikkontakter',
    switch: 'Afbrydere og dæmpere',
    lighting: 'Belysning',
    power: 'Kraftinstallation',
    data: 'Data og TV',
    panel: 'Tavlearbejde',
    other: 'Øvrige',
  }

  return names[category] || category
}

// =====================================================
// Main Export
// =====================================================

export function generateOfferText(
  interpretation: ProjectInterpretation,
  calculation: AutoCalculation,
  riskAnalysis: RiskAnalysis,
  options?: {
    customerName?: string
    projectAddress?: string
  }
): Omit<AutoOfferText, 'id' | 'generated_at'> {
  const ctx: GeneratorContext = {
    interpretation,
    calculation,
    riskAnalysis,
    customerName: options?.customerName,
    projectAddress: options?.projectAddress,
  }

  const sections: OfferTextSections = {
    work_description: generateWorkDescription(ctx),
    scope_description: generateScopeDescription(ctx),
    materials_description: generateMaterialsDescription(ctx),
    timeline_description: generateTimelineDescription(ctx),
    reservations: generateReservations(ctx),
    terms: generateTerms(ctx),
  }

  const full_offer_text = generateFullOfferText(sections, ctx)

  return {
    calculation_id: calculation.id,
    sections,
    full_offer_text,
    is_edited: false,
  }
}

// =====================================================
// Utility Exports
// =====================================================

export function formatOfferSectionForDisplay(section: string): string {
  // Convert plain text to markdown-friendly format
  return section
    .replace(/^(.*):$/gm, '**$1:**')
    .replace(/^  • /gm, '- ')
    .replace(/^-{2,}$/gm, '---')
    .replace(/^={2,}$/gm, '===')
}

export function exportOfferAsPDF(_offerText: AutoOfferText): Promise<Blob> {
  // Placeholder - would integrate with PDF generation library
  throw new Error('PDF export not yet implemented')
}
