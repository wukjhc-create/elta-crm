/**
 * Test Harness — public entry (fundament).
 * Se docs/test-harness-architecture.md.
 */
export * from './env-guard'
export * from './types'
export { Rng } from './rng'
export { INVARIANTS } from './invariants'
export { runInvariants, formatReport, type QueryFn } from './runner'
export { DEFAULT_CONFIG, generate, buildPlan, makeSeedRunId, syntheticMarker } from './generator'
export type { HarnessPlan, PlannedEntity } from './generator'
export { runScenarios, type ScenarioRunResult } from './scenario-runner'
export { percentile, latencyStats, errorRate, timed, type LatencyStats } from './metrics'
export { STRESS_MULTIPLIER, applyStressProfile, stressTargets, type StressProfile } from './stress'
export { SECURITY_SCENARIOS, scenarioPassed, type SecurityScenario, type SecurityRole } from './security-scenarios'
