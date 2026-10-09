/**
 * IC8: hovedbeløb mod linjesum. Kalder den funktion fakturapanelet bruger.
 *   npx tsx scripts/header-totals-test.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { toOre } from '../src/lib/cases/aftercalc'
import { headerLineCheck, headerLineSummary, lineTotalOre } from '../src/lib/invoice-control/header-totals'
import { loadInvoiceControl } from '../src/lib/invoice-control/invoice-control-loader'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`)
}

eq('angivet total vinder over antal × pris', lineTotalOre({ totalPrice: 80, quantity: 1, unitPrice: 100 }).ore, 8000)
eq('0 er et gemt nul, ikke et hul', lineTotalOre({ totalPrice: 0, quantity: null, unitPrice: null }).ore, 0)
eq('antal × pris når total mangler', lineTotalOre({ totalPrice: null, quantity: 2.5, unitPrice: 10 }).ore, 2500)
eq('kun antal er ikke et beløb', lineTotalOre({ totalPrice: null, quantity: 2, unitPrice: null }).ore, null)
eq('0,1 + 0,2 i øre', lineTotalOre({ totalPrice: 0.1, quantity: null, unitPrice: null }).ore! + lineTotalOre({ totalPrice: 0.2, quantity: null, unitPrice: null }).ore!, 30)
for (const sample of [null, '', 0, 0.1, 0.2, 10.005, '100.00', '100,50', -50, '1.234.56'] as const) {
  const viaLine = lineTotalOre({ totalPrice: sample, quantity: null, unitPrice: null }).ore
  eq(`øre-regel som efterkalkulation (${JSON.stringify(sample)})`, viaLine, toOre(sample))
}

const match = headerLineCheck({
  amountExclVat: 100,
  vatAmount: 25,
  amountInclVat: 125,
  lines: [
    { totalPrice: 60, quantity: 1, unitPrice: 60 },
    { totalPrice: 40, quantity: 1, unitPrice: 40 },
  ],
})
eq('100 kr linjer stemmer', match.status, 'match')
eq('forskel 0 når den er kendt', match.differenceOre, 0)
eq('moms stemmer', match.vatStatus, 'match')
eq('match-tekst siger stemmer', headerLineSummary(match).text.includes('stemmer med beløb ekskl. moms'), true)

const drift = headerLineCheck({
  amountExclVat: '100.00',
  vatAmount: 25,
  amountInclVat: 125,
  lines: [
    { totalPrice: '60.00', quantity: 1, unitPrice: 60 },
    { totalPrice: '50.00', quantity: 1, unitPrice: 50 },
  ],
})
eq('10 kr for høj linjesum', drift.status, 'mismatch')
eq('forskel 1000 øre', drift.differenceOre, 1000)
eq('afvigelsestekst nævner beløbene', headerLineSummary(drift).text, 'Linjesummen 110,00 kr afviger fra beløb ekskl. moms 100,00 kr (forskel 10,00 kr).')
const thousand = headerLineCheck({
  amountExclVat: 0,
  vatAmount: 0,
  amountInclVat: 0,
  lines: [{ totalPrice: 1000, quantity: 1, unitPrice: 1000 }],
})
eq('tusindadskiller i forskellen', headerLineSummary(thousand).text.includes('forskel 1.000,00 kr'), true)

const hole = headerLineCheck({
  amountExclVat: 100,
  vatAmount: 25,
  amountInclVat: 125,
  lines: [
    { totalPrice: 100, quantity: 1, unitPrice: 100 },
    { totalPrice: null, quantity: null, unitPrice: null },
  ],
})
eq('manglende linjebeløb er ikke 0', hole.status, 'incomplete')
eq('linjesum er null', hole.lineSumOre, null)
eq('forskel er null', hole.differenceOre, null)
eq('teksten kalder det ikke et match', headerLineSummary(hole).text.includes('stemmer'), false)
eq('teksten siger hullet ikke er 0', headerLineSummary(hole).text.includes('tælles ikke som 0'), true)

const derived = headerLineCheck({
  amountExclVat: 100,
  vatAmount: null,
  amountInclVat: null,
  lines: [{ totalPrice: null, quantity: '2', unitPrice: '50.00' }],
})
eq('afledt linje kan stemme', derived.status, 'match')
eq('én afledt linje', derived.derivedLineCount, 1)
eq('manglende moms er ufuldstændig, ikke en afvigelse', derived.vatStatus, 'incomplete')
eq('momsforskel er null', derived.vatDifferenceOre, null)

const none = headerLineCheck({ amountExclVat: 100, vatAmount: 25, amountInclVat: 125, lines: [] })
eq('ingen linjer er ikke sum 0', none.status, 'no_lines')
eq('ingen linjesum', none.lineSumOre, null)

const noHeader = headerLineCheck({
  amountExclVat: null,
  vatAmount: null,
  amountInclVat: null,
  lines: [{ totalPrice: 80, quantity: 1, unitPrice: 80 }],
})
eq('uden hovedbeløb sammenlignes ikke', noHeader.status, 'no_header')
eq('linjesummen kendes stadig', noHeader.lineSumOre, 8000)
eq('forskel forbliver null', noHeader.differenceOre, null)

const vatOff = headerLineCheck({
  amountExclVat: 100,
  vatAmount: 25,
  amountInclVat: 124,
  lines: [{ totalPrice: 100, quantity: 1, unitPrice: 100 }],
})
eq('linjerne kan stemme mens momsen afviger', vatOff.status, 'match')
eq('moms afviger 1 kr', vatOff.vatDifferenceOre, -100)
eq('teksten nævner momsafvigelsen', headerLineSummary(vatOff).text.includes('stemmer ikke med beløb inkl. moms'), true)

const credit = headerLineCheck({
  amountExclVat: 100,
  vatAmount: 25,
  amountInclVat: 125,
  lines: [
    { totalPrice: 150, quantity: 1, unitPrice: 150 },
    { totalPrice: -50, quantity: 1, unitPrice: -50 },
  ],
})
eq('kreditlinje trækkes fra', credit.status, 'match')
eq('kredit giver linjesum 100 kr', credit.lineSumOre, 10000)

function client(inv: Record<string, unknown>, lines: Record<string, unknown>[]) {
  return {
    from(table: string) {
      const api = {
        select() { return api },
        eq() { return api },
        in() { return api },
        gte() { return api },
        order() { return api },
        maybeSingle: async () => ({ data: table === 'incoming_invoices' ? inv : null }),
        then(res: (v: { data: unknown }) => unknown, rej?: (e: unknown) => unknown) {
          const data = table === 'incoming_invoice_lines' ? lines : []
          return Promise.resolve({ data }).then(res, rej)
        },
      }
      return api
    },
  }
}

void (async () => {
const loaded = await loadInvoiceControl(client(
  { id: 'inv', supplier_id: null, invoice_date: null, amount_excl_vat: '100.00', vat_amount: '25.00', amount_incl_vat: '125.00' },
  [
    { line_number: 1, description: 'A', quantity: 1, unit_price: 100, total_price: null, supplier_product_id: null, raw_line: null },
    { line_number: 2, description: 'B', quantity: null, unit_price: null, total_price: null, supplier_product_id: null, raw_line: null },
  ],
) as never, 'inv')
eq('loader kalder tjekket', loaded?.header.status, 'incomplete')
eq('loader gemmer ikke hullet som 0', loaded?.header.differenceOre, null)
eq('loader bruger den kendte linje men ikke som sum', loaded?.header.missingLineCount, 1)

const src = readFileSync(join(process.cwd(), 'src/lib/invoice-control/invoice-control-loader.ts'), 'utf8')
eq('loader læser hovedbeløb', src.includes('amount_excl_vat, vat_amount, amount_incl_vat'), true)
eq('loader læser linjetotal', src.includes('total_price'), true)
eq('loader kalder headerLineCheck', src.includes('headerLineCheck('), true)
const panel = readFileSync(join(process.cwd(), 'src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx'), 'utf8')
eq('panelet viser sætningen', panel.includes('headerLineSummary(res.header)'), true)
const action = readFileSync(join(process.cwd(), 'src/lib/actions/invoice-control.ts'), 'utf8')
eq('godkendelse og e-conomic røres ikke af kontrollen', action.includes('approveInvoice') || action.includes('economic'), false)

if (bad) {
  console.log(`\n${bad} fejl`)
  process.exit(1)
}
console.log('\n✅ alle header-total-tests bestået')
})()
