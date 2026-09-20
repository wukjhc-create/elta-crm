/**
 * Test Harness — stress-profiler. Skalerer en GeneratorConfig for at teste
 * normal drift, 5x belastning og 10x spidsbelastning.
 */
import type { GeneratorConfig } from './types'

export type StressProfile = 'normal' | 'x5' | 'x10'

export const STRESS_MULTIPLIER: Record<StressProfile, number> = {
  normal: 1,
  x5: 5,
  x10: 10,
}

/** Skaler kunde-volumen (og dermed afledt volumen) for en profil. */
export function applyStressProfile(config: GeneratorConfig, profile: StressProfile): GeneratorConfig {
  const mult = STRESS_MULTIPLIER[profile]
  return {
    ...config,
    seed: `${config.seed}:${profile}`,
    customersPerMonth: config.customersPerMonth * mult,
  }
}

export interface StressTarget {
  profile: StressProfile
  customersPerMonth: number
  months: number
  approxCustomers: number
}

export function stressTargets(config: GeneratorConfig): StressTarget[] {
  return (Object.keys(STRESS_MULTIPLIER) as StressProfile[]).map((profile) => {
    const c = applyStressProfile(config, profile)
    return {
      profile,
      customersPerMonth: c.customersPerMonth,
      months: c.months,
      approxCustomers: c.customersPerMonth * c.months,
    }
  })
}
