/**
 * Unit-test (ingen I/O) for validateQuoteInput — IV2-2 (2026-10-19): sendQuoteAction stolede på klientens tal/tekster.
 *   npx tsx scripts/quote-input-validation-test.ts
 */
import { validateQuoteInput } from '../src/lib/quotes/validate-quote-input'
import type { GenerateQuoteInput } from '../src/types/quote-templates.types'

let bad = 0
const base = (): GenerateQuoteInput => ({
  templateType: 'installation',
  customer: { companyName: 'Test ApS', contactPerson: 'Test', email: 'kunde@example.dk' },
  title: 'Montage af lader',
  lineItems: [
    { id: 'a', description: 'Lader', quantity: 1, unit: 'stk', unitPrice: 8000 },
    { id: 'b', description: '', quantity: 1, unit: 'stk', unitPrice: 0 },
  ],
  validityDays: 30,
  taxPercentage: 25,
  discountPercentage: 0,
  senderName: 'Henrik',
})
const check = (label: string, mutate: (q: GenerateQuoteInput) => void, wantValid: boolean) => {
  const q = base()
  mutate(q)
  const err = validateQuoteInput(q)
  const ok = wantValid ? err === null : err !== null
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${err ? ` → ${err}` : ''}`)
}

check('gyldigt tilbud (inkl. tom ekstralinje)', () => {}, true)
check('salgsskabelon med anlægsdata', (q) => { q.templateType = 'sales'; q.solarData = { systemSizeKwp: 10, estimatedAnnualProductionKwh: 9500 } }, true)
check('rabatlinje med negativ pris, total > 0', (q) => { q.lineItems.push({ id: 'c', description: 'Rabat', quantity: 1, unit: 'stk', unitPrice: -500 }) }, true)
check('ukendt skabelon', (q) => { (q as unknown as { templateType: string }).templateType = 'evil' }, false)
check('mangler email', (q) => { q.customer.email = '' }, false)
check('email med header-tegn', (q) => { q.customer.email = 'a@b.dk,c@d.dk' }, false)
check('ugyldigt kunde-id', (q) => { q.customerId = "1' or 1=1" }, false)
check('tom titel', (q) => { q.title = '  ' }, false)
check('titel 301 tegn', (q) => { q.title = 'x'.repeat(301) }, false)
check('noter 10.001 tegn', (q) => { q.notes = 'x'.repeat(10_001) }, false)
check('ingen linjer', (q) => { q.lineItems = [] }, false)
check('501 linjer', (q) => { q.lineItems = Array.from({ length: 501 }, (_, i) => ({ id: String(i), description: 'x', quantity: 1, unit: 'stk', unitPrice: 1 })) }, false)
check('antal Infinity', (q) => { q.lineItems[0].quantity = Infinity }, false)
check('pris NaN', (q) => { q.lineItems[0].unitPrice = NaN }, false)
check('pris som tekst', (q) => { (q.lineItems[0] as unknown as { unitPrice: string }).unitPrice = '8000' }, false)
check('pris over loft', (q) => { q.lineItems[0].unitPrice = 1e9 }, false)
check('kostpris Infinity', (q) => { q.lineItems[0].costPrice = Infinity }, false)
check('total 0', (q) => { q.lineItems[0].unitPrice = 0 }, false)
check('total negativ', (q) => { q.lineItems[0].unitPrice = -10 }, false)
check('gyldighed 0 dage', (q) => { q.validityDays = 0 }, false)
check('gyldighed 1,5 dage', (q) => { q.validityDays = 1.5 }, false)
check('gyldighed 366 dage', (q) => { q.validityDays = 366 }, false)
check('moms -5 %', (q) => { q.taxPercentage = -5 }, false)
check('moms 0 % (fri sats er BESLUTNING — tilladt her)', (q) => { q.taxPercentage = 0 }, true)
check('rabat 150 %', (q) => { q.discountPercentage = 150 }, false)
check('anlægsdata negativ', (q) => { q.solarData = { systemSizeKwp: -1, estimatedAnnualProductionKwh: 1 } }, false)
check('afsendernavn mangler', (q) => { q.senderName = '' }, false)
const nullErr = validateQuoteInput(null)
if (!nullErr) bad++
console.log(`${nullErr ? 'PASS' : 'FAIL'}  null-input afvises`)

console.log(`\n${bad === 0 ? '✅ ALLE QUOTE-VALIDERINGS-TESTS PASS' : `❌ ${bad} FEJL`}`)
process.exit(bad === 0 ? 0 : 1)
