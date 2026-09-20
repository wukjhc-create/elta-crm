/**
 * Test Harness — scenario-runner (SKELET). Koerer navngivne scenarier
 * (fejl/samtidighed/permission-RLS) mod et sikkert target og opsamler metrics.
 * Safeguard FOERST. Kontrakter (SECURITY_SCENARIOS) + forventet udfald er
 * defineret nu; udfoerelsen mod staging wires naar staging findes.
 *
 * Cleanup/reset: alle syntetiske rows fjernes via SYNTHETIC_TAG-filter.
 */
import { assertRuntimeConfig } from './env-guard'
import { SECURITY_SCENARIOS } from './security-scenarios'
import type { ScenarioStep } from './types'

export interface ScenarioRunResult {
  seedRunId: string
  steps: Array<{ id: string; ok: boolean; metrics?: Record<string, unknown>; error?: string }>
}

/** Antal definerede sikkerheds-scenarier (til fundament-verifikation). */
export function securityScenarioCount(): number {
  return SECURITY_SCENARIOS.length
}

/**
 * Koer scenarier. IKKE implementeret endnu — safeguard sikrer at det aldrig
 * rammer production; fundament/kontrakter er paa plads.
 */
export async function runScenarios(_steps: ScenarioStep[], _seed: string): Promise<never> {
  assertRuntimeConfig() // RUNTIME — ingen management-token
  void _steps
  void _seed
  throw new Error(
    'Test Harness scenario-runner er endnu ikke implementeret. Fundament/kontrakter (inkl. ' +
      `${SECURITY_SCENARIOS.length} sikkerheds-scenarier) er paa plads; scenarier bygges naar staging findes.`,
  )
}
