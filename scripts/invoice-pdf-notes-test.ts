/**
 * Unit: kundens faktura-PDF indeholder IKKE fakturaens "Intern note" (invoices.notes) (D34).
 * Gennemløber PDF-dokumentets elementtræ. Kør: npx tsx scripts/invoice-pdf-notes-test.ts
 */
import type { ReactElement, ReactNode } from 'react'
import { InvoicePdfDocument } from '../src/lib/pdf/invoice-pdf-template'
import type { InvoicePdfPayload } from '../src/types/invoice.types'
import type { CompanySettings } from '../src/types/company-settings.types'

let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${got} forventet=${want}`}`) }

function collect(node: ReactNode, out: string[]): void {
  if (node == null || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (Array.isArray(node)) { for (const n of node) collect(n, out); return }
  const el = node as ReactElement<{ children?: ReactNode }>
  if (typeof el.type === 'function') { collect((el.type as (p: unknown) => ReactNode)(el.props), out); return }
  if (el.props) collect(el.props.children, out)
}

const payload = {
  invoice: {
    id: 'i1', invoice_number: 'F-1001', status: 'sent', invoice_type: 'standard', currency: 'DKK', created_at: '2026-10-01T10:00:00Z',
    due_date: '2026-10-15', total_amount: 1000, tax_amount: 250, final_amount: 1250, payment_reference: 'F-1001', notes: 'INTERN NOTE: kunden betaler sent',
    is_final_invoice: false, voided_at: null,
  },
  lines: [{ id: 'l1', position: 1, description: 'Installation', quantity: 1, unit: 'stk', unit_price: 1000, total_price: 1000 }],
  customer: { id: 'c1', name: 'Kunde ApS', address: 'Vej 1', zip: '8000', city: 'Aarhus', cvr: null, email: 'k@x.dk' },
  case: null,
  predecessors: [],
} as unknown as InvoicePdfPayload
const cs = { company_name: 'Elta Solar ApS', company_vat_number: '12345678' } as unknown as CompanySettings

const texts: string[] = []
collect(InvoicePdfDocument({ payload, companySettings: cs }) as ReactNode, texts)
const all = texts.join(' | ')
eq('fakturalinjen er med', all.includes('Installation'), true)
eq('fakturanummer er med', all.includes('F-1001'), true)
eq('intern note er IKKE med', all.includes('INTERN NOTE'), false)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle faktura-PDF-note-tests PASS')
process.exitCode = fail ? 1 : 0
