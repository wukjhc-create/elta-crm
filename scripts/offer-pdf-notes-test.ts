/**
 * Unit: kundens tilbuds-PDF indeholder IKKE "Interne noter" (offers.notes) eller linjenoter (D33).
 * Gennemløber PDF-dokumentets elementtræ (ingen rendering nødvendig). Kør: npx tsx scripts/offer-pdf-notes-test.ts
 */
import type { ReactElement, ReactNode } from 'react'
import { OfferPdfDocument } from '../src/lib/pdf/offer-pdf-template'
import type { OfferWithRelations } from '../src/types/offers.types'
import type { CompanySettings } from '../src/types/company-settings.types'

let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${got} forventet=${want}`}`) }

function collect(node: ReactNode, out: string[]): void {
  if (node == null || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (Array.isArray(node)) { for (const n of node) collect(n, out); return }
  const el = node as ReactElement<{ children?: ReactNode }>
  if (typeof el.type === 'function') {
    // funktionskomponenter (fx sektioner) udfoldes
    collect((el.type as (p: unknown) => ReactNode)(el.props), out)
    return
  }
  if (el.props) collect(el.props.children, out)
}

const offer = {
  id: 'o1', offer_number: 'T-1', title: 'Solcelleanlæg', description: 'Beskrivelse', status: 'sent', currency: 'DKK',
  total_amount: 1000, discount_percentage: 0, discount_amount: 0, tax_percentage: 25, tax_amount: 250, final_amount: 1250,
  valid_until: '2026-12-01', terms_and_conditions: 'Betingelser', created_at: '2026-10-01T10:00:00Z',
  scope: 'KUNDEVENDT OMFANG', notes: 'INTERN NOTE: aftalt rabat 10 %',
  customer: { id: 'c1', company_name: 'Kunde ApS', contact_person: 'K', email: 'k@x.dk' },
  line_items: [{ id: 'l1', position: 1, description: 'Panel', quantity: 1, unit: 'stk', unit_price: 1000, total: 1000, notes: 'INTERN LINJENOTE: lav kost', line_type: 'manual' }],
} as unknown as OfferWithRelations
const cs = { company_name: 'Elta Solar ApS', company_vat_number: '12345678' } as unknown as CompanySettings

const texts: string[] = []
collect(OfferPdfDocument({ offer, companySettings: cs }) as ReactNode, texts)
const all = texts.join(' | ')
eq('linjens beskrivelse er med', all.includes('Panel'), true)
eq('kundevendt omfang (scope) er med', all.includes('KUNDEVENDT OMFANG'), true)
eq('interne noter er IKKE med', all.includes('INTERN NOTE'), false)
eq('linjens interne note er IKKE med', all.includes('INTERN LINJENOTE'), false)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle tilbuds-PDF-note-tests PASS')
process.exitCode = fail ? 1 : 0
