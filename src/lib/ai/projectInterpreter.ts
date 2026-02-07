/**
 * Project Interpreter AI
 *
 * Analyzes free-text project descriptions and extracts:
 * - Building type and characteristics
 * - Room breakdown
 * - Electrical point requirements
 * - Complexity factors
 * - Risk factors
 */

import type {
  ProjectInterpretation,
  BuildingType,
  Room,
  ElectricalPoints,
  CableRequirements,
  PanelRequirements,
  ComplexityFactor,
  RiskFactor,
} from '@/types/auto-project.types'

// =====================================================
// Types
// =====================================================

interface InterpretationResult {
  interpretation: Omit<ProjectInterpretation, 'id' | 'created_by' | 'created_at'>
  confidence: number
  warnings: string[]
}

interface DetectionPattern {
  pattern: RegExp
  value: string | number | boolean
  category?: string
}

// =====================================================
// Detection Patterns
// =====================================================

const BUILDING_TYPE_PATTERNS: { type: BuildingType; patterns: RegExp[] }[] = [
  {
    type: 'house',
    patterns: [
      /\b(hus|villa|parcelhus|rækkehus|bungalow)\b/i,
      /\b(enfamiliehus|enfamilies|sommerhus)\b/i,
    ],
  },
  {
    type: 'apartment',
    patterns: [
      /\b(lejlighed|ejerlejlighed|andel|etage)\b/i,
      /\b(penthouse|stueetage)\b/i,
    ],
  },
  {
    type: 'commercial',
    patterns: [
      /\b(erhverv|kontor|butik|restaurant|cafe)\b/i,
      /\b(klinik|salon|værksted)\b/i,
    ],
  },
  {
    type: 'industrial',
    patterns: [
      /\b(industri|lager|fabrik|produktion|hal)\b/i,
    ],
  },
]

const SIZE_PATTERNS: RegExp[] = [
  /(\d+)\s*m2/i,
  /(\d+)\s*m²/i,
  /(\d+)\s*kvm/i,
  /(\d+)\s*kvadratmeter/i,
]

const AGE_PATTERNS: DetectionPattern[] = [
  { pattern: /\bfra\s*(\d{4})\b/i, value: 0 }, // Will calculate from year
  { pattern: /\b(19[0-4]\d)\b/, value: 0 },
  { pattern: /\b(19[5-6]\d)\b/, value: 0 },
  { pattern: /\b(19[7-8]\d)\b/, value: 0 },
  { pattern: /\b(199\d)\b/, value: 0 },
  { pattern: /\b(20[0-1]\d)\b/, value: 0 },
  { pattern: /\b(202\d)\b/, value: 0 },
  { pattern: /\bgammelt?\s*(hus|bygning|ejendom)\b/i, value: 60 },
  { pattern: /\bældre\s*(hus|bygning|ejendom)\b/i, value: 50 },
  { pattern: /\bny(t|bygger?i?)\b/i, value: 5 },
]

const ROOM_PATTERNS: { type: Room['type']; patterns: RegExp[]; defaultPoints: Partial<ElectricalPoints> }[] = [
  {
    type: 'kitchen',
    patterns: [/\bkøkken\b/i, /\bkøkkenalrum\b/i],
    defaultPoints: { outlets: 8, switches: 2, spots: 6, ceiling_lights: 1 },
  },
  {
    type: 'living',
    patterns: [/\bstue\b/i, /\bopholdsrum\b/i, /\balrum\b/i],
    defaultPoints: { outlets: 6, switches: 2, spots: 4, ceiling_lights: 1, tv_outlets: 1 },
  },
  {
    type: 'bedroom',
    patterns: [/\bsoveværelse\b/i, /\bværelse\b/i, /\bsoverum\b/i],
    defaultPoints: { outlets: 4, switches: 1, ceiling_lights: 1 },
  },
  {
    type: 'bathroom',
    patterns: [/\bbadeværelse\b/i, /\bbad\b/i, /\btoilet\b/i, /\bbryggers\b/i],
    defaultPoints: { outlets: 2, switches: 1, spots: 3 },
  },
  {
    type: 'office',
    patterns: [/\bkontor\b/i, /\barbejdsværelse\b/i, /\bhjemmekontor\b/i],
    defaultPoints: { outlets: 6, switches: 1, ceiling_lights: 1, data_outlets: 2 },
  },
  {
    type: 'utility',
    patterns: [/\bbryggers\b/i, /\bvaskerum\b/i, /\bteknik\b/i],
    defaultPoints: { outlets: 3, switches: 1, ceiling_lights: 1, power_16a: 1 },
  },
  {
    type: 'garage',
    patterns: [/\bgarage\b/i, /\bcarport\b/i],
    defaultPoints: { outlets: 2, switches: 1, ceiling_lights: 2, power_16a: 1 },
  },
  {
    type: 'outdoor',
    patterns: [/\budendørs\b/i, /\bterrasse\b/i, /\bhave\b/i, /\baltan\b/i],
    defaultPoints: { outdoor_lights: 4, outlets: 2 },
  },
]

const ELECTRICAL_PATTERNS: { code: keyof ElectricalPoints; patterns: RegExp[] }[] = [
  { code: 'outlets', patterns: [/(\d+)\s*(stk\.?\s*)?(stikkontakt|stik)\b/i] },
  { code: 'double_outlets', patterns: [/(\d+)\s*(stk\.?\s*)?(dobbelt\s*stik|dobbelt\s*kontakt)\b/i] },
  { code: 'switches', patterns: [/(\d+)\s*(stk\.?\s*)?(afbryder|kontakt)\b/i] },
  { code: 'spots', patterns: [/(\d+)\s*(stk\.?\s*)?(spot|downlight|indbygning)/i] },
  { code: 'ceiling_lights', patterns: [/(\d+)\s*(stk\.?\s*)?(loftlampe|pendel|lampe)\b/i] },
  { code: 'outdoor_lights', patterns: [/(\d+)\s*(stk\.?\s*)?(udendørs|udelampe|facade)\s*lampe/i] },
  { code: 'ev_charger', patterns: [/\b(elbil|lader|ladeboks|ev\s*charger)\b/i] },
  { code: 'power_16a', patterns: [/(\d+)\s*(stk\.?\s*)?16\s*a\b/i] },
  { code: 'power_32a', patterns: [/(\d+)\s*(stk\.?\s*)?32\s*a\b/i] },
  { code: 'data_outlets', patterns: [/(\d+)\s*(stk\.?\s*)?(data|netværk|ethernet)\b/i] },
]

const COMPLEXITY_PATTERNS: { code: string; patterns: RegExp[]; multiplier: number; category: string }[] = [
  { code: 'concrete_walls', patterns: [/\bbeton\b/i, /\bbetonvæg\b/i], multiplier: 1.40, category: 'material' },
  { code: 'brick_walls', patterns: [/\bmursten\b/i, /\bmur\b/i, /\btegl\b/i], multiplier: 1.25, category: 'material' },
  { code: 'drywall', patterns: [/\bgips\b/i, /\bgipsvæg\b/i], multiplier: 0.90, category: 'material' },
  { code: 'old_building', patterns: [/\bgammel\b/i, /\bældre\b/i, /\b19[0-5]\d\b/], multiplier: 1.35, category: 'building' },
  { code: 'new_construction', patterns: [/\bnybygg\b/i, /\bnyt\s*hus\b/i], multiplier: 0.85, category: 'building' },
  { code: 'high_ceiling', patterns: [/\bhøj[te]?\s*loft\b/i, /\b[34]\s*meter\b/i], multiplier: 1.20, category: 'access' },
  { code: 'attic', patterns: [/\btag\s*etage\b/i, /\bloft\b/i, /\bskrå/i], multiplier: 1.15, category: 'access' },
  { code: 'crawl_space', patterns: [/\bkrybekælder\b/i, /\bkravle\b/i], multiplier: 1.30, category: 'access' },
  { code: 'panel_upgrade', patterns: [/\b(ny|udskift|opgradér?)\s*tavle\b/i, /\beltavle\b/i], multiplier: 1.25, category: 'electrical' },
]

const RISK_PATTERNS: { code: string; patterns: RegExp[]; severity: RiskFactor['severity']; type: RiskFactor['type']; title: string; description: string }[] = [
  {
    code: 'old_wiring',
    patterns: [/\bgammel\s*(el|installation)\b/i, /\bældre\s*(el|ledning)\b/i],
    severity: 'high',
    type: 'electrical',
    title: 'Ældre installation',
    description: 'Eksisterende installation kan kræve udskiftning. Forbehold for uforudsete udfordringer.',
  },
  {
    code: 'unknown_scope',
    patterns: [/\bca\.?\b/i, /\bcirka\b/i, /\bomkring\b/i, /\bved\s*ikke\b/i],
    severity: 'medium',
    type: 'scope',
    title: 'Ukendt omfang',
    description: 'Præcist omfang ukendt. Anbefaler besigtigelse før endelig pris.',
  },
  {
    code: 'panel_capacity',
    patterns: [/\bfuldudnyttet\b/i, /\bikke\s*plads\b/i, /\bmange\s*grupper\b/i],
    severity: 'high',
    type: 'electrical',
    title: 'Tavlekapacitet',
    description: 'Eksisterende tavle kan være utilstrækkelig. Mulig tavleudvidelse nødvendig.',
  },
  {
    code: 'grounding',
    patterns: [/\bjording\b/i, /\bHFI\b/i, /\bfejlstrøm/i],
    severity: 'high',
    type: 'safety',
    title: 'Jording/HFI',
    description: 'Jordings- eller fejlstrømsforhold skal verificeres. Kan kræve opgradering.',
  },
  {
    code: 'outdoor_work',
    patterns: [/\budendørs\b/i, /\bhave\b/i, /\bfacade\b/i],
    severity: 'low',
    type: 'timeline',
    title: 'Udendørs arbejde',
    description: 'Udendørs arbejde er vejrafhængigt. Tidsplan kan påvirkes af vejrforhold.',
  },
  {
    code: 'renovation',
    patterns: [/\brenovering\b/i, /\bombygning\b/i, /\bistandsæt/i],
    severity: 'medium',
    type: 'scope',
    title: 'Renoveringsarbejde',
    description: 'Renoveringsarbejde kan afsløre skjulte forhold. Forbehold for uforudsete udgifter.',
  },
]

// =====================================================
// Interpreter Functions
// =====================================================

function detectBuildingType(text: string): BuildingType {
  for (const { type, patterns } of BUILDING_TYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return type
      }
    }
  }
  return 'unknown'
}

function detectBuildingSize(text: string): number | null {
  for (const pattern of SIZE_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      return parseInt(match[1], 10)
    }
  }
  return null
}

function detectBuildingAge(text: string): number | null {
  // First try to find year
  const yearPattern = /\b(19\d{2}|20[0-2]\d)\b/
  const yearMatch = text.match(yearPattern)
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10)
    const currentYear = new Date().getFullYear()
    return currentYear - year
  }

  // Then try keyword patterns
  for (const { pattern, value } of AGE_PATTERNS) {
    if (pattern.test(text)) {
      return typeof value === 'number' ? value : null
    }
  }

  return null
}

function detectRooms(text: string): Room[] {
  const rooms: Room[] = []
  const textLower = text.toLowerCase()

  for (const { type, patterns } of ROOM_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        // Check for quantity
        const quantityPattern = new RegExp(`(\\d+)\\s*${pattern.source}`, 'i')
        const match = text.match(quantityPattern)
        const count = match ? parseInt(match[1], 10) : 1

        for (let i = 0; i < count; i++) {
          rooms.push({
            name: type === 'bedroom' && count > 1 ? `${type}_${i + 1}` : type,
            type,
          })
        }
        break
      }
    }
  }

  // If no rooms detected, create a generic one based on building type
  if (rooms.length === 0) {
    rooms.push({ name: 'main', type: 'other' })
  }

  return rooms
}

function detectElectricalPoints(text: string, rooms: Room[]): ElectricalPoints {
  const points: ElectricalPoints = {}

  // First try to extract explicit numbers from text
  for (const { code, patterns } of ELECTRICAL_PATTERNS) {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const value = parseInt(match[1], 10)
        if (!isNaN(value)) {
          points[code] = (points[code] || 0) + value
        } else if (code === 'ev_charger') {
          // EV charger mentioned but no number
          points[code] = 1
        }
      }
    }
  }

  // Check for EV charger mention without number
  if (/\b(elbil|lader|ladeboks|ev)\b/i.test(text) && !points.ev_charger) {
    points.ev_charger = 1
  }

  // If minimal points detected, estimate from rooms
  const totalExplicit = Object.values(points).reduce((sum, v) => sum + (v || 0), 0)
  if (totalExplicit < 10) {
    for (const room of rooms) {
      const roomDef = ROOM_PATTERNS.find(r => r.type === room.type)
      if (roomDef?.defaultPoints) {
        for (const [key, value] of Object.entries(roomDef.defaultPoints)) {
          const k = key as keyof ElectricalPoints
          points[k] = (points[k] || 0) + (value || 0)
        }
      }
    }
  }

  return points
}

function estimateCableRequirements(points: ElectricalPoints, size_m2: number | null): CableRequirements {
  const size = size_m2 || 100
  const sizeFactor = size / 100

  // Rough estimates based on point counts and building size
  const totalLightPoints = (points.spots || 0) + (points.ceiling_lights || 0) + (points.outdoor_lights || 0)
  const totalPowerPoints = (points.outlets || 0) + (points.double_outlets || 0)
  const heavyPowerPoints = (points.power_16a || 0) + (points.power_32a || 0) + (points.ev_charger || 0)

  return {
    nym_1_5mm: Math.round(totalLightPoints * 8 * sizeFactor), // 8m avg per light point
    nym_2_5mm: Math.round(totalPowerPoints * 6 * sizeFactor), // 6m avg per outlet
    nym_4mm: Math.round(heavyPowerPoints * 10), // 10m avg per heavy power
    nym_6mm: points.ev_charger ? 15 : 0,
    nym_10mm: points.power_32a ? Math.round(points.power_32a * 12) : 0,
    outdoor_cable: Math.round((points.outdoor_lights || 0) * 12),
    data_cable: Math.round((points.data_outlets || 0) * 10),
  }
}

function estimatePanelRequirements(points: ElectricalPoints, buildingAge: number | null): PanelRequirements {
  // Calculate required groups
  const lightGroups = Math.ceil(((points.spots || 0) + (points.ceiling_lights || 0)) / 8)
  const outletGroups = Math.ceil(((points.outlets || 0) + (points.double_outlets || 0)) / 6)
  const heavyGroups = (points.power_16a || 0) + (points.power_32a || 0) + (points.ev_charger || 0)
  const dataGroups = points.data_outlets ? 1 : 0

  const requiredGroups = lightGroups + outletGroups + heavyGroups + dataGroups + 2 // +2 for spare

  // Calculate required amperage
  let requiredAmperage = 25 // Base
  if (points.ev_charger) requiredAmperage = Math.max(requiredAmperage, 32)
  if (points.power_32a) requiredAmperage = Math.max(requiredAmperage, 50)
  if (requiredGroups > 12) requiredAmperage = Math.max(requiredAmperage, 40)

  const isOldBuilding = (buildingAge || 0) > 40
  const upgrade_needed = requiredGroups > 10 || isOldBuilding
  const new_panel_needed = requiredGroups > 16 || requiredAmperage > 40

  return {
    upgrade_needed,
    required_groups: requiredGroups,
    required_amperage: requiredAmperage,
    new_panel_needed,
  }
}

function detectComplexityFactors(text: string): ComplexityFactor[] {
  const factors: ComplexityFactor[] = []

  for (const { code, patterns, multiplier, category } of COMPLEXITY_PATTERNS) {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        factors.push({
          code,
          name: code.replace(/_/g, ' '),
          category,
          multiplier,
          detected_from: match[0],
        })
        break
      }
    }
  }

  return factors
}

function calculateComplexityScore(factors: ComplexityFactor[]): number {
  if (factors.length === 0) return 3 // Default medium

  const avgMultiplier = factors.reduce((sum, f) => sum + f.multiplier, 0) / factors.length

  if (avgMultiplier <= 0.90) return 1
  if (avgMultiplier <= 1.00) return 2
  if (avgMultiplier <= 1.15) return 3
  if (avgMultiplier <= 1.30) return 4
  return 5
}

function detectRiskFactors(text: string, interpretation: Partial<ProjectInterpretation>): RiskFactor[] {
  const risks: RiskFactor[] = []

  // Pattern-based risk detection
  for (const risk of RISK_PATTERNS) {
    for (const pattern of risk.patterns) {
      if (pattern.test(text)) {
        risks.push({
          type: risk.type,
          code: risk.code,
          title: risk.title,
          description: risk.description,
          severity: risk.severity,
        })
        break
      }
    }
  }

  // Logic-based risk detection
  if ((interpretation.building_age_years || 0) > 50) {
    if (!risks.find(r => r.code === 'old_wiring')) {
      risks.push({
        type: 'electrical',
        code: 'old_wiring_inferred',
        title: 'Ældre bygning',
        description: 'Bygningen er over 50 år gammel. Eksisterende installation bør gennemgås.',
        severity: 'medium',
      })
    }
  }

  if (interpretation.panel_requirements?.new_panel_needed) {
    risks.push({
      type: 'electrical',
      code: 'panel_upgrade_required',
      title: 'Ny tavle nødvendig',
      description: 'Omfanget kræver ny eller udvidet eltavle.',
      severity: 'medium',
    })
  }

  // Check for vague description
  const wordCount = text.split(/\s+/).length
  if (wordCount < 10) {
    risks.push({
      type: 'scope',
      code: 'minimal_description',
      title: 'Begrænset beskrivelse',
      description: 'Projektbeskrivelsen er kort. Anbefaler uddybning eller besigtigelse.',
      severity: 'medium',
    })
  }

  return risks
}

function calculateRiskScore(risks: RiskFactor[]): number {
  if (risks.length === 0) return 1

  const severityScores: Record<RiskFactor['severity'], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }

  const totalScore = risks.reduce((sum, r) => sum + severityScores[r.severity], 0)
  const avgScore = totalScore / risks.length

  if (avgScore <= 1.5) return 1
  if (avgScore <= 2.0) return 2
  if (avgScore <= 2.5) return 3
  if (avgScore <= 3.0) return 4
  return 5
}

function calculateConfidence(interpretation: Partial<ProjectInterpretation>): number {
  let score = 0.5 // Base confidence

  if (interpretation.building_type !== 'unknown') score += 0.1
  if (interpretation.building_size_m2) score += 0.1
  if ((interpretation.rooms?.length || 0) > 1) score += 0.1
  if (Object.keys(interpretation.electrical_points || {}).length > 3) score += 0.1
  if ((interpretation.complexity_factors?.length || 0) > 0) score += 0.05
  if ((interpretation.risk_factors?.length || 0) > 0) score += 0.05

  return Math.min(score, 0.95)
}

// =====================================================
// Main Export
// =====================================================

export async function interpretProject(description: string): Promise<InterpretationResult> {
  const startTime = Date.now()
  const warnings: string[] = []

  // Clean and normalize text
  const text = description.trim()

  if (text.length < 10) {
    warnings.push('Projektbeskrivelsen er meget kort. Resultatet kan være upræcist.')
  }

  // Extract all data
  const building_type = detectBuildingType(text)
  const building_size_m2 = detectBuildingSize(text)
  const building_age_years = detectBuildingAge(text)
  const rooms = detectRooms(text)
  const electrical_points = detectElectricalPoints(text, rooms)
  const cable_requirements = estimateCableRequirements(electrical_points, building_size_m2)
  const panel_requirements = estimatePanelRequirements(electrical_points, building_age_years)
  const complexity_factors = detectComplexityFactors(text)
  const complexity_score = calculateComplexityScore(complexity_factors)

  // Build partial interpretation for risk analysis
  const partialInterpretation = {
    building_type,
    building_size_m2,
    building_age_years,
    panel_requirements,
  }

  const risk_factors = detectRiskFactors(text, partialInterpretation)
  const risk_score = calculateRiskScore(risk_factors)

  // Build full interpretation
  const interpretation: Omit<ProjectInterpretation, 'id' | 'created_by' | 'created_at'> = {
    raw_description: description,
    building_type,
    building_size_m2,
    building_age_years,
    rooms,
    electrical_points,
    cable_requirements,
    panel_requirements,
    complexity_score,
    complexity_factors,
    risk_score,
    risk_factors,
    ai_model: 'local-pattern-v1',
    ai_confidence: 0,
    interpretation_time_ms: Date.now() - startTime,
  }

  const confidence = calculateConfidence(interpretation)
  interpretation.ai_confidence = confidence

  // Add warnings
  if (building_type === 'unknown') {
    warnings.push('Bygningstype kunne ikke detekteres. Antager standard bolig.')
  }

  if (!building_size_m2) {
    warnings.push('Bygningsstørrelse ikke fundet. Bruger standardestimater.')
  }

  return {
    interpretation,
    confidence,
    warnings,
  }
}

// Export types for use elsewhere
export type { InterpretationResult }
