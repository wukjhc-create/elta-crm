/**
 * Unit-tests for N26a (src/lib/cases/offer-budget.ts). Ingen DB.
 *   npx tsx scripts/offer-budget-test.ts
 */
import { deriveCaseBudgetFromOffer, offerBudgetNote } from '../src/lib/cases/offer-budget'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const a = deriveCaseBudgetFromOffer([
  { quantity: 8, unit: 'timer', cost_price: 400 },
  { quantity: 10, unit: 'm', cost_price: 12.5 },
  { quantity: 1, unit: 'stk', cost_price: null, supplier_cost_price_at_creation: 900 },
  { quantity: 2, unit: 't', cost_price: null },
])
ok(a.plannedHours === 10, 'timer fra t/timer-linjer', String(a.plannedHours))
ok(a.budget === 3200 + 125 + 900, 'budget = kendt kost (inkl. leverandørkost)', String(a.budget))
ok(a.linesWithoutCost === 1, 'linjer uden kost tælles')
ok((offerBudgetNote(a) ?? '').includes('1 tilbudslinje(r) uden kostpris'), 'note advarer om ufuldstændigt budget', offerBudgetNote(a) ?? '')

const b = deriveCaseBudgetFromOffer([{ quantity: 1, unit: 'stk', cost_price: 0 }])
ok(b.plannedHours === null && b.budget === null && offerBudgetNote(b) === null, 'ingen timer/kost → null og ingen note')

const c = deriveCaseBudgetFromOffer([{ quantity: '1.5', unit: 'time', cost_price: '400' }])
ok(c.plannedHours === 1.5 && c.budget === 600, 'numeric som streng fra PostgREST', `${c.plannedHours}/${c.budget}`)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle tilbudsbudget-tests bestået')
process.exitCode = bad ? 1 : 0
