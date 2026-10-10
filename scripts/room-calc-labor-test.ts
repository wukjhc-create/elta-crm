/**
 * Unit-test (ingen DB) for rumberegnerens arbejdsmodel (Henrik 2026-10-10): "Timepris" er SALGSPRIS — arbejdet sælges til
 * timer × timepris uden overhead/risiko/avance; kost til DB = timer × kostsats. Overhead/risiko/avance kun på
 * materialer + øvrige omkostninger.
 *   npx tsx scripts/room-calc-labor-test.ts
 */
import { CalculationIntelligenceEngine } from '../src/lib/services/calculation-intelligence'
import { FALLBACK_COST_RATE } from '../src/lib/services/rates'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const near = (a: number, b: number) => Math.abs(a - b) < 0.02

const engine = new CalculationIntelligenceEngine([], [], [], 495)
const e = engine.calculateProject({ rooms: [], hourly_rate: 495, overhead_percentage: 12, risk_percentage: 3, margin_percentage: 25, discount_percentage: 0, vat_percentage: 25 })

const hours = e.total_labor_hours
const markupBasis = e.total_material_cost + e.total_other_costs
const expectedSale = hours * 495 + markupBasis * 1.15 * 1.25
ok(hours > 0, 'tavle-basistid giver arbejdstimer', `${hours} t`)
ok(near(e.total_labor_sale, hours * 495), 'arbejde (salg) = timer × timepris', `${e.total_labor_sale}`)
ok(near(e.total_labor_cost, hours * FALLBACK_COST_RATE), 'arbejde (kost) = timer × kostsats', `${e.total_labor_cost}`)
ok(near(e.sale_price_excl_vat, expectedSale), 'salgspris = arbejde til timepris + (materialer+øvrige) × overhead/risiko × avance', `${e.sale_price_excl_vat} vs ${expectedSale.toFixed(2)}`)
ok(near(e.overhead_amount, markupBasis * 0.12), 'overhead kun på materialer + øvrige', `${e.overhead_amount}`)
ok(near(e.cost_price, e.total_material_cost + e.total_labor_cost + e.total_other_costs), 'kostpris = materialer + arbejdskost + øvrige')
const perHourSale = e.total_labor_sale / hours
ok(near(perHourSale, 495), 'arbejdet sælges til præcis timeprisen (ikke ≈712)', `${perHourSale.toFixed(2)} kr/t`)

const e2 = engine.calculateProject({ rooms: [], hourly_rate: 495, labor_cost_rate: 350 })
ok(near(e2.total_labor_cost, e2.total_labor_hours * 350), 'eksplicit kostsats bruges', `${e2.total_labor_cost}`)

// Profit-simulatoren: samme model
const sim = CalculationIntelligenceEngine.simulateProfit({ cost_price: 0, hourly_rate: 495, total_hours: 10, material_cost: 1000, overhead_percentage: 12, risk_percentage: 3, margin_percentage: 25, discount_percentage: 0, vat_percentage: 25 })
const std = sim.scenarios.find((x) => x.name === 'Standard margin')!
ok(near(std.sale_price_excl_vat, 1000 * 1.15 * 1.25 + 4950), 'profit-simulator: arbejde til timepris + materialer med avance', `${std.sale_price_excl_vat}`)
ok(near(sim.labor_cost, 10 * FALLBACK_COST_RATE), 'profit-simulator: arbejdskost = timer × kostsats', `${sim.labor_cost}`)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ rumberegner-arbejdsmodel ok')
process.exitCode = bad ? 1 : 0
