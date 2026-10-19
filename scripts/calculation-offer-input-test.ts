/**
 * Unit-test (ingen I/O) for calculationOfferInputError — IV2-6 (2026-10-19).
 *   npx tsx scripts/calculation-offer-input-test.ts
 */
import { calculationOfferInputError } from '../src/lib/offers/calculation-offer-input'

let bad = 0
type In = NonNullable<Parameters<typeof calculationOfferInputError>[0]>
const base = (): In => ({
  title: 'Ny tavle',
  description: null,
  customerId: '11111111-2222-3333-4444-555555555555',
  validUntil: '2026-11-30',
  termsAndConditions: null,
  items: [{ componentName: 'Stikkontakt', quantity: 4, calculatedTimeMinutes: 20, costPrice: 120, salePrice: 350,
    materials: [{ quantity: 1, costPrice: 40, salePrice: 80 }] }],
  result: { salePriceExclVat: 1400, costPrice: 700 },
  settings: { hourlyRate: 650, marginPercentage: 25, discountPercentage: 0 },
})
const check = (label: string, mutate: (q: In) => void, wantValid: boolean) => {
  const q = base()
  mutate(q)
  const err = calculationOfferInputError(q)
  const ok = wantValid ? err === null : err !== null
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${err ? ` → ${err}` : ''}`)
}

check('gyldig kalkulation', () => {}, true)
check('uden resultat (beregnes fra linjer)', (q) => { q.result = null }, true)
check('negativ salgspris (regulering) tilladt', (q) => { q.items![0].salePrice = -100 }, true)
check('tom titel', (q) => { q.title = ' ' }, false)
check('ugyldig kunde', (q) => { q.customerId = 'x' }, false)
check('ingen linjer', (q) => { q.items = [] }, false)
check('antal NaN', (q) => { q.items![0].quantity = NaN }, false)
check('antal negativ', (q) => { q.items![0].quantity = -1 }, false)
check('tid Infinity', (q) => { q.items![0].calculatedTimeMinutes = Infinity }, false)
check('materialekost negativ', (q) => { q.items![0].materials![0].costPrice = -5 }, false)
check('resultat Infinity', (q) => { q.result = { salePriceExclVat: Infinity } }, false)
check('rabat 120 %', (q) => { q.settings!.discountPercentage = 120 }, false)
check('timepris negativ', (q) => { q.settings!.hourlyRate = -650 }, false)
check('ugyldig dato', (q) => { q.validUntil = 'i morgen' }, false)
if (calculationOfferInputError(null) === null) bad++

console.log(`\n${bad === 0 ? '✅ ALLE KALKULATIONS-INPUT-TESTS PASS' : `❌ ${bad} FEJL`}`)
process.exit(bad === 0 ? 0 : 1)
