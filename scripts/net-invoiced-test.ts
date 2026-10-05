/**
 * Unit-tests for netto faktureret pr. sag (src/lib/invoices/net-invoiced.ts). Ingen DB.
 *   npx tsx scripts/net-invoiced-test.ts
 */
import { netInvoicedExVat } from '../src/lib/invoices/net-invoiced'

let bad = 0
const eq = (label: string, got: number, want: number) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${got} forventet=${want}`}`) }
const inv = (total: number, status = 'sent', type: string | null = 'standard', voided: string | null = null) => ({ total_amount: total, status, invoice_type: type, voided_at: voided })

// review-eksemplet: 60k udstedt, kreditnota 60k (gemt positiv), ny faktura 40k → 40k (før: 160k)
eq('kreditnota gemt som plus trækkes fra', netInvoicedExVat([inv(60000), inv(60000, 'sent', 'credit'), inv(40000, 'paid')]), 40000)
eq('kreditnota gemt som minus trækkes fra', netInvoicedExVat([inv(60000), inv(-60000, 'sent', 'credit'), inv(40000)]), 40000)
eq('kladder tæller ikke', netInvoicedExVat([inv(10000, 'draft'), inv(5000)]), 5000)
eq('annullerede tæller ikke', netInvoicedExVat([inv(10000, 'sent', 'standard', '2026-10-01'), inv(5000)]), 5000)
eq('kreditnota-kladde tæller ikke', netInvoicedExVat([inv(10000), inv(10000, 'draft', 'credit')]), 10000)
eq('tekst-beløb og null', netInvoicedExVat([{ total_amount: '1234.5', status: 'paid', invoice_type: null, voided_at: null }, { total_amount: null, status: 'sent', invoice_type: null, voided_at: null }]), 1234.5)
eq('tom liste', netInvoicedExVat([]), 0)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle netto-faktureret-tests bestået')
process.exitCode = bad ? 1 : 0
