/**
 * Risk & Warning Engine
 *
 * Detects potential issues in project interpretations:
 * - Old house risks
 * - Missing grounding
 * - Panel upgrade needs
 * - Underpriced margin
 * - Unknown scope
 * - Safety concerns
 *
 * Generates:
 * - OBS list for offers (customer-facing)
 * - Internal risk notes (staff only)
 */

import type {
  ProjectInterpretation,
  PriceCalculation,
  RiskFactor,
} from '@/types/auto-project.types'

// =====================================================
// Types
// =====================================================

export interface RiskAnalysis {
  risks: RiskFactor[]
  overall_score: number // 1-5
  summary: string
  offer_reservations: string[] // For customer offer
  internal_notes: string[] // Internal only
  recommendations: string[]
  requires_inspection: boolean
}

// =====================================================
// Risk Detection Rules
// =====================================================

interface RiskRule {
  code: string
  check: (interpretation: ProjectInterpretation, price?: PriceCalculation) => boolean
  risk: Omit<RiskFactor, 'code'>
  offer_text?: string
  internal_note?: string
  recommendation?: string
}

const RISK_RULES: RiskRule[] = [
  // Building age risks
  {
    code: 'old_building_pre_1970',
    check: (i) => (i.building_age_years || 0) > 55,
    risk: {
      type: 'electrical',
      title: 'Ældre bygning (før 1970)',
      description: 'Bygningen er fra før 1970. El-installation kan være forældet og kræve udskiftning.',
      severity: 'high',
    },
    offer_text: 'OBS: Ældre installation. Forbehold for nødvendige opgraderinger af eksisterende el.',
    internal_note: 'RISIKO: Bygning før 1970 - check for aluminium-ledninger, manglende jord, og forældet tavle.',
    recommendation: 'Anbefal grundig besigtigelse før endelig pris.',
  },
  {
    code: 'old_building_1970_1990',
    check: (i) => {
      const age = i.building_age_years || 0
      return age >= 35 && age <= 55
    },
    risk: {
      type: 'electrical',
      title: 'Ældre bygning (1970-1990)',
      description: 'Bygningen er 35-55 år gammel. Eksisterende installation bør gennemgås.',
      severity: 'medium',
    },
    offer_text: 'Bemærk: Eksisterende installation gennemgås ved opstart. Eventuelle afvigelser aftales.',
    internal_note: 'Check: Installation fra 1970-90 periode. Ofte utilstrækkelig kapacitet.',
  },

  // Panel risks
  {
    code: 'panel_upgrade_needed',
    check: (i) => i.panel_requirements?.upgrade_needed === true,
    risk: {
      type: 'electrical',
      title: 'Tavleudvidelse nødvendig',
      description: 'Projektets omfang kræver udvidelse af eksisterende eltavle.',
      severity: 'medium',
    },
    offer_text: 'Inkl. nødvendig tavleudvidelse for at rumme nye grupper.',
    internal_note: 'Husk at inkludere tavlearbejde i pris. Check kapacitet ved besigtigelse.',
  },
  {
    code: 'new_panel_needed',
    check: (i) => i.panel_requirements?.new_panel_needed === true,
    risk: {
      type: 'electrical',
      title: 'Ny eltavle nødvendig',
      description: 'Eksisterende tavle er utilstrækkelig. Ny tavle skal installeres.',
      severity: 'high',
    },
    offer_text: 'OBS: Ny eltavle er inkluderet i tilbuddet. Eksisterende tavle udskiftes.',
    internal_note: 'VIGTIGT: Ny tavle påkrævet. Check ampere-behov og net-tilslutning.',
    recommendation: 'Verificer med netselskab om hovedsikring er tilstrækkelig.',
  },

  // Scope risks
  {
    code: 'large_scope',
    check: (i) => {
      const points = i.electrical_points
      const total =
        (points.outlets || 0) +
        (points.double_outlets || 0) +
        (points.switches || 0) +
        (points.spots || 0) +
        (points.ceiling_lights || 0) +
        (points.outdoor_lights || 0)
      return total > 50
    },
    risk: {
      type: 'scope',
      title: 'Stort projekt',
      description: 'Projektet har mere end 50 elpunkter. Større projekter har højere kompleksitet.',
      severity: 'medium',
    },
    internal_note: 'Stort projekt (50+ punkter). Overvej faseopdeling og ekstra buffer.',
    recommendation: 'Opdel evt. i etaper for bedre risikostyring.',
  },
  {
    code: 'minimal_description',
    check: (i) => i.raw_description.split(/\s+/).length < 15,
    risk: {
      type: 'scope',
      title: 'Begrænset projektbeskrivelse',
      description: 'Projektbeskrivelsen er kort. Det faktiske omfang kan afvige.',
      severity: 'medium',
    },
    offer_text: 'Tilbud baseret på oplyst omfang. Ændringer faktureres efter regning.',
    internal_note: 'Meget kort beskrivelse. Indhent flere detaljer før endelig pris.',
    recommendation: 'Kontakt kunde for uddybning eller aftal besigtigelse.',
  },
  {
    code: 'vague_quantities',
    check: (i) => /\bca\.?\b|\bcirka\b|\bomkring\b/i.test(i.raw_description),
    risk: {
      type: 'scope',
      title: 'Upræcise mængder',
      description: 'Beskrivelsen indeholder "ca." eller "omkring". Præcist omfang ukendt.',
      severity: 'low',
    },
    offer_text: 'Endelige mængder afklares ved opstart. Afvigelser faktureres efter aftale.',
    internal_note: 'Upræcise mængder i beskrivelse. Afstem ved besigtigelse.',
  },

  // Complexity risks
  {
    code: 'high_complexity',
    check: (i) => i.complexity_score >= 4,
    risk: {
      type: 'scope',
      title: 'Høj kompleksitet',
      description: 'Projektet har høj kompleksitet grundet bygningstype eller adgangsforhold.',
      severity: 'medium',
    },
    internal_note: 'Kompleksitetsscore 4+. Ekstra tid allokeret i beregning.',
  },
  {
    code: 'concrete_walls',
    check: (i) => i.complexity_factors.some((f) => f.code === 'concrete_walls'),
    risk: {
      type: 'structural',
      title: 'Betonkonstruktion',
      description: 'Arbejde i beton er mere tidskrævende og kræver specielt udstyr.',
      severity: 'low',
    },
    offer_text: 'Bemærk: Arbejde i betonkonstruktion. Ekstra tid for boring/fræsning indregnet.',
    internal_note: 'Beton påvist. Medbring korrekt boreudstyr og forvent længere tid.',
  },

  // Safety risks
  {
    code: 'grounding_mentioned',
    check: (i) => /\bjording\b|\bjord\b|\bHFI\b/i.test(i.raw_description),
    risk: {
      type: 'safety',
      title: 'Jordingsproblematik',
      description: 'Jording er nævnt i beskrivelsen. Eksisterende jordforhold skal verificeres.',
      severity: 'high',
    },
    offer_text: 'OBS: Jordforhold verificeres ved opstart. Forbehold for nødvendig opgradering.',
    internal_note: 'SIKKERHED: Jording nævnt. Udfør måling af jordmodstand ved opstart.',
    recommendation: 'Udfør el-eftersyn før prisgaranti.',
  },
  {
    code: 'outdoor_work',
    check: (i) => (i.electrical_points.outdoor_lights || 0) > 3,
    risk: {
      type: 'timeline',
      title: 'Væsentligt udendørs arbejde',
      description: 'Projektet inkluderer betydeligt udendørs arbejde. Vejrafhængigt.',
      severity: 'low',
    },
    offer_text: 'Udendørs arbejde er vejrafhængigt. Tidsplan kan påvirkes af vejrforhold.',
    internal_note: 'Planlæg udendørs arbejde efter vejrudsigt.',
  },

  // Power/EV risks
  {
    code: 'ev_charger',
    check: (i) => (i.electrical_points.ev_charger || 0) > 0,
    risk: {
      type: 'electrical',
      title: 'Elbillader installation',
      description: 'Elbillader kræver ofte tavleudvidelse og eventuelt ny hovedsikring.',
      severity: 'medium',
    },
    offer_text: 'Elbillader-installation. Forbehold for evt. opgradering af hovedsikring.',
    internal_note: 'EV-lader: Check hovedsikring og kabelføring til ladepunkt.',
    recommendation: 'Kontakt netselskab vedr. kapacitet hvis 11kW+ lader.',
  },
  {
    code: 'heavy_power',
    check: (i) => ((i.electrical_points.power_32a || 0) > 1),
    risk: {
      type: 'electrical',
      title: 'Kraftinstallation',
      description: 'Flere 32A installationer. Kræver særlig opmærksomhed på kapacitet.',
      severity: 'medium',
    },
    internal_note: 'Flere 32A punkter. Verificer tavlekapacitet.',
  },
]

// =====================================================
// Price-based Risk Rules
// =====================================================

const PRICE_RISK_RULES: RiskRule[] = [
  {
    code: 'low_margin',
    check: (i, p) => (p?.margin_percentage || 25) < 20,
    risk: {
      type: 'pricing',
      title: 'Lav margin',
      description: 'Marginprocenten er under 20%. Risiko for utilstrækkelig dækning.',
      severity: 'high',
    },
    internal_note: 'ADVARSEL: Margin under 20%. Overvej at øge eller afklare med ledelse.',
    recommendation: 'Øg margin til minimum 20% eller få godkendelse.',
  },
  {
    code: 'small_project',
    check: (i, p) => (p?.total_price || 0) < 5000,
    risk: {
      type: 'pricing',
      title: 'Lille projekt',
      description: 'Projektet er under 5.000 kr. Overvej om det er rentabelt.',
      severity: 'low',
    },
    internal_note: 'Lille projekt. Overvej minimumspris/kørselsgebyr.',
  },
]

// =====================================================
// Analysis Functions
// =====================================================

export function analyzeRisks(
  interpretation: ProjectInterpretation,
  price?: PriceCalculation
): RiskAnalysis {
  const risks: RiskFactor[] = []
  const offer_reservations: string[] = []
  const internal_notes: string[] = []
  const recommendations: string[] = []

  // Check all risk rules
  for (const rule of RISK_RULES) {
    if (rule.check(interpretation)) {
      risks.push({
        ...rule.risk,
        code: rule.code,
      })

      if (rule.offer_text) {
        offer_reservations.push(rule.offer_text)
      }

      if (rule.internal_note) {
        internal_notes.push(rule.internal_note)
      }

      if (rule.recommendation) {
        recommendations.push(rule.recommendation)
      }
    }
  }

  // Check price-based rules if price is provided
  if (price) {
    for (const rule of PRICE_RISK_RULES) {
      if (rule.check(interpretation, price)) {
        risks.push({
          ...rule.risk,
          code: rule.code,
        })

        if (rule.internal_note) {
          internal_notes.push(rule.internal_note)
        }

        if (rule.recommendation) {
          recommendations.push(rule.recommendation)
        }
      }
    }
  }

  // Add any existing interpretation risks
  for (const risk of interpretation.risk_factors) {
    if (!risks.find((r) => r.code === risk.code)) {
      risks.push(risk)
    }
  }

  // Calculate overall score
  const overall_score = calculateOverallRiskScore(risks)

  // Determine if inspection is required
  const requires_inspection =
    risks.some((r) => r.severity === 'critical' || r.severity === 'high') ||
    overall_score >= 4 ||
    interpretation.ai_confidence < 0.6

  // Generate summary
  const summary = generateRiskSummary(risks, overall_score)

  return {
    risks,
    overall_score,
    summary,
    offer_reservations,
    internal_notes,
    recommendations,
    requires_inspection,
  }
}

function calculateOverallRiskScore(risks: RiskFactor[]): number {
  if (risks.length === 0) return 1

  const severityScores: Record<RiskFactor['severity'], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 5,
  }

  // Weighted average with higher weight for severe risks
  let totalWeight = 0
  let weightedSum = 0

  for (const risk of risks) {
    const score = severityScores[risk.severity]
    const weight = score // Higher severity = higher weight
    totalWeight += weight
    weightedSum += score * weight
  }

  const avgScore = weightedSum / totalWeight

  // Map to 1-5 scale
  if (avgScore <= 1.2) return 1
  if (avgScore <= 1.8) return 2
  if (avgScore <= 2.5) return 3
  if (avgScore <= 3.5) return 4
  return 5
}

function generateRiskSummary(risks: RiskFactor[], score: number): string {
  if (risks.length === 0) {
    return 'Ingen væsentlige risici identificeret. Standard projekt.'
  }

  const critical = risks.filter((r) => r.severity === 'critical').length
  const high = risks.filter((r) => r.severity === 'high').length
  const medium = risks.filter((r) => r.severity === 'medium').length

  const parts: string[] = []

  if (critical > 0) {
    parts.push(`${critical} kritiske`)
  }
  if (high > 0) {
    parts.push(`${high} høje`)
  }
  if (medium > 0) {
    parts.push(`${medium} moderate`)
  }

  const riskText = parts.length > 0 ? parts.join(', ') + ' risici' : 'lave risici'

  const scoreDescriptions: Record<number, string> = {
    1: 'Lavt risikoniveau',
    2: 'Normalt risikoniveau',
    3: 'Moderat risikoniveau',
    4: 'Forhøjet risikoniveau',
    5: 'Højt risikoniveau',
  }

  return `${scoreDescriptions[score]} (${risks.length} fund: ${riskText}).`
}

// =====================================================
// Offer Text Generation
// =====================================================

export function generateOfferReservations(analysis: RiskAnalysis): string {
  if (analysis.offer_reservations.length === 0) {
    return 'Tilbuddet er baseret på de oplyste forhold. Uforudsete forhold faktureres efter regning.'
  }

  const lines = [
    'Forbehold:',
    '',
    ...analysis.offer_reservations.map((r) => `• ${r}`),
    '',
    'Generelt forbehold for uforudsete forhold.',
  ]

  return lines.join('\n')
}

export function generateInternalNotes(analysis: RiskAnalysis): string {
  if (analysis.internal_notes.length === 0) {
    return 'Ingen særlige bemærkninger.'
  }

  return analysis.internal_notes.join('\n\n')
}
