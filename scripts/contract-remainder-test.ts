/**
 * Unit-tests for slutfaktura på fastprissag (src/lib/invoices/contract-remainder.ts). Ingen DB.
 *   npx tsx scripts/contract-remainder-test.ts
 */
import { contractBasis, planContractRemainder, type PriorInvoiceInput } from '../src/lib/invoices/contract-remainder'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const inv = (n: string, type: string, total: number | string, credited = 0, status = 'sent'): PriorInvoiceInput => ({ id: n, invoice_number: n, invoice_type: type, status, total_amount: total, credited })

// Henriks eksempel: 100.000 kontrakt, 30 % forskud → slutfaktura 70.000 (ikke 16.000 af timer/materialer)
const a = planContractRemainder(100000, [inv('F-1', 'deposit', 30000)])
ok(a.ok && a.remainder === 70000 && a.deducted === 30000, 'forskud: rest = kontrakt − forskud', JSON.stringify(a))

// del-faktura (standard) + rate tæller med; udstedt kreditnota trækkes fra fradraget
const b = planContractRemainder(100000, [inv('F-1', 'deposit', 30000), inv('F-2', 'progress', 20000, 5000), inv('F-3', 'standard', 10000, 0, 'paid')])
ok(b.ok && b.deducted === 55000 && b.remainder === 45000, 'rate med kreditnota + betalt del-faktura', JSON.stringify(b))

// fuldt krediteret forskud → intet fradrag
const c = planContractRemainder(50000, [inv('F-1', 'deposit', 20000, 20000)])
ok(c.ok && c.deducted === 0 && c.remainder === 50000 && c.deductions.length === 0, 'fuldt krediteret forskud giver ikke fradrag')

// kreditnota og tidligere slutfaktura tæller ikke som fradrag her
const d = planContractRemainder(10000, [inv('K-1', 'credit', -500), inv('F-9', 'final', 999)])
ok(d.ok && d.deducted === 0, 'kreditnota/slutfaktura ignoreres som forgængere')

// kladde blokerer
const e = planContractRemainder(100000, [inv('F-1', 'deposit', 30000, 0, 'draft')])
ok(!e.ok && e.code === 'draft_prior' && /F-1/.test(e.message), 'kladde-forgænger blokerer')
const e2 = planContractRemainder(100000, [inv('F-1', 'deposit', 30000)], true)
ok(!e2.ok && e2.code === 'draft_prior', 'kreditnota-kladde blokerer')

// allerede fuldt faktureret
const f = planContractRemainder(40000, [inv('F-1', 'deposit', 10000), inv('F-2', 'progress', 30000)])
ok(!f.ok && f.code === 'fully_invoiced' && f.remainder === 0, 'fuldt faktureret blokerer')

// negativ rest = overfakturering
const g = planContractRemainder(40000, [inv('F-1', 'standard', 46000)])
ok(!g.ok && g.code === 'overbilled' && g.remainder === -6000 && /6\.000,00/.test(g.message), 'overfakturering blokerer med beløb', g.ok ? '' : g.message)

// afrunding: 3 × 33.333,33 af 100.000 → 0,01 tilbage
const h = planContractRemainder(100000, [inv('A', 'progress', 33333.33), inv('B', 'progress', 33333.33), inv('C', 'progress', 33333.33)])
ok(h.ok && h.remainder === 0.01 && h.deducted === 99999.99, 'øre-afrunding', JSON.stringify({ r: h.remainder, d: h.deducted }))
const h2 = planContractRemainder(0.3, [inv('A', 'progress', 0.1), inv('B', 'progress', 0.2)])
ok(!h2.ok && h2.code === 'fully_invoiced', 'flydende tal (0,1 + 0,2 = 0,3) giver præcis 0')

// basis
ok(contractBasis({ contract_sum: 100000, revised_sum: 120000 }) === 120000, 'revideret beløb vinder')
ok(contractBasis({ contract_sum: '80000.5', revised_sum: null }) === 80000.5, 'kontraktsum (tekst fra PostgREST)')
ok(contractBasis({ contract_sum: 0, revised_sum: null }) === null && contractBasis({}) === null, 'ingen/0 = ikke kontraktsag')
const n = planContractRemainder(null, [])
ok(!n.ok && n.code === 'no_basis', 'uden kontraktsum → no_basis')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
