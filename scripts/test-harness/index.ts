/**
 * Test Harness — public entry (fundament).
 * Se docs/test-harness-architecture.md.
 */
export * from './env-guard'
export * from './types'
export { INVARIANTS } from './invariants'
export { runInvariants, formatReport, type QueryFn } from './runner'
export { DEFAULT_CONFIG, generate, makeSeedRunId, syntheticMarker } from './generator'
export { runScenarios, type ScenarioRunResult } from './scenario-runner'
