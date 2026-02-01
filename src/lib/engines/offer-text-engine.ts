/**
 * OFFER TEXT GENERATION ENGINE
 *
 * Automatically assembles offer texts using templates from offer_text_templates:
 * - Technical scope descriptions
 * - Installation notes
 * - OBS/caveat points
 * - Warranty information
 * - Terms and conditions
 *
 * Architecture Notes:
 * - Template-based generation (no AI calls yet)
 * - Supports scope hierarchy: component < category < room_type < global
 * - Conditions support for context-aware text selection
 * - Designed for future AI augmentation
 */

import type {
  OfferTextTemplate,
  OfferTextScope,
  OfferTextKey,
  OfferTextConditions,
} from '@/types/component-intelligence.types'
import type { GeneratedOfferContent } from '@/types/ai-intelligence.types'

// =====================================================
// TYPES
// =====================================================

export interface OfferTextContext {
  // Component context
  component_codes: string[]
  categories: string[]

  // Room context
  room_types: string[]
  room_count: number

  // Building context
  building_profile?: string
  building_age_years?: number
  building_type?: string

  // Calculation context
  total_price?: number
  component_count?: number
  has_bathroom_work?: boolean
  has_outdoor_work?: boolean
}

export interface AssembledOfferTexts {
  technical_scope: string[]
  obs_points: string[]
  warranty_notes: string[]
  installation_notes: string[]
  terms: string[]
  all_texts: Array<{
    key: OfferTextKey
    title: string | null
    content: string
    scope: OfferTextScope
    source_id: string
  }>
}

// =====================================================
// TEMPLATE EVALUATION
// =====================================================

/**
 * Check if a template's conditions are met
 */
function evaluateConditions(
  conditions: OfferTextConditions | null | undefined,
  context: OfferTextContext
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true // No conditions = always match
  }

  // Check min_quantity
  if (conditions.min_quantity !== undefined) {
    if ((context.component_count ?? 0) < conditions.min_quantity) {
      return false
    }
  }

  // Check max_quantity
  if (conditions.max_quantity !== undefined) {
    if ((context.component_count ?? 0) > conditions.max_quantity) {
      return false
    }
  }

  // Check variant_codes (if any variant matches)
  if (conditions.variant_codes && conditions.variant_codes.length > 0) {
    // For now, we don't have variant info in context - skip this check
    // Future: Add variant tracking to context
  }

  // Check building_profiles
  if (conditions.building_profiles && conditions.building_profiles.length > 0) {
    if (!context.building_profile || !conditions.building_profiles.includes(context.building_profile)) {
      return false
    }
  }

  // Check room_types (if any room type matches)
  if (conditions.room_types && conditions.room_types.length > 0) {
    const hasMatchingRoom = context.room_types.some(rt => conditions.room_types!.includes(rt))
    if (!hasMatchingRoom) {
      return false
    }
  }

  // Check component_codes (if any component matches)
  if (conditions.component_codes && conditions.component_codes.length > 0) {
    const hasMatchingComponent = context.component_codes.some(cc => conditions.component_codes!.includes(cc))
    if (!hasMatchingComponent) {
      return false
    }
  }

  return true
}

/**
 * Calculate relevance score for template sorting
 * Higher score = more specific/relevant template
 */
function calculateRelevanceScore(
  template: OfferTextTemplate,
  context: OfferTextContext
): number {
  let score = template.priority * 10 // Base score from priority

  // Scope specificity bonus
  const scopeScores: Record<OfferTextScope, number> = {
    component: 40,
    category: 30,
    room_type: 20,
    global: 10,
  }
  score += scopeScores[template.scope_type]

  // Condition specificity bonus
  if (template.conditions) {
    const conditionCount = Object.keys(template.conditions).filter(k => {
      const val = template.conditions[k as keyof OfferTextConditions]
      return val !== undefined && val !== null && (Array.isArray(val) ? val.length > 0 : true)
    }).length
    score += conditionCount * 5
  }

  // Required templates get slight boost
  if (template.is_required) {
    score += 5
  }

  return score
}

// =====================================================
// TEMPLATE VARIABLE SUBSTITUTION
// =====================================================

/**
 * Replace template variables with context values
 */
function substituteVariables(text: string, context: OfferTextContext): string {
  let result = text

  // Room count
  result = result.replace(/\{\{room_count\}\}/g, context.room_count.toString())
  result = result.replace(/\{\{antal_rum\}\}/g, context.room_count.toString())

  // Component count
  result = result.replace(/\{\{component_count\}\}/g, (context.component_count ?? 0).toString())
  result = result.replace(/\{\{antal_komponenter\}\}/g, (context.component_count ?? 0).toString())

  // Total price
  if (context.total_price) {
    const formattedPrice = new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
    }).format(context.total_price)
    result = result.replace(/\{\{total_price\}\}/g, formattedPrice)
    result = result.replace(/\{\{samlet_pris\}\}/g, formattedPrice)
  }

  // Building type
  if (context.building_type) {
    result = result.replace(/\{\{building_type\}\}/g, context.building_type)
    result = result.replace(/\{\{bygningstype\}\}/g, context.building_type)
  }

  // Room types list
  if (context.room_types.length > 0) {
    const roomList = context.room_types.join(', ')
    result = result.replace(/\{\{room_types\}\}/g, roomList)
    result = result.replace(/\{\{rumtyper\}\}/g, roomList)
  }

  return result
}

// =====================================================
// MAIN ENGINE FUNCTIONS
// =====================================================

/**
 * Assemble offer texts from templates based on context
 *
 * @param templates - Available offer text templates (from database)
 * @param context - Current offer/calculation context
 * @returns Assembled texts organized by type
 */
export function assembleOfferTexts(
  templates: OfferTextTemplate[],
  context: OfferTextContext
): AssembledOfferTexts {
  // Filter active templates
  const activeTemplates = templates.filter(t => t.is_active)

  // Evaluate and score templates
  const scoredTemplates = activeTemplates
    .filter(t => evaluateConditions(t.conditions, context))
    .map(t => ({
      template: t,
      score: calculateRelevanceScore(t, context),
    }))
    .sort((a, b) => b.score - a.score)

  // Group by key and deduplicate (keep highest scored)
  const selectedByKey: Map<string, typeof scoredTemplates[0]> = new Map()

  for (const scored of scoredTemplates) {
    const key = `${scored.template.template_key}-${scored.template.scope_id || 'global'}`

    // For required templates, always include
    // For optional, only include if higher score than existing
    if (scored.template.is_required || !selectedByKey.has(key)) {
      selectedByKey.set(key, scored)
    }
  }

  // Collect by template key
  const result: AssembledOfferTexts = {
    technical_scope: [],
    obs_points: [],
    warranty_notes: [],
    installation_notes: [],
    terms: [],
    all_texts: [],
  }

  for (const [, scored] of selectedByKey) {
    const { template } = scored
    const processedContent = substituteVariables(template.content, context)

    // Add to all_texts
    result.all_texts.push({
      key: template.template_key,
      title: template.title,
      content: processedContent,
      scope: template.scope_type,
      source_id: template.id,
    })

    // Categorize
    switch (template.template_key) {
      case 'description':
      case 'technical_note':
        result.technical_scope.push(processedContent)
        break
      case 'obs_point':
        result.obs_points.push(processedContent)
        break
      case 'warranty':
      case 'warranty_note':
        result.warranty_notes.push(processedContent)
        break
      case 'installation_note':
        result.installation_notes.push(processedContent)
        break
      case 'terms':
        result.terms.push(processedContent)
        break
    }
  }

  return result
}

/**
 * Generate offer content structure for offers table
 *
 * @param templates - Available offer text templates
 * @param context - Current context
 * @returns GeneratedOfferContent for storage
 */
export function generateOfferContent(
  templates: OfferTextTemplate[],
  context: OfferTextContext
): GeneratedOfferContent {
  const assembled = assembleOfferTexts(templates, context)

  return {
    technical_scope: assembled.technical_scope,
    exclusions: [], // Future: Extract from templates
    assumptions: [], // Future: Extract from templates
    obs_points: assembled.obs_points,
    warranty_notes: assembled.warranty_notes,
  }
}

/**
 * Get default templates for a new offer
 * Returns global templates that should always be included
 *
 * @param templates - Available templates
 * @returns Required and high-priority global templates
 */
export function getDefaultTemplates(templates: OfferTextTemplate[]): OfferTextTemplate[] {
  return templates
    .filter(t => t.is_active && t.scope_type === 'global' && (t.is_required || t.priority >= 5))
    .sort((a, b) => b.priority - a.priority)
}

/**
 * Get templates relevant to specific components
 *
 * @param templates - Available templates
 * @param componentCodes - Component codes in the offer
 * @returns Templates matched to these components
 */
export function getComponentTemplates(
  templates: OfferTextTemplate[],
  componentCodes: string[]
): OfferTextTemplate[] {
  return templates
    .filter(t => {
      if (!t.is_active) return false
      if (t.scope_type !== 'component') return false
      if (!t.scope_id) return false
      return componentCodes.includes(t.scope_id)
    })
    .sort((a, b) => b.priority - a.priority)
}

/**
 * Get templates relevant to specific room types
 *
 * @param templates - Available templates
 * @param roomTypes - Room type codes in the offer
 * @returns Templates matched to these room types
 */
export function getRoomTemplates(
  templates: OfferTextTemplate[],
  roomTypes: string[]
): OfferTextTemplate[] {
  return templates
    .filter(t => {
      if (!t.is_active) return false
      if (t.scope_type !== 'room_type') return false
      if (!t.scope_id) return false
      return roomTypes.includes(t.scope_id)
    })
    .sort((a, b) => b.priority - a.priority)
}

/**
 * Merge manually edited texts with generated texts
 * Preserves user edits while adding new template-generated content
 *
 * @param existing - Existing offer texts (may include edits)
 * @param generated - Newly generated texts
 * @returns Merged texts preserving edits
 */
export function mergeOfferTexts(
  existing: GeneratedOfferContent | null,
  generated: GeneratedOfferContent
): GeneratedOfferContent {
  if (!existing) {
    return generated
  }

  // For each category, prefer existing if non-empty
  return {
    technical_scope: existing.technical_scope?.length
      ? existing.technical_scope
      : generated.technical_scope,
    exclusions: existing.exclusions?.length
      ? existing.exclusions
      : generated.exclusions,
    assumptions: existing.assumptions?.length
      ? existing.assumptions
      : generated.assumptions,
    obs_points: existing.obs_points?.length
      ? existing.obs_points
      : generated.obs_points,
    warranty_notes: existing.warranty_notes?.length
      ? existing.warranty_notes
      : generated.warranty_notes,
    optional_upgrades: existing.optional_upgrades, // Always preserve upgrades
  }
}
