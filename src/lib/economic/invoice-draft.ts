/**
 * e-conomic fakturakladde — ren mapping fra CRM-faktura til e-conomic's
 * POST /invoices/drafts-body + kontrol af at det e-conomic vil bogføre er det
 * samme som kunden har fået.
 *
 * Bruges af både live-bogføringen (economic-client.createInvoiceInEconomic) og
 * den skrivebeskyttede forhåndsvisning på fakturasiden — så det man ser er
 * præcis det der ville blive sendt.
 *
 * e-conomic beregner selv linjebeløb som antal × enhedspris (2 decimaler).
 * Hvis CRM-linjens total ikke er lig antal × enhedspris (fx timer 0,33 t ×
 * 525 kr, eller en sats udledt af et frosset beløb) bliver den bogførte
 * faktura en anden end kundens → markeres som blokerende fejl.
 */

import { copenhagenParts } from '@/lib/utils/copenhagen-time'

const r2 = (n: number) => Math.round(n * 100) / 100

export interface EconomicDraftConfig {
  layoutNumber?: number | null
  paymentTermsNumber?: number | null
  vatZoneNumber?: number | null
  defaultProductNumber?: string | null
}

export interface EconomicDraftInput {
  invoice: {
    invoice_number: string
    currency?: string | null
    created_at?: string | null
    total_amount: number | string | null
  }
  customer: {
    company_name?: string | null
    contact_person?: string | null
    billing_address?: string | null
    billing_postal_code?: string | null
    billing_city?: string | null
    billing_country?: string | null
  }
  /** e-conomic kundenummer hvis kunden allerede er koblet; ellers oprettes kunden ved bogføring. */
  customerNumber: number | null
  lines: Array<{
    position?: number | null
    description?: string | null
    quantity: number | string | null
    unit_price: number | string | null
    total_price?: number | string | null
  }>
  config: EconomicDraftConfig
}

export type EconomicIssueCode =
  | 'missing_config'
  | 'no_customer'
  | 'no_lines'
  | 'line_total_mismatch'
  | 'sum_mismatch'
  | 'customer_will_be_created'
  | 'credit_note'

export interface EconomicIssue {
  code: EconomicIssueCode
  /** error = live-bogføring afvises; info = til orientering */
  severity: 'error' | 'info'
  message: string
}

export interface EconomicDraftLine {
  lineNumber: number
  description: string
  quantity: number
  unitNetPrice: number
  product: { productNumber: string }
}

export interface EconomicInvoiceDraftBody {
  currency: string
  date: string
  paymentTerms: { paymentTermsNumber: number | null }
  customer: { customerNumber: number | null }
  recipient: {
    name: string
    address?: string
    zip?: string
    city?: string
    country: string
    vatZone: { vatZoneNumber: number | null }
  }
  layout: { layoutNumber: number | null }
  references: { other: string }
  lines: EconomicDraftLine[]
}

export interface EconomicInvoiceDraft {
  body: EconomicInvoiceDraftBody
  /** Netto (ekskl. moms) som e-conomic vil beregne: Σ antal × enhedspris */
  economicNet: number
  /** Netto (ekskl. moms) på CRM-fakturaen */
  crmNet: number
  issues: EconomicIssue[]
  /** true når ingen blokerende fejl — kunden findes/oprettes dog først ved bogføring */
  canPost: boolean
}

const fmt = (n: number) =>
  n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function buildEconomicInvoiceDraft(input: EconomicDraftInput): EconomicInvoiceDraft {
  const { invoice, customer, config } = input
  const issues: EconomicIssue[] = []

  const missing = [
    !config.layoutNumber && 'layout',
    !config.paymentTermsNumber && 'betalingsbetingelse',
    !config.vatZoneNumber && 'momszone',
  ].filter(Boolean) as string[]
  if (missing.length > 0) {
    issues.push({
      code: 'missing_config',
      severity: 'error',
      message: `Mangler i e-conomic-opsætningen: ${missing.join(', ')}`,
    })
  }

  const productNumber = config.defaultProductNumber || '1'
  const lines: EconomicDraftLine[] = input.lines.map((l, i) => ({
    lineNumber: l.position || i + 1,
    description: (l.description || '').slice(0, 1000),
    quantity: Number(l.quantity) || 0,
    unitNetPrice: Number(l.unit_price) || 0,
    product: { productNumber },
  }))
  if (lines.length === 0) {
    issues.push({ code: 'no_lines', severity: 'error', message: 'Fakturaen har ingen linjer' })
  }

  input.lines.forEach((l, i) => {
    if (l.total_price == null) return
    const econ = r2(lines[i].quantity * lines[i].unitNetPrice)
    const crm = r2(Number(l.total_price))
    if (Math.abs(econ - crm) >= 0.005) {
      issues.push({
        code: 'line_total_mismatch',
        severity: 'error',
        message: `Linje ${lines[i].lineNumber} "${lines[i].description.slice(0, 40)}": e-conomic beregner ${fmt(lines[i].quantity)} × ${fmt(lines[i].unitNetPrice)} = ${fmt(econ)} kr, fakturaen siger ${fmt(crm)} kr`,
      })
    }
  })

  const economicNet = r2(lines.reduce((s, l) => s + r2(l.quantity * l.unitNetPrice), 0))
  const crmNet = r2(Number(invoice.total_amount ?? 0))
  if (lines.length > 0 && Math.abs(economicNet - crmNet) >= 0.005) {
    issues.push({
      code: 'sum_mismatch',
      severity: 'error',
      message: `e-conomic ville bogføre ${fmt(economicNet)} kr ekskl. moms, fakturaen er på ${fmt(crmNet)} kr`,
    })
  }

  if (input.customerNumber == null) {
    issues.push({
      code: 'customer_will_be_created',
      severity: 'info',
      message: 'Kunden er ikke koblet til e-conomic endnu — oprettes automatisk ved bogføring',
    })
  }
  if (crmNet < 0) {
    issues.push({
      code: 'credit_note',
      severity: 'info',
      message: 'Negativ faktura (kreditnota) — bogføres som faktura med negative linjer',
    })
  }

  const body: EconomicInvoiceDraftBody = {
    currency: invoice.currency || 'DKK',
    // Dansk kalenderdato (samme dag som på kundens PDF) — før UTC-dato.
    date: copenhagenParts(invoice.created_at || new Date().toISOString()).date,
    paymentTerms: { paymentTermsNumber: config.paymentTermsNumber ?? null },
    customer: { customerNumber: input.customerNumber },
    recipient: {
      name: customer.company_name || customer.contact_person || 'Kunde',
      address: customer.billing_address || undefined,
      zip: customer.billing_postal_code || undefined,
      city: customer.billing_city || undefined,
      country: customer.billing_country || 'Denmark',
      vatZone: { vatZoneNumber: config.vatZoneNumber ?? null },
    },
    layout: { layoutNumber: config.layoutNumber ?? null },
    references: { other: invoice.invoice_number },
    lines,
  }

  return {
    body,
    economicNet,
    crmNet,
    issues,
    canPost: !issues.some((x) => x.severity === 'error'),
  }
}
