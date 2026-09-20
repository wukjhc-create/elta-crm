/**
 * Test Harness — data-generator (SKELET). IMPLEMENTERES FOERST naar en sikker
 * staging-DB er etableret. Enhver koersel starter med assertSafeHarnessTarget,
 * saa den ALDRIG kan generere mod production.
 *
 * Naar implementeret genererer den deterministisk (fra seed) et helt aars
 * drift: kunder/leads/sager/tilbud/mails/dokumenter/portalaktivitet/status-
 * aendringer/medarbejderhandlinger/agent-proposals+approvals/fejlscenarier/
 * samtidige handlinger. Alle rows markeres SYNTHETIC (SYNTHETIC_TAG).
 */
import { assertSafeHarnessTarget } from './env-guard'
import { SYNTHETIC_TAG, type GeneratorConfig, type SyntheticMarker } from './types'

export function makeSeedRunId(seed: string): string {
  return `harness-${seed}`
}

export function syntheticMarker(seed: string): SyntheticMarker {
  return { tag: SYNTHETIC_TAG, seedRunId: makeSeedRunId(seed) }
}

export const DEFAULT_CONFIG: GeneratorConfig = {
  seed: 'default',
  customersPerMonth: 150,
  months: 12,
  mix: {
    leadToCustomer: 0.6,
    customerToCase: 0.7,
    caseToOffer: 0.5,
    offerAccepted: 0.4,
    emailsPerCustomer: 3,
    documentsPerCase: 2,
    portalActivityRate: 0.3,
    agentProposalRate: 0.5,
    errorScenarioRate: 0.05,
    concurrentActionRate: 0.05,
  },
}

/**
 * Generér simuleret drift. IKKE implementeret endnu — kaster bevidst efter
 * safeguard, saa fundamentet er paa plads uden at kunne skrive data.
 */
export async function generate(config: GeneratorConfig = DEFAULT_CONFIG): Promise<never> {
  // Safeguard FOERST: blokerer hvis target ligner production / ikke er sat.
  assertSafeHarnessTarget()
  void config
  throw new Error(
    'Test Harness generator er endnu ikke implementeret. Fundament er paa plads; ' +
      'selve aars-simulationen bygges naar staging-DB er sikkert etableret og verificeret.',
  )
}
