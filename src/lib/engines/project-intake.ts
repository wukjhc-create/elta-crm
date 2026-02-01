/**
 * PROJECT INTAKE ENGINE
 *
 * Transforms textual project descriptions into structured data:
 * - Suggested rooms based on keyword detection
 * - Suggested components based on context
 * - Suggested quick jobs
 *
 * Architecture Notes:
 * - Uses keyword matching for initial parsing (no AI calls yet)
 * - Designed to be augmented with AI in the future
 * - Confidence scores indicate parsing reliability
 */

import type {
  ProjectIntakeInput,
  ProjectIntakeResult,
  DetectedRoom,
  DetectedComponent,
  DetectedQuickJob,
  ProjectType,
  BuildingType,
} from '@/types/ai-intelligence.types'

// =====================================================
// KEYWORD DICTIONARIES
// =====================================================

interface KeywordMatch {
  code: string
  keywords: string[]
  synonyms?: string[]
}

// Room detection keywords (Danish)
const ROOM_KEYWORDS: KeywordMatch[] = [
  { code: 'BEDROOM', keywords: ['soveværelse', 'værelse', 'børneværelse', 'gæsteværelse'], synonyms: ['bedroom'] },
  { code: 'LIVING', keywords: ['stue', 'opholdsstue', 'dagligstue', 'alrum'], synonyms: ['living room'] },
  { code: 'KITCHEN', keywords: ['køkken', 'køkkenalrum'], synonyms: ['kitchen'] },
  { code: 'BATHROOM', keywords: ['badeværelse', 'bad', 'toilet', 'wc', 'bryggers', 'vaskerum'], synonyms: ['bathroom'] },
  { code: 'ENTRY', keywords: ['entre', 'entré', 'gang', 'forgang'], synonyms: ['hallway', 'entry'] },
  { code: 'OFFICE', keywords: ['kontor', 'hjemmekontor', 'arbejdsværelse'], synonyms: ['office'] },
  { code: 'GARAGE', keywords: ['garage', 'carport'], synonyms: ['garage'] },
  { code: 'BASEMENT', keywords: ['kælder', 'kælderrum'], synonyms: ['basement'] },
  { code: 'OUTDOOR', keywords: ['have', 'terrasse', 'altan', 'udendørs', 'udenfor'], synonyms: ['outdoor', 'garden'] },
  { code: 'STORAGE', keywords: ['depot', 'opbevaring', 'pulterrum'], synonyms: ['storage'] },
]

// Component detection keywords
const COMPONENT_KEYWORDS: KeywordMatch[] = [
  { code: 'STIK-1-NY', keywords: ['stikkontakt', 'stik', 'kontakt', 'elstik'] },
  { code: 'STIK-2-NY', keywords: ['dobbelt stikkontakt', 'dobbelt stik', 'dobbeltstik', '2-stik'] },
  { code: 'AFB-1P-NY', keywords: ['afbryder', 'lyskontakt', 'lysafbryder'] },
  { code: 'AFB-2P-NY', keywords: ['dobbelt afbryder', 'serie afbryder'] },
  { code: 'LOFT-NY', keywords: ['loftlampe', 'loftslampe', 'loftudtag', 'pendel'] },
  { code: 'SPOT-NY', keywords: ['spot', 'spots', 'spotlights', 'downlight', 'indbygningsspot'] },
  { code: 'VAEG-NY', keywords: ['væglampe', 'vægudtag', 'vægspot'] },
  { code: 'LED-NY', keywords: ['led', 'led-strip', 'led strip', 'led-belysning'] },
]

// Quick job detection keywords
const JOB_KEYWORDS: KeywordMatch[] = [
  { code: 'ELTAVLE-CHECK', keywords: ['eltavle', 'gruppetavle', 'sikringstavle', 'tavle'] },
  { code: 'HPFI-NY', keywords: ['hpfi', 'hpfi-relæ', 'fejlstrømsrelæ', 'rcd'] },
  { code: 'LAMPEMONTAGE', keywords: ['lampe', 'lamper', 'lysekrone', 'pendel'] },
  { code: 'EMHAETTE', keywords: ['emhætte', 'udsugning', 'ventilation', 'aftræk'] },
]

// Project type keywords
const PROJECT_TYPE_KEYWORDS: Record<ProjectType, string[]> = {
  renovation: ['renovering', 'renovation', 'ombygning', 'modernisering', 'opdatering'],
  new_build: ['nybyggeri', 'nyt hus', 'nybyg', 'ny bygning'],
  extension: ['tilbygning', 'udbygning', 'udvidelse'],
  maintenance: ['vedligeholdelse', 'reparation', 'service', 'fejlfinding'],
}

// Building type keywords
const BUILDING_TYPE_KEYWORDS: Record<BuildingType, string[]> = {
  house: ['hus', 'villa', 'parcelhus', 'rækkehus', 'sommerhus'],
  apartment: ['lejlighed', 'ejerlejlighed', 'andelslejlighed', 'etage'],
  commercial: ['butik', 'kontor', 'erhverv', 'forretning', 'restaurant'],
  industrial: ['lager', 'værksted', 'fabrik', 'industri', 'hal'],
}

// =====================================================
// PARSING UTILITIES
// =====================================================

/**
 * Normalize text for matching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .trim()
}

/**
 * Check if text contains any of the keywords
 */
function containsKeyword(text: string, keywords: string[]): string | null {
  const normalizedText = normalizeText(text)
  for (const keyword of keywords) {
    if (normalizedText.includes(normalizeText(keyword))) {
      return keyword
    }
  }
  return null
}

/**
 * Extract number from text near a keyword
 */
function extractNumberNear(text: string, keyword: string, maxDistance: number = 20): number | null {
  const normalizedText = normalizeText(text)
  const keywordIndex = normalizedText.indexOf(normalizeText(keyword))
  if (keywordIndex === -1) return null

  // Look for numbers before and after the keyword
  const searchStart = Math.max(0, keywordIndex - maxDistance)
  const searchEnd = Math.min(normalizedText.length, keywordIndex + keyword.length + maxDistance)
  const searchRegion = text.slice(searchStart, searchEnd)

  // Match patterns like "2 soveværelser", "3x stikkontakt", "10 stk"
  const patterns = [
    /(\d+)\s*(?:stk|x|×|gange)?/i,
    /(\d+)\s*(?:af|stykker?)?/i,
  ]

  for (const pattern of patterns) {
    const match = searchRegion.match(pattern)
    if (match) {
      return parseInt(match[1], 10)
    }
  }

  return null
}

/**
 * Extract room size from text
 */
function extractRoomSize(text: string): number | null {
  // Match patterns like "15 m²", "20m2", "ca. 25 kvadratmeter"
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*m[²2]/i,
    /(\d+(?:[.,]\d+)?)\s*kvadratmeter/i,
    /(\d+(?:[.,]\d+)?)\s*kvm/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return parseFloat(match[1].replace(',', '.'))
    }
  }

  return null
}

/**
 * Extract building age from text
 */
function extractBuildingAge(text: string): number | null {
  const currentYear = new Date().getFullYear()

  // Match "fra 1970", "bygget i 1985", "hus fra 60'erne"
  const yearPatterns = [
    /(?:fra|bygget\s+i|opført\s+i)\s+(\d{4})/i,
    /(\d{4})(?:'erne|[-]tallet)?/i,
    /(\d{2})['']?erne/i, // 60'erne, 70erne
  ]

  for (const pattern of yearPatterns) {
    const match = text.match(pattern)
    if (match) {
      let year = parseInt(match[1], 10)
      if (year < 100) {
        year += year > 30 ? 1900 : 2000 // 60'erne = 1960s
      }
      if (year >= 1800 && year <= currentYear) {
        return currentYear - year
      }
    }
  }

  // Match "30 år gammelt"
  const agePattern = /(\d+)\s*år\s*(?:gammel|gammelt|gamm\.)/i
  const ageMatch = text.match(agePattern)
  if (ageMatch) {
    return parseInt(ageMatch[1], 10)
  }

  return null
}

// =====================================================
// MAIN ENGINE FUNCTIONS
// =====================================================

/**
 * Detect rooms from project description
 */
function detectRooms(text: string): DetectedRoom[] {
  const rooms: DetectedRoom[] = []
  const detectedCodes = new Set<string>()

  for (const roomDef of ROOM_KEYWORDS) {
    const allKeywords = [...roomDef.keywords, ...(roomDef.synonyms || [])]

    for (const keyword of allKeywords) {
      if (containsKeyword(text, [keyword])) {
        // Avoid duplicates
        if (detectedCodes.has(roomDef.code)) continue
        detectedCodes.add(roomDef.code)

        // Try to extract count
        let count = extractNumberNear(text, keyword)
        if (!count || count > 10) count = 1 // Reasonable default

        // Calculate confidence based on match quality
        const confidence = roomDef.keywords.includes(keyword) ? 0.9 : 0.7

        rooms.push({
          room_type: roomDef.code,
          count,
          confidence,
          source: `keyword: ${keyword}`,
        })
        break
      }
    }
  }

  return rooms
}

/**
 * Detect components from project description
 */
function detectComponents(text: string, detectedRooms: DetectedRoom[]): DetectedComponent[] {
  const components: DetectedComponent[] = []
  const detectedCodes = new Map<string, DetectedComponent>()

  // Detect explicitly mentioned components
  for (const compDef of COMPONENT_KEYWORDS) {
    for (const keyword of compDef.keywords) {
      if (containsKeyword(text, [keyword])) {
        // Try to extract quantity
        let quantity = extractNumberNear(text, keyword)
        if (!quantity || quantity > 100) quantity = 1

        const existing = detectedCodes.get(compDef.code)
        if (!existing || quantity > existing.quantity) {
          const comp: DetectedComponent = {
            component_code: compDef.code,
            quantity,
            reason: `keyword: ${keyword}`,
            confidence: 0.85,
          }
          detectedCodes.set(compDef.code, comp)
        }
      }
    }
  }

  // Add room-based suggestions if no explicit components found
  if (detectedCodes.size === 0 && detectedRooms.length > 0) {
    // Default suggestions per room type
    const roomDefaults: Record<string, Array<{ code: string; qty: number }>> = {
      BEDROOM: [{ code: 'STIK-1-NY', qty: 4 }, { code: 'AFB-1P-NY', qty: 1 }, { code: 'LOFT-NY', qty: 1 }],
      LIVING: [{ code: 'STIK-1-NY', qty: 6 }, { code: 'AFB-1P-NY', qty: 2 }, { code: 'LOFT-NY', qty: 1 }],
      KITCHEN: [{ code: 'STIK-2-NY', qty: 4 }, { code: 'AFB-1P-NY', qty: 2 }, { code: 'SPOT-NY', qty: 4 }],
      BATHROOM: [{ code: 'STIK-1-NY', qty: 2 }, { code: 'AFB-1P-NY', qty: 1 }, { code: 'SPOT-NY', qty: 2 }],
      ENTRY: [{ code: 'STIK-1-NY', qty: 1 }, { code: 'AFB-1P-NY', qty: 1 }, { code: 'LOFT-NY', qty: 1 }],
    }

    for (const room of detectedRooms) {
      const defaults = roomDefaults[room.room_type]
      if (defaults) {
        for (const def of defaults) {
          const existing = detectedCodes.get(def.code)
          const newQty = def.qty * room.count
          if (existing) {
            existing.quantity += newQty
          } else {
            detectedCodes.set(def.code, {
              component_code: def.code,
              quantity: newQty,
              reason: `room-based: ${room.room_type}`,
              confidence: 0.6,
            })
          }
        }
      }
    }
  }

  return Array.from(detectedCodes.values())
}

/**
 * Detect quick jobs from project description
 */
function detectQuickJobs(text: string): DetectedQuickJob[] {
  const jobs: DetectedQuickJob[] = []
  const detectedCodes = new Set<string>()

  for (const jobDef of JOB_KEYWORDS) {
    for (const keyword of jobDef.keywords) {
      if (containsKeyword(text, [keyword]) && !detectedCodes.has(jobDef.code)) {
        detectedCodes.add(jobDef.code)
        jobs.push({
          job_code: jobDef.code,
          reason: `keyword: ${keyword}`,
          confidence: 0.8,
        })
        break
      }
    }
  }

  return jobs
}

/**
 * Detect project type from description
 */
function detectProjectType(text: string): ProjectType | null {
  for (const [type, keywords] of Object.entries(PROJECT_TYPE_KEYWORDS)) {
    if (containsKeyword(text, keywords)) {
      return type as ProjectType
    }
  }
  return null
}

/**
 * Detect building type from description
 */
function detectBuildingType(text: string): BuildingType | null {
  for (const [type, keywords] of Object.entries(BUILDING_TYPE_KEYWORDS)) {
    if (containsKeyword(text, keywords)) {
      return type as BuildingType
    }
  }
  return null
}

/**
 * Detect urgency from description
 */
function detectUrgency(text: string): 'low' | 'normal' | 'high' | 'emergency' {
  const urgentKeywords = ['haster', 'hastende', 'akut', 'hurtig', 'snarest', 'presserende', 'nødvendigt nu']
  const emergencyKeywords = ['nødsituation', 'strømafbrydelse', 'brand', 'fare', 'livsfarlig']

  if (containsKeyword(text, emergencyKeywords)) return 'emergency'
  if (containsKeyword(text, urgentKeywords)) return 'high'
  return 'normal'
}

// =====================================================
// MAIN EXPORT
// =====================================================

/**
 * Process a project description and extract structured information
 *
 * @param input - Project description and optional context
 * @returns Parsed project context with suggestions
 */
export function parseProjectDescription(input: ProjectIntakeInput): ProjectIntakeResult {
  const { description } = input
  const parsingNotes: string[] = []

  // Detect rooms
  const detectedRooms = detectRooms(description)
  if (detectedRooms.length > 0) {
    parsingNotes.push(`Fandt ${detectedRooms.length} rumtype(r)`)
  }

  // Detect components (uses rooms for context)
  const detectedComponents = detectComponents(description, detectedRooms)
  if (detectedComponents.length > 0) {
    parsingNotes.push(`Fandt ${detectedComponents.length} komponenttype(r)`)
  }

  // Detect quick jobs
  const detectedJobs = detectQuickJobs(description)
  if (detectedJobs.length > 0) {
    parsingNotes.push(`Fandt ${detectedJobs.length} hurtig-job(s)`)
  }

  // Detect project metadata
  const projectType = detectProjectType(description) || input.building_type as unknown as ProjectType || null
  const buildingType = input.building_type || detectBuildingType(description)
  const buildingAge = input.building_age || extractBuildingAge(description)
  const buildingSize = input.building_size_m2 || extractRoomSize(description)
  const urgency = input.urgency || detectUrgency(description)
  const customerPriority = input.customer_priority

  // Calculate overall confidence
  const confidenceScores = [
    ...detectedRooms.map(r => r.confidence),
    ...detectedComponents.map(c => c.confidence),
    ...detectedJobs.map(j => j.confidence),
  ]
  const overallConfidence = confidenceScores.length > 0
    ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
    : 0.3 // Low confidence if nothing detected

  // Build result
  const result: ProjectIntakeResult = {
    context: {
      source_type: 'text_input',
      original_text: description,
      project_type: projectType,
      building_type: buildingType || undefined,
      building_age_years: buildingAge || undefined,
      building_size_m2: buildingSize || undefined,
      detected_rooms: detectedRooms,
      detected_components: detectedComponents,
      detected_quick_jobs: detectedJobs,
      customer_priority: customerPriority,
      urgency_level: urgency,
      overall_confidence: overallConfidence,
      parsing_notes: parsingNotes.join('. '),
    },
    suggested_rooms: detectedRooms,
    suggested_components: detectedComponents,
    suggested_quick_jobs: detectedJobs,
    confidence: overallConfidence,
    parsing_notes: parsingNotes,
  }

  return result
}

/**
 * Get keywords for a specific category
 * Useful for displaying what the engine can detect
 */
export function getKeywordCategories() {
  return {
    rooms: ROOM_KEYWORDS.map(r => ({ code: r.code, keywords: r.keywords })),
    components: COMPONENT_KEYWORDS.map(c => ({ code: c.code, keywords: c.keywords })),
    jobs: JOB_KEYWORDS.map(j => ({ code: j.code, keywords: j.keywords })),
    projectTypes: PROJECT_TYPE_KEYWORDS,
    buildingTypes: BUILDING_TYPE_KEYWORDS,
  }
}
