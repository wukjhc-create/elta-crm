'use server'

import type { ActionResult } from '@/types/common.types'
import type {
  CableSizingInput,
  CableSizingResult,
  LoadEntry,
  LoadAnalysisResult,
  PanelConfiguration,
  ComplianceCheckResult,
  ElectricalProjectInput,
  ElectricalProjectResult,
  ElectricalRoomInput,
  PhaseType,
} from '@/types/electrical.types'
import {
  calculateCableSize,
  calculateLoad,
  configurePanelFromLoads,
  checkCompliance,
  calculateElectricalProject,
} from '@/lib/services/electrical-engine'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Cable Sizing
// =====================================================

/**
 * Calculate cable sizing for a single circuit.
 * Returns recommended cable cross-section, voltage drop, and compliance status.
 */
export async function calculateCableSizing(
  input: CableSizingInput
): Promise<ActionResult<CableSizingResult>> {
  try {
    await getAuthenticatedClient()

    if (input.power_watts <= 0) {
      return { success: false, error: 'Effekt skal være større end 0W' }
    }
    if (input.length_meters <= 0) {
      return { success: false, error: 'Kabellængde skal være større end 0m' }
    }
    if (input.voltage <= 0) {
      return { success: false, error: 'Spænding skal være større end 0V' }
    }

    const result = calculateCableSize(input)

    return { success: true, data: result }
  } catch (err) {
    logger.error('Cable sizing calculation failed', { error: err, action: 'calculateCableSizing' })
    return { success: false, error: formatError(err, 'Kunne ikke beregne kabeldimensionering') }
  }
}

// =====================================================
// Load Analysis
// =====================================================

/**
 * Calculate electrical load analysis with diversity factors.
 * Determines total demand, phase balance, and main breaker requirements.
 */
export async function calculateLoadAnalysis(
  loads: LoadEntry[],
  phase: PhaseType,
  building_type: 'residential' | 'commercial' | 'industrial' = 'residential'
): Promise<ActionResult<LoadAnalysisResult>> {
  try {
    await getAuthenticatedClient()

    if (!loads || loads.length === 0) {
      return { success: false, error: 'Mindst én belastning skal angives' }
    }

    const result = calculateLoad(loads, phase, building_type)

    return { success: true, data: result }
  } catch (err) {
    logger.error('Load analysis failed', { error: err, action: 'calculateLoadAnalysis' })
    return { success: false, error: formatError(err, 'Kunne ikke beregne belastningsanalyse') }
  }
}

// =====================================================
// Panel Configuration
// =====================================================

/**
 * Configure a distribution panel based on loads and rooms.
 * Returns complete panel layout with circuits, breakers, and RCD groups.
 */
export async function calculatePanelConfiguration(
  loads: LoadEntry[],
  rooms: ElectricalRoomInput[],
  phase: PhaseType,
  is_renovation: boolean = false
): Promise<ActionResult<PanelConfiguration>> {
  try {
    await getAuthenticatedClient()

    if (!rooms || rooms.length === 0) {
      return { success: false, error: 'Mindst ét rum skal angives' }
    }

    const result = configurePanelFromLoads(loads, rooms, phase, is_renovation)

    return { success: true, data: result }
  } catch (err) {
    logger.error('Panel configuration failed', { error: err, action: 'calculatePanelConfiguration' })
    return { success: false, error: formatError(err, 'Kunne ikke konfigurere tavle') }
  }
}

// =====================================================
// Compliance Check
// =====================================================

/**
 * Run compliance checks against Danish electrical standards (DS/HD 60364).
 * Checks RCD protection, cable-breaker coordination, voltage drop, etc.
 */
export async function runComplianceCheck(
  panel: PanelConfiguration,
  cableSizing: CableSizingResult[],
  rooms: ElectricalRoomInput[]
): Promise<ActionResult<ComplianceCheckResult>> {
  try {
    await getAuthenticatedClient()

    const result = checkCompliance(panel, cableSizing, rooms)

    return { success: true, data: result }
  } catch (err) {
    logger.error('Compliance check failed', { error: err, action: 'runComplianceCheck' })
    return { success: false, error: formatError(err, 'Kunne ikke køre overholdelsestjek') }
  }
}

// =====================================================
// Full Project Calculation
// =====================================================

/**
 * Calculate a complete electrical project.
 * Combines load analysis, panel configuration, cable sizing, and compliance.
 */
export async function calculateFullElectricalProject(
  input: ElectricalProjectInput
): Promise<ActionResult<ElectricalProjectResult>> {
  try {
    await getAuthenticatedClient()

    if (!input.rooms || input.rooms.length === 0) {
      return { success: false, error: 'Projektet skal have mindst ét rum' }
    }
    if (!input.supply_phase) {
      return { success: false, error: 'Forsyningstype (1-fase/3-fase) skal angives' }
    }

    const result = calculateElectricalProject(input)

    logger.info('Electrical project calculated', {
      action: 'calculateFullElectricalProject',
      metadata: {
        rooms: input.rooms.length,
        circuits: result.panel.circuits.length,
        totalLoad: result.load_analysis.total_connected_load_w,
        compliant: result.compliance.compliant,
      },
    })

    return { success: true, data: result }
  } catch (err) {
    logger.error('Full electrical project calculation failed', { error: err, action: 'calculateFullElectricalProject' })
    return { success: false, error: formatError(err, 'Kunne ikke beregne elektrisk projekt') }
  }
}
