/**
 * Test af Test Harness generator/metrics/stress/security (rene, ingen DB).
 *   npx tsx scripts/test-harness-generator-test.ts
 */
import { Rng } from './test-harness/rng'
import { buildPlan } from './test-harness/planner'
import { percentile, latencyStats } from './test-harness/metrics'
import { applyStressProfile, stressTargets } from './test-harness/stress'
import { SECURITY_SCENARIOS, scenarioPassed } from './test-harness/security-scenarios'
import { SYNTHETIC_TAG, type GeneratorConfig } from './test-harness/types'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

// Rng determinisme
const a = new Rng('seed-1'); const b = new Rng('seed-1'); const c = new Rng('seed-2')
const seqA = [a.float(), a.float(), a.float()]
const seqB = [b.float(), b.float(), b.float()]
const seqC = [c.float(), c.float(), c.float()]
assert(JSON.stringify(seqA) === JSON.stringify(seqB), 'Rng: samme seed => samme sekvens')
assert(JSON.stringify(seqA) !== JSON.stringify(seqC), 'Rng: forskellig seed => forskellig sekvens')

const cfg: GeneratorConfig = {
  seed: 'test', customersPerMonth: 5, months: 3,
  mix: { leadToCustomer: 0.6, customerToCase: 0.7, caseToOffer: 0.5, offerAccepted: 0.4, emailsPerCustomer: 2, documentsPerCase: 1, portalActivityRate: 0.3, agentProposalRate: 0.5, errorScenarioRate: 0.05, concurrentActionRate: 0.05 },
}

// Plan determinisme + counts
const p1 = buildPlan(cfg)
const p2 = buildPlan(cfg)
assert(p1.counts.customer === 15, 'plan: customers = customersPerMonth × months (5×3=15)', String(p1.counts.customer))
assert(JSON.stringify(p1.counts) === JSON.stringify(p2.counts), 'plan: samme seed => samme counts')
const firstCust1 = p1.entities.find((e) => e.kind === 'customer')
const firstCust2 = p2.entities.find((e) => e.kind === 'customer')
assert(firstCust1?.data.email === firstCust2?.data.email, 'plan: deterministisk (samme første kunde)')
assert(p1.entities.every((e) => e.synthetic === SYNTHETIC_TAG), 'plan: ALLE entiteter er syntetisk-tagget')
assert(buildPlan({ ...cfg, seed: 'anden' }).entities.find((e) => e.kind === 'customer')?.data.email !== firstCust1?.data.email, 'plan: anden seed => andre data')

// metrics
assert(percentile([1, 2, 3, 4, 5], 50) === 3, 'percentile p50 af [1..5] = 3')
const st = latencyStats([10, 20, 30, 40, 100])
assert(st.count === 5 && st.min === 10 && st.max === 100, 'latencyStats basale felter')
assert(st.p95 >= st.p50 && st.p99 >= st.p95, 'latencyStats: p99 >= p95 >= p50')

// stress
assert(applyStressProfile(cfg, 'x10').customersPerMonth === 50, 'stress x10: customersPerMonth ×10')
assert(stressTargets(cfg).length === 3, 'stress: 3 profiler (normal/x5/x10)')
assert(stressTargets(cfg).find((t) => t.profile === 'x5')?.approxCustomers === 5 * 5 * 3, 'stress x5: approx kunder korrekt')

// security scenarier
assert(SECURITY_SCENARIOS.length >= 10, 'sikkerhed: >=10 scenarier defineret', String(SECURITY_SCENARIOS.length))
assert(SECURITY_SCENARIOS.every((s) => s.mustBeDenied), 'sikkerhed: alle scenarier SKAL afvises')
assert(scenarioPassed(SECURITY_SCENARIOS[0], true) && !scenarioPassed(SECURITY_SCENARIOS[0], false), 'sikkerhed: scenarioPassed-logik')

console.log(`\n${fails === 0 ? '✅ ALLE HARNESS-GENERATOR-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
