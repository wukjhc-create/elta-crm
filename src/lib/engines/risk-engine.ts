/**
 * RISK & OBS ENGINE
 *
 * Analyzes project context and calculation data to identify:
 * - Technical risks (installation complexity, safety concerns)
 * - Time uncertainty (variable factors, unknown conditions)
 * - Legal/installation caveats (compliance requirements)
 * - Margin recommendations (pricing guidance)
 *
 * Architecture Notes:
 * - Rule-based detection (no AI calls yet)
 * - Designed to be augmented with AI analysis in the future
 * - Generates both internal risks and customer-visible OBS points
 */

import type {
  RiskAnalysisInput,
  RiskAnalysisResult,
  RiskAssessmentCreate,
  RiskCategory,
  RiskSeverity,
  BuildingType,
} from '@/types/ai-intelligence.types'

// =====================================================
// RISK DETECTION RULES
// =====================================================

interface RiskRule {
  code: string
  name: string
  category: RiskCategory
  defaultSeverity: RiskSeverity
  check: (input: RiskAnalysisInput) => boolean
  titleTemplate: string
  descriptionTemplate: string
  recommendationTemplate: string | null
  showToCustomer: boolean
  customerMessage: string | null
}

/**
 * Risk detection rules
 * Each rule checks specific conditions and generates appropriate risks
 */
const RISK_RULES: RiskRule[] = [
  // =====================================================
  // TECHNICAL RISKS
  // =====================================================
  {
    code: 'RISK_OLD_WIRING',
    name: 'Gammelt el-installation',
    category: 'technical',
    defaultSeverity: 'medium',
    check: (input) => (input.building_age_years ?? 0) > 40,
    titleTemplate: 'Potentielt forældet el-installation',
    descriptionTemplate: 'Bygningen er over 40 år gammel. El-installationen kan være forældet og kræve ekstra vurdering.',
    recommendationTemplate: 'Anbefales: Gennemgå eltavle og eksisterende installation før arbejdet påbegyndes. Overvej at tilbyde eltjek som tillægsydelse.',
    showToCustomer: true,
    customerMessage: 'Ældre installation kan kræve ekstra gennemgang for at sikre kompatibilitet.',
  },
  {
    code: 'RISK_VERY_OLD',
    name: 'Meget gammel bygning',
    category: 'technical',
    defaultSeverity: 'high',
    check: (input) => (input.building_age_years ?? 0) > 60,
    titleTemplate: 'Meget gammel el-installation',
    descriptionTemplate: 'Bygningen er over 60 år gammel. Høj sandsynlighed for forældet installation, potentielt stofledninger eller aluminium.',
    recommendationTemplate: 'KRAV: Grundig inspektion af eksisterende installation. Muligt behov for delvis eller hel omkakling. Overvej ekstra buffer i tilbuddet.',
    showToCustomer: true,
    customerMessage: 'Ældre installation kræver grundig vurdering. Der kan opstå behov for yderligere arbejde.',
  },
  {
    code: 'RISK_BATHROOM_IP',
    name: 'Vådrums-installation',
    category: 'safety',
    defaultSeverity: 'medium',
    check: (input) => input.has_bathroom_work === true,
    titleTemplate: 'Vådrums IP-krav',
    descriptionTemplate: 'Arbejde i badeværelse kræver IP44/IP65 materiel og særlige installationsregler.',
    recommendationTemplate: 'Sikr at alle komponenter opfylder vådrumsklassificering. Verifier installationszoner.',
    showToCustomer: true,
    customerMessage: 'Vådrumsinstallation udføres efter gældende sikkerhedsregler med godkendte komponenter.',
  },
  {
    code: 'RISK_OUTDOOR',
    name: 'Udendørs installation',
    category: 'technical',
    defaultSeverity: 'low',
    check: (input) => input.has_outdoor_work === true,
    titleTemplate: 'Udendørs installation',
    descriptionTemplate: 'Udendørs arbejde kræver vejrbestandigt materiel og kan påvirkes af vejrforhold.',
    recommendationTemplate: 'Planlæg med hensyn til vejret. Sikr IP65+ klassificerede komponenter.',
    showToCustomer: true,
    customerMessage: 'Udendørs installation med vejrbestandigt materiel.',
  },
  {
    code: 'RISK_COMMERCIAL',
    name: 'Erhvervsinstallation',
    category: 'legal',
    defaultSeverity: 'medium',
    check: (input) => input.building_type === 'commercial' || input.building_type === 'industrial',
    titleTemplate: 'Erhvervs/industri krav',
    descriptionTemplate: 'Erhvervs- og industriinstallationer har særlige krav til dokumentation og sikkerhed.',
    recommendationTemplate: 'Verificer krav til nødbelysning, brandalarmer, og el-attest. Overvej højere sikkerhedsmargin.',
    showToCustomer: true,
    customerMessage: 'Erhvervsinstallation udføres efter gældende lovkrav med fuld dokumentation.',
  },

  // =====================================================
  // TIME RISKS
  // =====================================================
  {
    code: 'RISK_LARGE_PROJECT',
    name: 'Stort projekt',
    category: 'time',
    defaultSeverity: 'low',
    check: (input) => (input.component_count ?? 0) > 20,
    titleTemplate: 'Stort projekt - mange komponenter',
    descriptionTemplate: 'Projektet indeholder mange komponenter, hvilket øger kompleksiteten.',
    recommendationTemplate: 'Overvej at opdele i faser. Indregn ekstra koordineringstid.',
    showToCustomer: false,
    customerMessage: null,
  },
  {
    code: 'RISK_COMPLEX_PROJECT',
    name: 'Komplekst projekt',
    category: 'time',
    defaultSeverity: 'medium',
    check: (input) => (input.component_count ?? 0) > 40,
    titleTemplate: 'Komplekst projekt - høj komponent-tæthed',
    descriptionTemplate: 'Over 40 komponenter indikerer et komplekst projekt med højere risiko for forsinkelser.',
    recommendationTemplate: 'Anbefales: Buffer på 15-20% ekstra tid. Overvej faseopdeling med delleverancer.',
    showToCustomer: true,
    customerMessage: 'Projektet opdeles eventuelt i faser for optimal kvalitet.',
  },
  {
    code: 'RISK_MULTI_ROOM',
    name: 'Fler-rums projekt',
    category: 'time',
    defaultSeverity: 'info',
    check: (input) => (input.rooms?.length ?? 0) > 3,
    titleTemplate: 'Arbejde i flere rum',
    descriptionTemplate: 'Projektet spænder over flere rum, hvilket kan kræve ekstra koordinering.',
    recommendationTemplate: 'Plan rum-for-rum arbejdsflow. Koordiner med evt. andre håndværkere.',
    showToCustomer: false,
    customerMessage: null,
  },

  // =====================================================
  // MARGIN RISKS
  // =====================================================
  {
    code: 'RISK_LOW_MARGIN',
    name: 'Lav margin',
    category: 'margin',
    defaultSeverity: 'high',
    check: (input) => (input.margin_percentage ?? 100) < 20,
    titleTemplate: 'Lav fortjenestemargin',
    descriptionTemplate: 'Marginen er under 20%, hvilket efterlader lille buffer til uforudsete udgifter.',
    recommendationTemplate: 'ADVARSEL: Overvej at hæve prisen eller reducere scope. Under 20% margin er risikabelt.',
    showToCustomer: false,
    customerMessage: null,
  },
  {
    code: 'RISK_VERY_LOW_MARGIN',
    name: 'Meget lav margin',
    category: 'margin',
    defaultSeverity: 'critical',
    check: (input) => (input.margin_percentage ?? 100) < 10,
    titleTemplate: 'Kritisk lav margin',
    descriptionTemplate: 'Marginen er under 10%. Ved uforudsete problemer risikerer projektet at give underskud.',
    recommendationTemplate: 'KRITISK: Tilbuddet bør genovervejes. Under 10% margin er ikke bæredygtigt.',
    showToCustomer: false,
    customerMessage: null,
  },
  {
    code: 'RISK_HIGH_PRICE',
    name: 'Høj pris',
    category: 'margin',
    defaultSeverity: 'info',
    check: (input) => (input.total_price ?? 0) > 100000,
    titleTemplate: 'Større projekt - høj værdi',
    descriptionTemplate: 'Projektet har en samlet værdi over 100.000 kr. Overvej kundens betalingsevne og evt. ratebetaling.',
    recommendationTemplate: 'Overvej: Tilbyd ratebetaling eller delbetaling. Sikr skriftlig kontrakt.',
    showToCustomer: false,
    customerMessage: null,
  },

  // =====================================================
  // ACCESS RISKS
  // =====================================================
  {
    code: 'RISK_APARTMENT',
    name: 'Lejlighed/etagebolig',
    category: 'access',
    defaultSeverity: 'low',
    check: (input) => input.building_type === 'apartment',
    titleTemplate: 'Lejlighedsinstallation',
    descriptionTemplate: 'Arbejde i lejlighed kan have begrænsninger ift. adgang til fælles el-tavle.',
    recommendationTemplate: 'Afklar adgang til fælles eltavle på forhånd. Koordiner evt. med vicevært.',
    showToCustomer: true,
    customerMessage: 'Adgang til eventuel fælles eltavle skal koordineres.',
  },

  // =====================================================
  // SCOPE RISKS
  // =====================================================
  {
    code: 'RISK_UNCLEAR_SCOPE',
    name: 'Uklart scope',
    category: 'scope',
    defaultSeverity: 'medium',
    check: (input) => (input.component_count ?? 0) === 0 && (input.rooms?.length ?? 0) === 0,
    titleTemplate: 'Uklart projekt-scope',
    descriptionTemplate: 'Ingen komponenter eller rum er specificeret. Scopet kan være uklart.',
    recommendationTemplate: 'VIGTIGT: Afklar præcist scope med kunde før tilbud afgives. Overvej besigtigelse.',
    showToCustomer: false,
    customerMessage: null,
  },
]

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get severity weight for sorting risks
 */
function getSeverityWeight(severity: RiskSeverity): number {
  const weights: Record<RiskSeverity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  }
  return weights[severity]
}

/**
 * Calculate overall risk level from individual risks
 */
function calculateOverallRiskLevel(risks: RiskAssessmentCreate[]): 'low' | 'medium' | 'high' {
  if (risks.length === 0) return 'low'

  const hasCritical = risks.some(r => r.severity === 'critical')
  const highCount = risks.filter(r => r.severity === 'high').length
  const mediumCount = risks.filter(r => r.severity === 'medium').length

  if (hasCritical || highCount >= 2) return 'high'
  if (highCount >= 1 || mediumCount >= 3) return 'medium'
  return 'low'
}

/**
 * Generate recommendations based on detected risks
 */
function generateRecommendations(risks: RiskAssessmentCreate[]): string[] {
  const recommendations: string[] = []

  // Prioritized recommendations based on risk patterns
  const hasOldBuilding = risks.some(r => r.detection_rule === 'RISK_OLD_WIRING' || r.detection_rule === 'RISK_VERY_OLD')
  const hasLowMargin = risks.some(r => r.detection_rule === 'RISK_LOW_MARGIN' || r.detection_rule === 'RISK_VERY_LOW_MARGIN')
  const hasComplexProject = risks.some(r => r.detection_rule === 'RISK_COMPLEX_PROJECT')
  const hasUnclearScope = risks.some(r => r.detection_rule === 'RISK_UNCLEAR_SCOPE')

  if (hasOldBuilding) {
    recommendations.push('🔍 Anbefales: Tilbyd eltjek/besigtigelse før tilbud afgivet')
  }

  if (hasLowMargin) {
    recommendations.push('💰 Advarsel: Marginen er for lav. Gennemgå prissætning.')
  }

  if (hasComplexProject) {
    recommendations.push('📋 Overvej: Opdel projektet i faser for bedre styring')
  }

  if (hasUnclearScope) {
    recommendations.push('📞 Vigtigt: Afklar scope grundigt med kunden før tilbudsgivning')
  }

  // General recommendations based on risk level
  const overallLevel = calculateOverallRiskLevel(risks)
  if (overallLevel === 'high') {
    recommendations.push('⚠️ Høj risiko: Overvej ekstra buffer (15-20%) i prissætningen')
  }

  return recommendations
}

// =====================================================
// MAIN ENGINE FUNCTIONS
// =====================================================

/**
 * Analyze project for risks based on input parameters
 *
 * @param input - Project analysis input (calculation context)
 * @returns Risk analysis result with identified risks and recommendations
 */
export function analyzeProjectRisks(input: RiskAnalysisInput): RiskAnalysisResult {
  const risks: RiskAssessmentCreate[] = []

  // Run all risk rules
  for (const rule of RISK_RULES) {
    if (rule.check(input)) {
      const risk: RiskAssessmentCreate = {
        calculation_id: input.calculation_id,
        category: rule.category,
        severity: rule.defaultSeverity,
        title: rule.titleTemplate,
        description: rule.descriptionTemplate,
        detection_rule: rule.code,
        detection_data: { input },
        confidence: 0.9, // Rule-based detection has high confidence
        recommendation: rule.recommendationTemplate || undefined,
        show_to_customer: rule.showToCustomer,
        customer_message: rule.customerMessage || undefined,
      }
      risks.push(risk)
    }
  }

  // Sort by severity
  risks.sort((a, b) => getSeverityWeight(b.severity) - getSeverityWeight(a.severity))

  // Calculate overall level
  const overallLevel = calculateOverallRiskLevel(risks)

  // Filter customer-visible risks
  const customerVisibleRisks = risks.filter(r => r.show_to_customer)

  // Generate recommendations
  const recommendations = generateRecommendations(risks)

  return {
    risks,
    overall_risk_level: overallLevel,
    customer_visible_risks: customerVisibleRisks,
    recommendations,
  }
}

/**
 * Quick risk check for UI badges/indicators
 *
 * @param input - Minimal project context
 * @returns Simple risk level indicator
 */
export function quickRiskCheck(input: RiskAnalysisInput): {
  level: 'low' | 'medium' | 'high'
  count: number
  topIssue: string | null
} {
  const result = analyzeProjectRisks(input)

  return {
    level: result.overall_risk_level,
    count: result.risks.length,
    topIssue: result.risks[0]?.title || null,
  }
}

/**
 * Get OBS points for offer display
 * These are customer-safe messages that should be shown in the offer
 *
 * @param input - Project context
 * @returns List of OBS point strings
 */
export function getOfferObsPoints(input: RiskAnalysisInput): string[] {
  const result = analyzeProjectRisks(input)

  return result.customer_visible_risks
    .filter(r => r.customer_message)
    .map(r => r.customer_message!)
}

/**
 * Get margin recommendation based on risk analysis
 *
 * @param input - Project context
 * @returns Recommended minimum margin percentage
 */
export function getRecommendedMargin(input: RiskAnalysisInput): {
  minimumMargin: number
  recommendedMargin: number
  reason: string
} {
  const result = analyzeProjectRisks(input)

  let minimumMargin = 15 // Base minimum
  let recommendedMargin = 25 // Default recommendation
  const reasons: string[] = []

  // Adjust based on risks
  if (result.risks.some(r => r.detection_rule === 'RISK_VERY_OLD')) {
    minimumMargin = Math.max(minimumMargin, 25)
    recommendedMargin = Math.max(recommendedMargin, 35)
    reasons.push('gammel bygning')
  }

  if (result.risks.some(r => r.category === 'safety')) {
    minimumMargin = Math.max(minimumMargin, 20)
    recommendedMargin = Math.max(recommendedMargin, 30)
    reasons.push('sikkerhedskrav')
  }

  if (result.overall_risk_level === 'high') {
    minimumMargin = Math.max(minimumMargin, 22)
    recommendedMargin = Math.max(recommendedMargin, 32)
    reasons.push('høj samlet risiko')
  }

  if (input.building_type === 'commercial' || input.building_type === 'industrial') {
    minimumMargin = Math.max(minimumMargin, 20)
    recommendedMargin = Math.max(recommendedMargin, 28)
    reasons.push('erhverv/industri')
  }

  return {
    minimumMargin,
    recommendedMargin,
    reason: reasons.length > 0
      ? `Anbefalet pga: ${reasons.join(', ')}`
      : 'Standard margin for projektet',
  }
}

/**
 * Get all available risk rules
 * Useful for admin/configuration UI
 */
export function getRiskRules(): Array<{
  code: string
  name: string
  category: RiskCategory
  severity: RiskSeverity
  showToCustomer: boolean
}> {
  return RISK_RULES.map(rule => ({
    code: rule.code,
    name: rule.name,
    category: rule.category,
    severity: rule.defaultSeverity,
    showToCustomer: rule.showToCustomer,
  }))
}
