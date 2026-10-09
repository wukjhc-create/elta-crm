/**
 * OIOUBL / UBL-faktura til hovedfelter og linjer. Ren funktion, ingen database.
 * Beløb læses som de står. En kreditnota bliver ikke vendt til minus.
 * Tekst uden UBL-navnerum er ikke en faktura.
 */
import type { ParsedInvoiceFields } from '@/types/incoming-invoices.types'
import { normalizeVatNumber } from '@/lib/invoice-control/vat'

export interface OioublLine {
  lineNumber: number
  description: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  totalPrice: number | null
  supplierProductCode: string | null
}

export interface OioublParsed {
  kind: 'invoice' | 'credit'
  fields: ParsedInvoiceFields
  lines: OioublLine[]
}

const UBL = /urn:oasis:names:specification:ubl|oioubl/i

function decode(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function xmlAmount(raw: string | null): number | null {
  if (!raw) return null
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return null
  let norm = s
  if (s.includes(',') && s.includes('.')) return null
  if (s.includes(',')) norm = s.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return null
  const n = Number(norm)
  return Number.isFinite(n) ? n : null
}

function extractBlocks(xml: string, local: string): string[] {
  const open = new RegExp(`<(?:[\\w.-]+:)?${local}\\b[^>]*>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = open.exec(xml))) {
    const close = new RegExp(`</(?:[\\w.-]+:)?${local}\\s*>`, 'gi')
    close.lastIndex = m.index + m[0].length
    const end = close.exec(xml)
    if (!end) break
    out.push(xml.slice(m.index + m[0].length, end.index))
    open.lastIndex = end.index + end[0].length
  }
  return out
}

function removeBlocks(xml: string, local: string): string {
  const open = new RegExp(`<(?:[\\w.-]+:)?${local}\\b[^>]*>`, 'gi')
  let out = ''
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = open.exec(xml))) {
    const close = new RegExp(`</(?:[\\w.-]+:)?${local}\\s*>`, 'gi')
    close.lastIndex = m.index + m[0].length
    const end = close.exec(xml)
    if (!end) break
    out += xml.slice(cursor, m.index)
    cursor = end.index + end[0].length
    open.lastIndex = cursor
  }
  return out + xml.slice(cursor)
}

function firstText(block: string, local: string): string | null {
  const m = block.match(new RegExp(`<(?:[\\w.-]+:)?${local}\\b[^>]*>([^<]*)</(?:[\\w.-]+:)?${local}>`, 'i'))
  if (!m) return null
  const text = decode(m[1])
  return text || null
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return m?.[1] ?? null
}

function firstTag(block: string, local: string): string | null {
  const m = block.match(new RegExp(`<(?:[\\w.-]+:)?${local}\\b[^>]*>`, 'i'))
  return m?.[0] ?? null
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function fieldsFrom(header: string, supplier: string): ParsedInvoiceFields {
  const monetary = extractBlocks(header, 'LegalMonetaryTotal')[0] ?? ''
  const tax = extractBlocks(header, 'TaxTotal')[0] ?? ''
  const payment = extractBlocks(header, 'PaymentMeans')[0] ?? ''
  const order = extractBlocks(header, 'OrderReference')[0] ?? ''
  const excl = xmlAmount(firstText(monetary, 'TaxExclusiveAmount'))
  const incl = xmlAmount(firstText(monetary, 'TaxInclusiveAmount')) ?? xmlAmount(firstText(monetary, 'PayableAmount'))
  const vat = xmlAmount(firstText(tax, 'TaxAmount'))
  const beforeSupplier = header.split(/<(?:[\w.-]+:)?AccountingSupplierParty\b/i)[0] ?? header
  const name = firstText(extractBlocks(supplier, 'PartyName')[0] ?? '', 'Name')
    ?? firstText(extractBlocks(supplier, 'PartyLegalEntity')[0] ?? '', 'RegistrationName')
  const companyId = firstText(extractBlocks(supplier, 'PartyTaxScheme')[0] ?? supplier, 'CompanyID')
  const ibanRaw = firstText(extractBlocks(payment, 'PayeeFinancialAccount')[0] ?? payment, 'ID')
  const iban = ibanRaw && /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(ibanRaw.replace(/\s/g, ''))
    ? ibanRaw.replace(/\s/g, '').toUpperCase()
    : null
  const hints = [firstText(order, 'ID'), firstText(header, 'BuyerReference')].filter((v): v is string => !!v)
  const out: ParsedInvoiceFields = {
    supplierName: name,
    supplierVatNumber: normalizeVatNumber(companyId),
    invoiceNumber: firstText(beforeSupplier, 'ID'),
    invoiceDate: firstText(header, 'IssueDate'),
    dueDate: firstText(header, 'DueDate') ?? firstText(payment, 'PaymentDueDate'),
    amountExclVat: excl,
    vatAmount: vat,
    amountInclVat: incl,
    paymentReference: firstText(payment, 'PaymentID'),
    iban,
    currency: (firstText(header, 'DocumentCurrencyCode') ?? 'DKK').toUpperCase(),
    workOrderHints: hints,
    supplierOrderRefs: [],
    deliveryAddressHints: [],
    confidence: 0,
    fieldScores: {},
  }
  out.fieldScores = {
    supplierName: out.supplierName ? 1 : 0,
    supplierVatNumber: out.supplierVatNumber ? 1 : 0,
    invoiceNumber: out.invoiceNumber ? 1 : 0,
    invoiceDate: out.invoiceDate ? 1 : 0,
    dueDate: out.dueDate ? 1 : 0,
    amountInclVat: out.amountInclVat != null ? 1 : 0,
    paymentReference: out.paymentReference ? 1 : 0,
    iban: out.iban ? 1 : 0,
    workOrderHints: out.workOrderHints.length > 0 ? 1 : 0,
    supplierOrderRefs: 0,
    deliveryAddressHints: 0,
  }
  const checks = [
    out.invoiceNumber != null,
    out.invoiceDate != null,
    out.amountInclVat != null,
    out.supplierName != null,
    out.paymentReference != null || out.iban != null,
  ]
  out.confidence = round3(checks.filter(Boolean).length / checks.length)
  return out
}

function lineFrom(block: string, fallbackNumber: number, quantityTag: string): OioublLine {
  const qtyTag = firstTag(block, quantityTag)
  const qty = xmlAmount(firstText(block, quantityTag))
  const priceBlock = extractBlocks(block, 'Price')[0] ?? ''
  const price = xmlAmount(firstText(priceBlock, 'PriceAmount'))
  const base = xmlAmount(firstText(priceBlock, 'BaseQuantity'))
  const unitPrice = price == null ? null
    : base != null && base > 0 && base !== 1 ? Math.round((price / base) * 10000) / 10000
      : price
  const item = extractBlocks(block, 'Item')[0] ?? block
  const seller = extractBlocks(item, 'SellersItemIdentification')[0] ?? ''
  const ean = firstText(extractBlocks(item, 'StandardItemIdentification')[0] ?? '', 'ID')
  const code = firstText(seller, 'ID') ?? ean
  const id = xmlAmount(firstText(block, 'ID'))
  return {
    lineNumber: id != null && Number.isInteger(id) && id > 0 ? id : fallbackNumber,
    description: firstText(item, 'Description') ?? firstText(item, 'Name'),
    quantity: qty,
    unit: qtyTag ? attr(qtyTag, 'unitCode') : null,
    unitPrice,
    totalPrice: xmlAmount(firstText(block, 'LineExtensionAmount')),
    supplierProductCode: code,
  }
}

/** null når teksten ikke er en UBL-faktura eller kreditnota. */
export function parseOioubl(raw: string | null | undefined): OioublParsed | null {
  if (!raw || !UBL.test(raw)) return null
  const xml = raw.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '')
  const root = xml.match(/<(?:[\w.-]+:)?(Invoice|CreditNote)(?!Line)\b/i)
  if (!root) return null
  const kind = root[1].toLowerCase() === 'creditnote' ? 'credit' : 'invoice'
  const body = xml.slice(root.index ?? 0)
  const lineTag = kind === 'credit' ? 'CreditNoteLine' : 'InvoiceLine'
  const qtyTag = kind === 'credit' ? 'CreditedQuantity' : 'InvoicedQuantity'
  const header = removeBlocks(removeBlocks(body, 'InvoiceLine'), 'CreditNoteLine')
  const supplier = extractBlocks(header, 'AccountingSupplierParty')[0] ?? ''
  const lines = extractBlocks(body, lineTag).map((block, i) => lineFrom(block, i + 1, qtyTag))
  return { kind, fields: fieldsFrom(header, supplier), lines }
}

/** Rækker til incoming_invoice_lines. Produktkoblingen sættes af kalderen. */
export function oioublLineRows(invoiceId: string, lines: OioublLine[]): Array<{
  incoming_invoice_id: string
  line_number: number
  description: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total_price: number | null
  supplier_product_id: null
  raw_line: string
}> {
  return lines.map((l) => ({
    incoming_invoice_id: invoiceId,
    line_number: l.lineNumber,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    unit_price: l.unitPrice,
    total_price: l.totalPrice,
    supplier_product_id: null,
    raw_line: JSON.stringify({ supplier_product_code: l.supplierProductCode }),
  }))
}
