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
import type { GeneratorConfig } from './types'
import { buildPlan } from './planner'

export { makeSeedRunId, syntheticMarker } from './generator-util'

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

export { buildPlan } from './planner'
export type { HarnessPlan, PlannedEntity } from './planner'

/**
 * Generér simuleret drift: bygger en deterministisk PLAN (ren, sikker) og
 * anvender den mod staging. Selve DB-anvendelsen kraever et sikkert staging-
 * target (assertSafeHarnessTarget) OG er endnu ikke wired til de faktiske
 * tabeller — kaster bevidst, saa fundamentet er paa plads uden at kunne skrive.
 */
export async function generate(config: GeneratorConfig = DEFAULT_CONFIG): Promise<never> {
  const { buildPlan } = await import('./planner')
  const plan = buildPlan(config) // ren — altid sikker at bygge
  // Safeguard FOERST foer nogen skrivning: blokerer hvis target ligner production.
  assertSafeHarnessTarget()
  throw new Error(
    `Test Harness plan bygget (${plan.entities.length} entiteter, seed=${config.seed}), ` +
      `men DB-anvendelse (applyPlan) er endnu ikke wired til staging-skemaet. ` +
      `Implementeres naar en sikker staging-DB er etableret.`,
  )
}
