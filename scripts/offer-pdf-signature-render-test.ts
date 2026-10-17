/**
 * ES-3 (e-sign-review 2026-10-17): accepteret tilbuds-PDF med underskriftsblok renderes uden fejl (react-pdf + PNG-data-URL).
 *   npx tsx scripts/offer-pdf-signature-render-test.ts
 */
import type { ReactElement, JSXElementConstructor } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferPdfDocument } from '../src/lib/pdf/offer-pdf-template'
import type { OfferWithRelations } from '../src/types/offers.types'
import type { CompanySettings } from '../src/types/company-settings.types'

const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

async function main() {
  const offer = {
    id: 'o1', offer_number: 'T-1', title: 'Solcelleanlæg', status: 'accepted', currency: 'DKK',
    total_amount: 1000, discount_percentage: 0, discount_amount: 0, tax_percentage: 25, tax_amount: 250, final_amount: 1250,
    valid_until: '2026-12-01', terms_and_conditions: 'Betingelser', created_at: '2026-10-01T10:00:00Z',
    customer: { id: 'c1', company_name: 'Kunde ApS', contact_person: 'K', email: 'k@x.dk' },
    line_items: [{ id: 'l1', position: 1, description: 'Panel', quantity: 1, unit: 'stk', unit_price: 1000, total: 1000, line_type: 'manual' }],
  } as unknown as OfferWithRelations
  const cs = { company_name: 'Elta Solar ApS', company_vat_number: '12345678' } as unknown as CompanySettings
  const doc = OfferPdfDocument({ offer, companySettings: cs, signature: { signer_name: 'Kim Kunde', signer_email: 'kim@x.dk', signed_at: '2026-10-17T08:30:00Z', signature_data: PNG_1x1, signer_ip: '203.0.113.7' } })
  const buf = await renderToBuffer(doc as ReactElement<DocumentProps, string | JSXElementConstructor<DocumentProps>>)
  const ok = buf.length > 1000 && buf.subarray(0, 4).toString() === '%PDF'
  console.log(`${ok ? 'PASS' : 'FAIL'}  PDF med underskriftsblok renderet (${buf.length} bytes)`)
  console.log(ok ? '✅ alle bestået' : '❌ fejl')
  process.exitCode = ok ? 0 : 1
}
main().catch((e) => { console.error('FAIL', e); process.exitCode = 1 })
