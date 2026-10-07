/**
 * Unit-tests for netto faktureret pr. sag (src/lib/invoices/net-invoiced.ts). Ingen DB.
 *   npx tsx scripts/net-invoiced-test.ts
 */
import { netInvoicedExVat, summarizeCaseInvoices } from '../src/lib/invoices/net-invoiced'

let bad = 0
const eq = (label: string, got: number, want: number) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${got} forventet=${want}`}`) }
const inv = (total: number, status = 'sent', type: string | null = 'standard', voided: string | null = null) => ({ total_amount: total, status, invoice_type: type, voided_at: voided })
const full = (total: number, opts: { status?: string; type?: string; voided?: string | null; paid?: number } = {}) => ({
  total_amount: total, final_amount: total * 1.25, amount_paid: opts.paid ?? 0, status: opts.status ?? 'sent', invoice_type: opts.type ?? 'standard', voided_at: opts.voided ?? null,
})

// review-eksemplet: 60k udstedt, kreditnota 60k (gemt positiv), ny faktura 40k → 40k (før: 160k)
eq('kreditnota gemt som plus trækkes fra', netInvoicedExVat([inv(60000), inv(60000, 'sent', 'credit'), inv(40000, 'paid')]), 40000)
eq('kreditnota gemt som minus trækkes fra', netInvoicedExVat([inv(60000), inv(-60000, 'sent', 'credit'), inv(40000)]), 40000)
eq('kladder tæller ikke', netInvoicedExVat([inv(10000, 'draft'), inv(5000)]), 5000)
// X1: en FULDT krediteret original får voided_at — før blev den sprunget over, mens kreditnotaen stadig blev trukket fra
eq('fuldt krediteret (voided) original + kreditnota + ny faktura → 40k (før −20k)', netInvoicedExVat([inv(60000, 'sent', 'standard', '2026-10-01'), inv(60000, 'sent', 'credit'), inv(40000)]), 40000)
eq('fuldt krediteret og intet nyt → 0', netInvoicedExVat([inv(60000, 'paid', 'standard', '2026-10-01'), inv(-60000, 'sent', 'credit')]), 0)
eq('kreditnota-kladde tæller ikke', netInvoicedExVat([inv(10000), inv(10000, 'draft', 'credit')]), 10000)
// X1: negativ slutfaktura (forudbetalinger 80k > faktiske linjer) beholder fortegn → 60k (før 100k)
eq('negativ slutfaktura trækker fra', netInvoicedExVat([inv(40000), inv(40000), inv(-20000)]), 60000)
eq('tekst-beløb og null', netInvoicedExVat([{ total_amount: '1234.5', status: 'paid', invoice_type: null, voided_at: null }, { total_amount: null, status: 'sent', invoice_type: null, voided_at: null }]), 1234.5)
eq('tom liste', netInvoicedExVat([]), 0)

// summarizeCaseInvoices: inkl. moms, betalt, udestående
const s1 = summarizeCaseInvoices([full(100000, { paid: 50000 })])
eq('udestående = netto inkl. moms − betalt', s1.outstandingInclVat, 75000)
const s2 = summarizeCaseInvoices([full(100000, { status: 'paid', paid: 0 })])
eq('manuelt markeret betalt (amount_paid 0) → ikke udestående', s2.outstandingInclVat, 0)
eq('  … og betalt = fakturabeløb inkl. moms', s2.paidInclVat, 125000)
const s3 = summarizeCaseInvoices([full(100000, { voided: '2026-10-01', paid: 125000 }), full(100000, { type: 'credit' })])
eq('fuldt krediteret betalt faktura → netto 0, udestående 0', s3.netInclVat + s3.outstandingInclVat, 0)
eq('  … annulleret tælles som info', s3.voidedCount, 1)
const s4 = summarizeCaseInvoices([full(100000), full(20000, { type: 'credit' })])
eq('delkreditering trækker fra udestående', s4.outstandingInclVat, 100000)
eq('  … netto ekskl. moms', s4.netExVat, 80000)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle netto-faktureret-tests bestået')
process.exitCode = bad ? 1 : 0
