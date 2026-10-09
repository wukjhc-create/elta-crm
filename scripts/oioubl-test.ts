/**
 * OIOUBL-parseren. Kalder parseOioubl, som parseAndMatch bruger, og linjesum-tjekket.
 *   npx tsx scripts/oioubl-test.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { headerLineCheck } from '../src/lib/invoice-control/header-totals'
import { oioublLineRows, parseOioubl } from '../src/lib/invoice-control/oioubl'
import { parseSupplierInvoiceText } from '../src/lib/services/incoming-invoice-parser'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`)
}

const xml = `<?xml version="1.0"?>
<cbc:ID>FORKERT</cbc:ID>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FA-100</cbc:ID>
  <cbc:IssueDate>2026-10-04</cbc:IssueDate>
  <cbc:DueDate>2026-11-01</cbc:DueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:OrderReference><cbc:ID>SAG-42</cbc:ID></cac:OrderReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID>IKKE-CVR</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>Lemvigh &amp; Co</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>12345678</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:PaymentMeans>
    <cbc:PaymentID>+71&lt;000000000000001&gt;</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>DK5000400440116243</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">25.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">125.00</cbc:TaxInclusiveAmount>
  </cac:LegalMonetaryTotal>
  <!-- <cac:InvoiceLine><cbc:ID>9</cbc:ID><cbc:LineExtensionAmount>999.00</cbc:LineExtensionAmount></cac:InvoiceLine> -->
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>Kabel 3G1,5</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>LM-55</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="EA">2</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`

eq('almindelig fakturatekst er ikke OIOUBL', parseOioubl('Faktura 100\nI alt 125,00'), null)
eq('Invoice-tag uden UBL-navnerum afvises', parseOioubl('<Invoice><cbc:ID>1</cbc:ID></Invoice>'), null)

const parsed = parseOioubl(xml)
eq('faktura genkendes', parsed?.kind, 'invoice')
eq('fakturanummer er ikke forteksten', parsed?.fields.invoiceNumber, 'FA-100')
eq('leverandørens id er ikke fakturanummeret', parsed?.fields.invoiceNumber === 'IKKE-CVR', false)
eq('navn afkodes', parsed?.fields.supplierName, 'Lemvigh & Co')
eq('CVR normaliseres', parsed?.fields.supplierVatNumber, 'DK12345678')
eq('valuta fra dokumentet', parsed?.fields.currency, 'EUR')
eq('dato', parsed?.fields.invoiceDate, '2026-10-04')
eq('ekskl. moms', parsed?.fields.amountExclVat, 100)
eq('moms', parsed?.fields.vatAmount, 25)
eq('inkl. moms', parsed?.fields.amountInclVat, 125)
eq('betalings-id afkodes', parsed?.fields.paymentReference, '+71<000000000000001>')
eq('IBAN', parsed?.fields.iban, 'DK5000400440116243')
eq('ordrereference bliver hint', parsed?.fields.workOrderHints.includes('SAG-42'), true)
eq('kommentarlinjen tælles ikke', parsed?.lines.length, 1)
eq('enhedspris er pris / basismængde', parsed?.lines[0]?.unitPrice, 50)
eq('linjetotal', parsed?.lines[0]?.totalPrice, 100)
eq('varenummer', parsed?.lines[0]?.supplierProductCode, 'LM-55')
eq('enhed', parsed?.lines[0]?.unit, 'EA')

const rows = oioublLineRows('inv-1', parsed!.lines)
eq('én række til linjetabellen', rows.length, 1)
eq('rækken peger på fakturaen', rows[0]?.incoming_invoice_id, 'inv-1')
eq('produkt kobles ikke i parseren', rows[0]?.supplier_product_id, null)
eq('varenummer ligger i raw_line', rows[0]?.raw_line.includes('LM-55'), true)

const check = headerLineCheck({
  amountExclVat: parsed!.fields.amountExclVat,
  vatAmount: parsed!.fields.vatAmount,
  amountInclVat: parsed!.fields.amountInclVat,
  lines: parsed!.lines.map((l) => ({ totalPrice: l.totalPrice, quantity: l.quantity, unitPrice: l.unitPrice })),
})
eq('OIOUBL-linjer stemmer med hovedet', check.status, 'match')
eq('momsen stemmer', check.vatStatus, 'match')

const broken = parseOioubl(`<CreditNote xmlns="urn:oioubl:names">
  <cbc:ID>KN-1</cbc:ID>
  <cbc:IssueDate>2026-10-09</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>DKK</cbc:DocumentCurrencyCode>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>abc</cbc:TaxExclusiveAmount></cac:LegalMonetaryTotal>
  <cac:CreditNoteLine>
    <cbc:ID>1</cbc:ID>
    <cbc:CreditedQuantity unitCode="EA">1</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount>40.00</cbc:LineExtensionAmount>
  </cac:CreditNoteLine>
</CreditNote>`)
eq('kreditnota', broken?.kind, 'credit')
eq('ulæseligt hovedbeløb er null, ikke 0', broken?.fields.amountExclVat, null)
eq('kreditlinjen beholdes positiv', broken?.lines[0]?.totalPrice, 40)
const brokenCheck = headerLineCheck({
  amountExclVat: broken!.fields.amountExclVat,
  vatAmount: broken!.fields.vatAmount,
  amountInclVat: broken!.fields.amountInclVat,
  lines: broken!.lines.map((l) => ({ totalPrice: l.totalPrice, quantity: l.quantity, unitPrice: l.unitPrice })),
})
eq('uden hovedbeløb er forskellen ikke 0', brokenCheck.status, 'no_header')
eq('forskel er null', brokenCheck.differenceOre, null)

const comma = parseOioubl(`<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>DA</cbc:ID>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>100,50</cbc:TaxExclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`)
eq('ét komma er decimal', comma?.fields.amountExclVat, 100.5)

eq('regex-parseren bruges stadig på almindelig tekst', parseSupplierInvoiceText('Fakturanr 12345\nI alt 100,00').invoiceNumber, '12345')

const src = readFileSync(join(process.cwd(), 'src/lib/services/incoming-invoices.ts'), 'utf8')
const parseStart = src.indexOf('export async function parseAndMatch')
const approveStart = src.indexOf('export async function approveInvoice')
const parseBody = src.slice(parseStart, approveStart)
eq('parseAndMatch bruger OIOUBL-felterne', parseBody.includes('const parsed = oioubl?.fields ?? parseSupplierInvoiceText(text)'), true)
eq('linjer gemmes kun når fakturaen ingen har', parseBody.includes('count === 0') && parseBody.includes('oioublLineRows('), true)
eq('godkendelse parser ikke OIOUBL', src.slice(approveStart, approveStart + 2500).includes('parseOioubl'), false)

if (bad) {
  console.log(`\n${bad} fejl`)
  process.exit(1)
}
console.log('\n✅ alle OIOUBL-tests bestået')
