/**
 * e-conomic leverandørfakturakladde — ren mapping fra incoming_invoices til
 * POST /supplier-invoices/drafts + kontrol af at den bogførte omkostning er
 * fakturaens beløb EKSKL. moms.
 *
 * Bruges af live-bogføringen (economic-client.pushSupplierInvoiceToEconomic,
 * der kører automatisk ved godkendelse når e-conomic er opsat) og af
 * forhåndsvisningen på leverandørfakturaen.
 *
 * Fund rettet her:
 *   - Udlæste linjer er best-effort (PDF-parsing kan misse fragt/gebyrer). Før
 *     blev SUMMEN AF DE UDLÆSTE LINJER bogført som omkostning → forkert beløb.
 *     Nu tilføjes en differencelinje så bogføringen = fakturaens nettobeløb.
 *   - Uden linjer og uden beløb ekskl. moms faldt den tilbage til beløbet
 *     INKL. moms → omkostningen bogført med moms. Nu udledes netto af
 *     inkl. − moms, ellers afvises.
 *   - Manglende fakturadato blev til dags dato (forkert periode) → afvises.
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const fmt = (n: number) =>
  n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface SupplierDraftInput {
  invoice: {
    invoice_number?: string | null
    invoice_date?: string | null
    due_date?: string | null
    currency?: string | null
    amount_excl_vat?: number | string | null
    vat_amount?: number | string | null
    amount_incl_vat?: number | string | null
    payment_reference?: string | null
  }
  supplierNumber: number | null
  lines: Array<{
    line_number?: number | null
    description?: string | null
    quantity?: number | string | null
    unit_price?: number | string | null
    total_price?: number | string | null
  }>
  config: { costAccountNumber?: number | null }
}

export type SupplierIssueCode =
  | 'supplier_not_linked'
  | 'missing_config'
  | 'missing_net_amount'
  | 'missing_invoice_date'
  | 'adjustment_line'
  | 'net_derived'
  | 'single_line'

export interface SupplierIssue {
  code: SupplierIssueCode
  severity: 'error' | 'info'
  message: string
}

export interface SupplierDraftLine {
  lineNumber: number
  description: string
  quantity: number
  amount: number
  costAccount: { accountNumber: number | null }
}

export interface SupplierInvoiceDraft {
  body: {
    currency: string
    date: string | null
    dueDate?: string
    supplier: { supplierNumber: number | null }
    supplierInvoiceNumber?: string
    paymentReference?: string
    lines: SupplierDraftLine[]
  }
  /** Omkostning (ekskl. moms) e-conomic vil bogføre = Σ linjebeløb */
  economicNet: number
  /** Fakturaens beløb ekskl. moms (eller udledt) — null hvis ukendt */
  invoiceNet: number | null
  issues: SupplierIssue[]
  canPost: boolean
}

export function buildEconomicSupplierInvoiceDraft(input: SupplierDraftInput): SupplierInvoiceDraft {
  const { invoice, config } = input
  const issues: SupplierIssue[] = []
  const costAccount = config.costAccountNumber ?? null

  if (input.supplierNumber == null) {
    issues.push({ code: 'supplier_not_linked', severity: 'error', message: 'Leverandøren mangler e-conomic-leverandørnr. (Leverandører → rediger)' })
  }
  if (!costAccount) {
    issues.push({ code: 'missing_config', severity: 'error', message: 'Omkostningskonto mangler i e-conomic-opsætningen' })
  }
  if (!invoice.invoice_date) {
    issues.push({ code: 'missing_invoice_date', severity: 'error', message: 'Fakturadato mangler — bogføring ville ske på forkert dato' })
  }

  // Nettobeløb (ekskl. moms)
  let invoiceNet = num(invoice.amount_excl_vat)
  if (invoiceNet == null) {
    const incl = num(invoice.amount_incl_vat)
    const vat = num(invoice.vat_amount)
    if (incl != null && vat != null) {
      invoiceNet = r2(incl - vat)
      issues.push({ code: 'net_derived', severity: 'info', message: `Beløb ekskl. moms udledt: ${fmt(incl)} − moms ${fmt(vat)} = ${fmt(invoiceNet)} kr` })
    }
  }

  const lines: SupplierDraftLine[] = input.lines.map((l, i) => {
    const qty = num(l.quantity) ?? 1
    const total = num(l.total_price) ?? (num(l.unit_price) != null ? r2((num(l.unit_price) as number) * qty) : 0)
    return {
      lineNumber: l.line_number || i + 1,
      description: (l.description || `Linje ${i + 1}`).slice(0, 1000),
      quantity: qty || 1,
      amount: r2(total),
      costAccount: { accountNumber: costAccount },
    }
  })

  if (lines.length === 0) {
    if (invoiceNet == null) {
      issues.push({ code: 'missing_net_amount', severity: 'error', message: 'Beløb ekskl. moms mangler — kan ikke bogføres (beløb inkl. moms må ikke bogføres som omkostning)' })
    } else {
      lines.push({
        lineNumber: 1,
        description: `Faktura ${invoice.invoice_number ?? ''}`.trim() || 'Leverandørfaktura',
        quantity: 1,
        amount: invoiceNet,
        costAccount: { accountNumber: costAccount },
      })
      issues.push({ code: 'single_line', severity: 'info', message: 'Ingen udlæste linjer — fakturaen bogføres som én linje' })
    }
  } else if (invoiceNet != null) {
    const sum = r2(lines.reduce((s, l) => s + l.amount, 0))
    const diff = r2(invoiceNet - sum)
    if (Math.abs(diff) >= 0.005) {
      lines.push({
        lineNumber: Math.max(...lines.map((l) => l.lineNumber)) + 1,
        description: 'Øvrigt iflg. faktura (ikke udlæst)',
        quantity: 1,
        amount: diff,
        costAccount: { accountNumber: costAccount },
      })
      issues.push({ code: 'adjustment_line', severity: 'info', message: `Udlæste linjer = ${fmt(sum)} kr, fakturaen = ${fmt(invoiceNet)} kr — differencelinje ${fmt(diff)} kr tilføjet` })
    }
  }

  const economicNet = r2(lines.reduce((s, l) => s + l.amount, 0))

  return {
    body: {
      currency: invoice.currency || 'DKK',
      date: invoice.invoice_date || null,
      dueDate: invoice.due_date || undefined,
      supplier: { supplierNumber: input.supplierNumber },
      supplierInvoiceNumber: invoice.invoice_number || undefined,
      paymentReference: invoice.payment_reference || undefined,
      lines,
    },
    economicNet,
    invoiceNet,
    issues,
    canPost: !issues.some((i) => i.severity === 'error'),
  }
}
