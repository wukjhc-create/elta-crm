/**
 * Unit-tests for afregningsform (src/lib/invoices/billing-model.ts, 00232). Ingen DB.
 *   npx tsx scripts/billing-model-test.ts
 */
import { finalInvoicePlanKind, isBillingModel } from '../src/lib/invoices/billing-model'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const a = finalInvoicePlanKind({ billing_model: null, contract_sum: 100000 })
ok(a.kind === 'blocked' && /Vælg afregningsform/.test(a.message), 'kontraktsum uden valg → blokeret (intet gæt)')
ok(finalInvoicePlanKind({ billing_model: 'time_and_materials', contract_sum: 100000 }).kind === 'lines', 'regning med kontraktsum → linjer (ikke restbeløb)')
const f = finalInvoicePlanKind({ billing_model: 'fixed_price', contract_sum: '80000', revised_sum: null })
ok(f.kind === 'contract_remainder' && f.basis === 80000 && f.basisKind === 'contract_sum', 'fast pris → restbeløb af kontraktsum')
const r = finalInvoicePlanKind({ billing_model: 'fixed_price', contract_sum: 80000, revised_sum: 95000 })
ok(r.kind === 'contract_remainder' && r.basis === 95000 && r.basisKind === 'revised_sum', 'revideret beløb vinder')
const n = finalInvoicePlanKind({ billing_model: 'fixed_price', contract_sum: null })
ok(n.kind === 'blocked' && /ingen kontraktsum/.test(n.message), 'fast pris uden kontraktsum → blokeret')
ok(finalInvoicePlanKind({ billing_model: 'mixed' }).kind === 'blocked', 'ukendt værdi → blokeret')
ok(isBillingModel('fixed_price') && !isBillingModel('fixed') && !isBillingModel(null), 'type-guard')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
