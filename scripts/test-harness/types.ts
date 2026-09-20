/**
 * Test Harness — typer/kontrakter (fundament).
 * Selve simulationen implementeres FOERST naar staging er sikkert etableret.
 */

/** Alle syntetiske data markeres tydeligt, saa de aldrig forveksles med rigtige. */
export const SYNTHETIC_TAG = 'HARNESS_SYNTHETIC'
export interface SyntheticMarker {
  /** Skrives i et metadata/tag-felt paa alle genererede rows. */
  tag: typeof SYNTHETIC_TAG
  /** Deterministisk seed-id for denne koersel (reproducerbarhed). */
  seedRunId: string
}

export interface GeneratorConfig {
  /** Deterministisk seed (samme seed => samme data). */
  seed: string
  /** Antal nye kunder pr. maaned. */
  customersPerMonth: number // 100-200
  /** Antal maaneder simuleret drift. */
  months: number // >= 12
  /** Sandsynligheder/mix for afledte entiteter (0..1). */
  mix: {
    leadToCustomer: number
    customerToCase: number
    caseToOffer: number
    offerAccepted: number
    emailsPerCustomer: number
    documentsPerCase: number
    portalActivityRate: number
    agentProposalRate: number
    errorScenarioRate: number
    concurrentActionRate: number
  }
}

export type InvariantSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface InvariantCheck {
  id: string
  title: string
  description: string
  severity: InvariantSeverity
  /**
   * SQL der returnerer de raekker der VIOLERER invarianten (forvent 0).
   * Skal vaere READ-ONLY. Bruges af runner mod et target (helst staging).
   */
  violationSql: string
  /** Kolonne(r) at vise i sample (valgfrit). */
  sampleColumns?: string[]
}

export interface InvariantResult {
  id: string
  title: string
  severity: InvariantSeverity
  ok: boolean
  violations: number
  sample?: unknown[]
  error?: string
}

export interface HarnessReport {
  startedAt: string
  finishedAt: string
  target: string // maskeret (ref), aldrig hele URL/secret
  totalChecks: number
  passed: number
  failed: number
  bySeverity: Record<InvariantSeverity, { passed: number; failed: number }>
  results: InvariantResult[]
}

export interface ScenarioStep {
  id: string
  description: string
  /** Handling der udfoeres mod target (kun ikke-prod). Returnerer metrics. */
  run: (ctx: ScenarioContext) => Promise<Record<string, unknown>>
}

export interface ScenarioContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
  seedRunId: string
  now: Date
}
