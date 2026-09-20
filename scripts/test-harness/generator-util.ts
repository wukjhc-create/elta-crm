/**
 * Test Harness — rene generator-helpers (ingen guard, ingen DB).
 */
import { SYNTHETIC_TAG, type SyntheticMarker } from './types'

export function makeSeedRunId(seed: string): string {
  return `harness-${seed}`
}

export function syntheticMarker(seed: string): SyntheticMarker {
  return { tag: SYNTHETIC_TAG, seedRunId: makeSeedRunId(seed) }
}
