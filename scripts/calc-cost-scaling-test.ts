/**
 * OF-5 (review 2026-10-17): tilbud fra kalkulation — linjekost skaleres til kalkulationens samlede kostpris. Ren logik.
 *   npx tsx scripts/calc-cost-scaling-test.ts
 */
import { scaleLineCostsToTotal } from '../src/lib/offers/calc-cost-scaling'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const sum = (ls: Array<{ cost_price: number | null; quantity: number | null }>) => Math.round(ls.reduce((s, l) => s + Number(l.cost_price ?? 0) * Number(l.quantity || 0), 0) * 100) / 100

// 10 × 60 min à 495 kr = 4.950 kr på linjerne; kalkulationen viste 7.115,63 (mester + tillæg)
const lines = [{ cost_price: 495, quantity: 10 }]
const rest = scaleLineCostsToTotal(lines, 7115.63)
ok(rest === 0 && Math.abs(sum(lines) - 7115.63) < 0.1, 'linjekost skaleret til kalkulationens kostpris', String(sum(lines)))

const two = [{ cost_price: 100, quantity: 2 }, { cost_price: 50, quantity: 4 }] // 400
scaleLineCostsToTotal(two, 600)
ok(Math.abs(sum(two) - 600) < 0.1 && two[0].cost_price === 150 && two[1].cost_price === 75, 'forholdet mellem linjer bevares', JSON.stringify(two))

const none = [{ cost_price: 0, quantity: 3 }]
ok(scaleLineCostsToTotal(none, 1000) === 1000, 'ingen linjekost → hele kostprisen som rest (reguleringslinje)')
const same = [{ cost_price: 100, quantity: 1 }]
ok(scaleLineCostsToTotal(same, 100) === 0 && same[0].cost_price === 100, 'samme kost → uændret')
ok(scaleLineCostsToTotal([{ cost_price: 100, quantity: 1 }], null) === 0, 'ingen kalkulationskost → intet ændret')

console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
process.exitCode = bad ? 1 : 0
