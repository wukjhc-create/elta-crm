/**
 * OF-2 (review 2026-10-17): årsproduktion i solcelleberegneren. Ren logik.
 *   npx tsx scripts/solar-production-test.ts
 */
import { calculateSolarSystem } from '../src/lib/utils/calculator'
import { INVERTER_TYPES } from '../src/types/calculator.types'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const r = calculateSolarSystem({
  panelType: 'standard', panelCount: 10, inverterType: 'string_small', mountingType: 'roof_tile', batteryOption: 'none',
  annualConsumption: 5000, margin: 0.25, discount: 0, includeVat: true,
})
const invEff = (INVERTER_TYPES.find((i) => i.id === 'string_small') as { efficiency: number }).efficiency
// 10 × 400 W = 4 kWp × 1.000 solskinstimer × inverter-virkningsgrad
const expected = Math.round(4 * 1000 * invEff)
ok(Math.abs(r.annualProduction - expected) <= 1, '4 kWp ≈ 4 × 1.000 × inverter-virkningsgrad', `${r.annualProduction} ~ ${expected}`)
ok(r.annualProduction > 3000 && r.annualProduction < 4500, 'realistisk dansk årsproduktion (750–1.125 kWh/kWp)', String(r.annualProduction))

console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
process.exitCode = bad ? 1 : 0
