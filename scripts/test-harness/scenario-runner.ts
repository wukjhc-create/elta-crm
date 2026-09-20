/**
 * Test Harness — scenario-runner (SKELET). Koerer navngivne scenarier
 * (fejlscenarier, samtidige handlinger, permission/RLS-tests) mod et sikkert
 * target og opsamler metrics. Safeguard FOERST.
 *
 * Cleanup/reset: alle syntetiske rows kan fjernes via SYNTHETIC_TAG-filter
 * (implementeres sammen med generator).
 */
import { assertSafeHarnessTarget } from './env-guard'
import type { ScenarioStep } from './types'

export interface ScenarioRunResult {
  seedRunId: string
  steps: Array<{ id: string; ok: boolean; metrics?: Record<string, unknown>; error?: string }>
}

/**
 * Koer et saet scenarier. IKKE implementeret endnu — safeguard sikrer at det
 * aldrig rammer production, og fundamentet (kontrakter) er paa plads.
 */
export async function runScenarios(_steps: ScenarioStep[], _seed: string): Promise<never> {
  assertSafeHarnessTarget()
  void _steps
  void _seed
  throw new Error(
    'Test Harness scenario-runner er endnu ikke implementeret. Fundament/kontrakter er paa plads; ' +
      'scenarier bygges naar staging-DB er sikkert etableret.',
  )
}
