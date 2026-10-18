/**
 * Unit-test (ingen DB) for leverandørfaktura-parseren (leverandørfaktura-review 2026-10-14 #1/#2).
 *   npx tsx scripts/invoice-parser-test.ts
 */
import { parseSupplierInvoiceText } from '../src/lib/services/incoming-invoice-parser'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const amounts = (t: string) => { const p = parseSupplierInvoiceText(t); return `ekskl=${p.amountExclVat} moms=${p.vatAmount} inkl=${p.amountInclVat} kredit=${p.isCreditNote} konsistent=${p.amountsConsistent}` }

const a = parseSupplierInvoiceText('AO Danmark A/S\nFaktura nr 123456\nMomsgrundlag 1.000,00\nMoms 25% 250,00\nI alt 1.250,00')
ok(a.amountExclVat === 1000 && a.vatAmount === 250 && a.amountInclVat === 1250, '"Momsgrundlag" er ikke moms', amounts('AO\nMomsgrundlag 1.000,00\nMoms 25% 250,00\nI alt 1.250,00'))
const b = parseSupplierInvoiceText('Firma ApS\nSubtotal 1.000,00\nMoms 250,00\nTotal 1.250,00')
ok(b.amountInclVat === 1250 && b.amountExclVat === 1000, '"Subtotal" er ikke total', `inkl=${b.amountInclVat} ekskl=${b.amountExclVat}`)
const c = parseSupplierInvoiceText('Firma ApS\nKreditnota nr 9876\nSubtotal 1.000,00\nMoms 250,00\nI alt -1.250,00')
ok(c.isCreditNote && c.amountInclVat === -1250 && c.amountExclVat === -1000 && c.vatAmount === -250, 'kreditnota → negative beløb', `inkl=${c.amountInclVat} ekskl=${c.amountExclVat} moms=${c.vatAmount}`)
const d = parseSupplierInvoiceText('Firma ApS\nFaktura 1\nBeløb i alt 1.250,00-')
ok(d.isCreditNote && d.amountInclVat === -1250, 'efterstillet minus = kredit', `inkl=${d.amountInclVat}`)
const e = parseSupplierInvoiceText('Firma ApS\nSubtotal 1.000,00\nMoms 250,00\nI alt 1.300,00')
ok(e.amountsConsistent === false, 'ekskl + moms ≠ inkl → inkonsistent', `${e.amountsConsistent}`)
ok(a.amountsConsistent === true, 'konsistente beløb markeres ok')
const f = parseSupplierInvoiceText('Firma ApS\nCVR-nr. 12345678\nVAT no DK12345678\nSubtotal 800,00\nMoms\n200,00\nTotal\n1.000,00')
ok(f.vatAmount === 200 && f.amountInclVat === 1000, 'beløb på linjen under etiketten; "VAT no" er ikke moms', `moms=${f.vatAmount} inkl=${f.amountInclVat}`)
const g = parseSupplierInvoiceText('Firma ApS\nLinje 1 I alt 500,00\nLinje 2 I alt 500,00\nSubtotal 1.000,00\nMoms 250,00\nI alt 1.250,00')
ok(g.amountInclVat === 1250, 'sidste "I alt" er fakturaens total (ikke linjens)', `inkl=${g.amountInclVat}`)
const h = parseSupplierInvoiceText('Firma ApS\nTotal inkl. moms 1.250,00\nHeraf moms 250,00')
ok(h.amountInclVat === 1250 && h.vatAmount === 250 && h.amountExclVat === 1000, '"inkl. moms" er ikke momsbeløbet; ekskl. udledes', `inkl=${h.amountInclVat} moms=${h.vatAmount} ekskl=${h.amountExclVat}`)
ok(!parseSupplierInvoiceText('Firma ApS\nI alt 1.250,00').isCreditNote, 'almindelig faktura er ikke kredit')

// IV-1 (2026-10-18): label-ord bliver ikke fakturanummer
const lbl = parseSupplierInvoiceText('Firma ApS\nFakturanr.  Fakturadato  Forfald\n123456 05.10.2026 19.10.2026\nI alt 1.250,00')
ok(lbl.invoiceNumber !== 'Fakturadato', 'etiketrække: "Fakturadato" er ikke et fakturanummer', String(lbl.invoiceNumber))
const kn = parseSupplierInvoiceText('Firma ApS\nFakturanummer:\nKundenummer: 4711\nI alt 1.250,00')
ok(kn.invoiceNumber !== 'Kundenummer', '"Kundenummer" er ikke et fakturanummer', String(kn.invoiceNumber))
ok(parseSupplierInvoiceText('Firma ApS\nFaktura nr 123456\nI alt 100,00').invoiceNumber === '123456', 'normalt fakturanummer læses stadig')
ok(parseSupplierInvoiceText('Firma ApS\nInvoice no: INV-2026-001\nTotal 100,00').invoiceNumber === 'INV-2026-001', 'bogstav+tal-nummer læses stadig')
// IV-2: ugyldig kalenderdato → null (ellers fejlede hele parse-opdateringen)
ok(parseSupplierInvoiceText('Firma ApS\nFakturadato 10/31/2026\nI alt 100,00').invoiceDate === null, 'mm/dd-dato (31. måned) afvises')
ok(parseSupplierInvoiceText('Firma ApS\nFakturadato 31.02.2026\nI alt 100,00').invoiceDate === null, '31. februar afvises')
ok(parseSupplierInvoiceText('Firma ApS\nFakturadato 05.10.2026\nI alt 100,00').invoiceDate === '2026-10-05', 'gyldig dato læses stadig')
// IV-9: navne er ikke arbejdsordre-hints
ok(!parseSupplierInvoiceText('Firma ApS\nVores ref: Henrik\nI alt 100,00').workOrderHints.includes('Henrik'), '"Vores ref: Henrik" er ikke et hint')
ok(parseSupplierInvoiceText('Firma ApS\nSag: S-1042\nI alt 100,00').workOrderHints.includes('S-1042'), 'sagsnummer er stadig et hint')
// IV-12: minus på næste linje gør ikke fakturaen til kreditnota
const bullet = parseSupplierInvoiceText('Firma ApS\nI alt 1.250,00\n- Varerne forbliver vores ejendom')
ok(!bullet.isCreditNote && (bullet.amountInclVat ?? 0) > 0, 'punktopstilling efter beløbet er ikke fortegn', amounts('Firma ApS\nI alt 1.250,00\n- Varerne forbliver vores ejendom'))
ok(parseSupplierInvoiceText('Firma ApS\nKreditnota\nI alt 1.250,00-').isCreditNote, 'efterstillet minus på samme linje virker stadig')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ fakturaparser ok')
process.exitCode = bad ? 1 : 0
