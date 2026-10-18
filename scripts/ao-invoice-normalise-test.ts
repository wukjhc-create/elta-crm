/**
 * Unit-test (ingen DB) for AO-adapterens normalisering — IV-6: kreditnotaer får negativt fortegn.
 *   npx tsx scripts/ao-invoice-normalise-test.ts
 */
import { normaliseAoInvoice } from '../src/lib/services/incoming-invoice-adapters/ao-api-client'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }

const base = {
  invoiceNumber: 'AO-1', amountExclVat: 800, vatAmount: 200, amountInclVat: 1000,
  lines: [{ description: 'Kabel', quantity: 10, unitPrice: 8, totalPrice: 80 }, { description: 'Uden total', quantity: 2, unitPrice: 5 }],
}

const inv = normaliseAoInvoice(base)!
ok(inv.amountInclVat === 1000 && inv.amountExclVat === 800 && inv.vatAmount === 200, 'almindelig faktura: positive beløb uændret')
ok(inv.lines[0].totalPrice === 80 && inv.lines[1].unitPrice === 5, 'almindelig faktura: linjer uændret')

const cn = normaliseAoInvoice({ ...base, documentType: 'CreditNote' })!
ok(cn.amountInclVat === -1000 && cn.amountExclVat === -800 && cn.vatAmount === -200, 'kreditnota (documentType): header negativ', `inkl=${cn.amountInclVat}`)
ok(cn.lines[0].totalPrice === -80 && cn.lines[0].unitPrice === 8, 'kreditnota: linjetotal negativ (stk-pris uændret)')
ok(cn.lines[1].unitPrice === -5 && cn.lines[1].quantity === 2, 'kreditnota uden total: stk-prisen bærer fortegnet')

const already = normaliseAoInvoice({ ...base, invoiceType: 'Kreditnota', amountInclVat: -1000, amountExclVat: -800, vatAmount: -200 })!
ok(already.amountInclVat === -1000, 'allerede negative beløb negeres ikke igen')

ok(normaliseAoInvoice({ ...base, isCreditNote: true })!.amountInclVat === -1000, 'isCreditNote-flag virker')
ok(normaliseAoInvoice({ ...base, type: 'Invoice' })!.amountInclVat === 1000, 'type=Invoice er ikke kredit')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ AO-normalisering ok')
process.exitCode = bad ? 1 : 0
