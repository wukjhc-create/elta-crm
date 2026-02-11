/**
 * PRICE EXPLANATION ENGINE
 *
 * Generates customer-facing price breakdowns and explanations:
 * - Summary of what's included
 * - Labor vs material breakdown
 * - Room-by-room costs (if applicable)
 * - Value propositions
 * - Quality guarantees
 *
 * Architecture Notes:
 * - Template-based generation (no AI calls yet)
 * - Multiple format options: simple, detailed, itemized
 * - Danish language output
 * - Designed for future AI enhancement
 */

import type {
  PriceExplanationInput,
  PriceExplanationResult,
  PriceExplanationSections,
  PriceBreakdownData,
  PriceBreakdownCategory,
  PriceBreakdownRoom,
  ProjectType,
  BuildingType,
} from '@/types/ai-intelligence.types'
import { formatCurrency } from '@/lib/utils/format'

// =====================================================
// FORMATTING UTILITIES
// =====================================================

/**
 * Format number as percentage
 */
function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

/**
 * Format hours from minutes
 */
function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours === 0) {
    return `${mins} min`
  }
  if (mins === 0) {
    return `${hours} time${hours !== 1 ? 'r' : ''}`
  }
  return `${hours} time${hours !== 1 ? 'r' : ''} ${mins} min`
}

// =====================================================
// TEXT GENERATION
// =====================================================

/**
 * Generate summary based on project type and size
 */
function generateSummary(input: PriceExplanationInput): string {
  const componentCount = input.components.length
  const totalItems = input.components.reduce((sum, c) => sum + c.quantity, 0)

  const projectTypeLabels: Record<ProjectType, string> = {
    renovation: 'renovering',
    new_build: 'nybyggeri',
    extension: 'tilbygning',
    maintenance: 'vedligeholdelse',
  }

  const projectLabel = input.project_type
    ? projectTypeLabels[input.project_type]
    : 'el-installation'

  let summary = `Tilbuddet dækker ${projectLabel}`

  if (input.rooms && input.rooms.length > 0) {
    if (input.rooms.length === 1) {
      summary += ` i ${input.rooms[0].toLowerCase()}`
    } else {
      summary += ` i ${input.rooms.length} rum`
    }
  }

  summary += ` med ${totalItems} enheder fordelt på ${componentCount} typer arbejde.`

  return summary
}

/**
 * Generate labor explanation
 */
function generateLaborExplanation(input: PriceExplanationInput): string {
  const laborPercent = (input.labor_cost / input.total_price) * 100

  let explanation = `Arbejdsløn udgør ${formatCurrency(input.labor_cost)} (${formatPercent(laborPercent)} af totalprisen). `

  if (laborPercent > 60) {
    explanation += 'Denne type arbejde er primært arbejdstid, da installationen kræver faglig ekspertise.'
  } else if (laborPercent > 40) {
    explanation += 'Prisen er fordelt mellem materialer og kvalificeret installation.'
  } else {
    explanation += 'Materialerne udgør størstedelen af prisen, mens installationen er effektiv.'
  }

  return explanation
}

/**
 * Generate material explanation
 */
function generateMaterialExplanation(input: PriceExplanationInput): string {
  const materialPercent = (input.material_cost / input.total_price) * 100

  let explanation = `Materialer udgør ${formatCurrency(input.material_cost)} (${formatPercent(materialPercent)} af totalprisen). `

  explanation += 'Alle materialer er af professionel kvalitet og leveres af anerkendte leverandører.'

  return explanation
}

/**
 * Generate value propositions
 */
function generateValuePropositions(input: PriceExplanationInput): string[] {
  const propositions: string[] = [
    'Autoriseret el-installatør med fuldt ansvar',
    'Udvidet garanti på udført arbejde',
    'Professionelle materialer fra anerkendte leverandører',
  ]

  // Add project-specific propositions
  if (input.building_type === 'house' || input.building_type === 'apartment') {
    propositions.push('Minimal gene i hjemmet - vi rydder op efter os')
  }

  if (input.components.length > 5) {
    propositions.push('Samlet pris for hele projektet - ingen skjulte omkostninger')
  }

  return propositions
}

/**
 * Generate what's included
 */
function generateWhatsIncluded(input: PriceExplanationInput): string[] {
  const included: string[] = []

  // Add main components
  for (const comp of input.components) {
    if (comp.quantity > 1) {
      included.push(`${comp.quantity}x ${comp.name}`)
    } else {
      included.push(comp.name)
    }
  }

  // Add standard inclusions
  included.push('Alle nødvendige materialer')
  included.push('Professionel installation')
  included.push('Oprydning efter arbejdet')
  included.push('Garanti på udført arbejde')

  return included
}

/**
 * Generate what's not included (exclusions)
 */
function generateWhatsNotIncluded(input: PriceExplanationInput): string[] {
  const excluded: string[] = [
    'Evt. nødvendig forstærkning af eksisterende installation',
    'Udbedring af skjulte fejl i eksisterende el',
    'Malearbejde efter installationen',
    'Tilladelser og gebyrer (hvis påkrævet)',
  ]

  // Building-specific exclusions
  if (input.building_type === 'apartment') {
    excluded.push('Arbejde på fælles el-tavle (koordineres separat)')
  }

  return excluded
}

/**
 * Generate quality guarantees
 */
function generateQualityGuarantees(): string[] {
  return [
    '2 års garanti på alt udført arbejde',
    'Alle materialer har fabriksgaranti',
    'Autoriseret el-installatør med lovpligtig ansvarsforsikring',
    'Elinstallationsrapport udleveres ved afslutning',
  ]
}

/**
 * Generate payment terms
 */
function generatePaymentTerms(totalPrice: number): string {
  if (totalPrice > 50000) {
    return 'Betaling: 30% ved accept, 40% ved påbegyndelse, 30% ved afslutning. Faktura fremsendes med 8 dages betalingsfrist.'
  }
  return 'Betaling: Faktura fremsendes ved afslutning af arbejdet med 8 dages betalingsfrist.'
}

// =====================================================
// BREAKDOWN GENERATION
// =====================================================

/**
 * Generate category breakdown
 */
function generateCategoryBreakdown(input: PriceExplanationInput): PriceBreakdownCategory[] {
  const categories: PriceBreakdownCategory[] = [
    {
      name: 'Arbejdsløn',
      amount: input.labor_cost,
      percentage: (input.labor_cost / input.total_price) * 100,
      description: 'Installation og montering af autoriseret elektriker',
    },
    {
      name: 'Materialer',
      amount: input.material_cost,
      percentage: (input.material_cost / input.total_price) * 100,
      description: 'Kvalitetskomponenter fra anerkendte leverandører',
    },
  ]

  // Calculate margin/overhead as part of labor for transparency
  const sum = input.labor_cost + input.material_cost
  if (input.total_price > sum * 1.01) {
    // Only show if there's meaningful overhead
    const overhead = input.total_price - sum
    categories.push({
      name: 'Administration & garanti',
      amount: overhead,
      percentage: (overhead / input.total_price) * 100,
      description: 'Inkluderer garanti, forsikring og projektkoordinering',
    })
  }

  return categories
}

/**
 * Generate room breakdown if room info available
 */
function generateRoomBreakdown(
  input: PriceExplanationInput,
  componentsByRoom: Map<string, { count: number; price: number }>
): PriceBreakdownRoom[] {
  const rooms: PriceBreakdownRoom[] = []

  for (const [room, data] of componentsByRoom) {
    rooms.push({
      name: room,
      amount: data.price,
      component_count: data.count,
    })
  }

  return rooms.sort((a, b) => b.amount - a.amount)
}

// =====================================================
// MAIN ENGINE FUNCTIONS
// =====================================================

/**
 * Generate comprehensive price explanation
 *
 * @param input - Price explanation input with costs and components
 * @returns Structured price explanation with sections and breakdown
 */
export function generatePriceExplanation(input: PriceExplanationInput): PriceExplanationResult {
  // Generate sections
  const sections: PriceExplanationSections = {
    summary: generateSummary(input),
    labor_explanation: generateLaborExplanation(input),
    material_explanation: generateMaterialExplanation(input),
    value_propositions: generateValuePropositions(input),
    whats_included: generateWhatsIncluded(input),
    whats_not_included: generateWhatsNotIncluded(input),
    quality_guarantees: generateQualityGuarantees(),
    payment_terms: generatePaymentTerms(input.total_price),
  }

  // Generate breakdown
  const breakdown: PriceBreakdownData = {
    categories: generateCategoryBreakdown(input),
    rooms: input.rooms
      ? generateRoomBreakdown(input, new Map(input.rooms.map(r => [r, { count: 0, price: 0 }])))
      : undefined,
    labor_hours: undefined, // Would need time data
    material_items: input.components.reduce((sum, c) => sum + c.quantity, 0),
  }

  return {
    sections,
    breakdown,
  }
}

/**
 * Generate simple customer-facing summary
 *
 * @param input - Price explanation input
 * @returns Single paragraph summary
 */
export function generateSimpleSummary(input: PriceExplanationInput): string {
  const laborPercent = Math.round((input.labor_cost / input.total_price) * 100)
  const materialPercent = 100 - laborPercent

  return `
Den samlede pris på ${formatCurrency(input.total_price)} inkluderer alt: materialer (${materialPercent}%) og professionel installation (${laborPercent}%).
Arbejdet udføres af autoriseret el-installatør med fuld garanti.
Alle materialer er professionel kvalitet fra anerkendte leverandører.
  `.trim()
}

/**
 * Generate bullet point summary for quick overview
 *
 * @param input - Price explanation input
 * @returns Array of bullet points
 */
export function generateBulletSummary(input: PriceExplanationInput): string[] {
  const laborPercent = Math.round((input.labor_cost / input.total_price) * 100)
  const componentCount = input.components.length
  const totalItems = input.components.reduce((sum, c) => sum + c.quantity, 0)

  return [
    `✓ Samlet pris: ${formatCurrency(input.total_price)} inkl. moms`,
    `✓ ${totalItems} enheder fordelt på ${componentCount} typer installation`,
    `✓ Materialer: ${formatCurrency(input.material_cost)} (${100 - laborPercent}%)`,
    `✓ Installation: ${formatCurrency(input.labor_cost)} (${laborPercent}%)`,
    `✓ Alt arbejde udføres af autoriseret el-installatør`,
    `✓ Inkl. garanti og professionelle materialer`,
  ]
}

/**
 * Format price breakdown as HTML for offer documents
 *
 * @param input - Price explanation input
 * @returns HTML string for price breakdown section
 */
export function formatPriceBreakdownHtml(input: PriceExplanationInput): string {
  const result = generatePriceExplanation(input)

  let html = '<div class="price-breakdown">'

  // Categories
  html += '<h3>Prisfordeling</h3>'
  html += '<table>'
  html += '<tr><th>Kategori</th><th>Beløb</th><th>Andel</th></tr>'

  for (const cat of result.breakdown.categories || []) {
    html += `<tr><td>${cat.name}</td><td>${formatCurrency(cat.amount)}</td><td>${formatPercent(cat.percentage)}</td></tr>`
  }

  html += `<tr class="total"><td><strong>I alt</strong></td><td><strong>${formatCurrency(input.total_price)}</strong></td><td><strong>100%</strong></td></tr>`
  html += '</table>'

  // What's included
  html += '<h3>Inkluderet i prisen</h3>'
  html += '<ul>'
  for (const item of result.sections.whats_included || []) {
    html += `<li>${item}</li>`
  }
  html += '</ul>'

  // Quality guarantees
  html += '<h3>Garanti og kvalitet</h3>'
  html += '<ul>'
  for (const item of result.sections.quality_guarantees || []) {
    html += `<li>${item}</li>`
  }
  html += '</ul>'

  html += '</div>'

  return html
}

/**
 * Generate price comparison data for upselling
 *
 * @param baseInput - Current calculation
 * @param upgrades - Possible upgrade options
 * @returns Comparison data
 */
export function generatePriceComparison(
  baseInput: PriceExplanationInput,
  upgrades: Array<{ name: string; price_addition: number; description: string }>
): Array<{
  tier: string
  price: number
  includes: string[]
  recommended: boolean
}> {
  const tiers = [
    {
      tier: 'Standard',
      price: baseInput.total_price,
      includes: baseInput.components.map(c => c.name),
      recommended: true,
    },
  ]

  if (upgrades.length > 0) {
    const upgradePrice = upgrades.reduce((sum, u) => sum + u.price_addition, 0)
    tiers.push({
      tier: 'Premium',
      price: baseInput.total_price + upgradePrice,
      includes: [
        ...baseInput.components.map(c => c.name),
        ...upgrades.map(u => u.name),
      ],
      recommended: false,
    })
  }

  return tiers
}
