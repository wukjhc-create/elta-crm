/**
 * Prisafvigelser på tværs af leverandørfakturaer (fokus C 2026-10-15). Ren sammenfatning af fakturakontrollen
 * (engine.controlInvoice pr. faktura) — ingen I/O. Overblik: hvor meget betaler vi for meget, hos hvem, og hvor stor
 * en del af fakturalinjerne kan overhovedet kontrolleres (datakvalitet).
 */
import type { InvoiceControl } from '@/lib/invoice-control/engine'

export interface DeviationInvoiceInput {
  id: string
  invoice_number: string | null
  invoice_date: string | null
  supplier_name: string | null
  status: string
  control: InvoiceControl
}

export interface DeviationInvoiceRow {
  id: string
  invoice_number: string | null
  invoice_date: string | null
  supplier_name: string | null
  status: string
  verdict: InvoiceControl['verdict']
  overcharge_amount: number
  deviating_lines: number
  controlled_lines: number
  total_lines: number
}

export interface DeviationSupplierRow { supplier_name: string; invoices: number; overcharge_amount: number; deviating_lines: number }

export interface DeviationOverview {
  invoices: number
  with_deviation: number
  overcharge_total: number
  controlled_lines: number
  total_lines: number
  coverage_pct: number
  rows: DeviationInvoiceRow[]
  by_supplier: DeviationSupplierRow[]
}

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export function summarizeDeviations(inputs: DeviationInvoiceInput[]): DeviationOverview {
  const rows: DeviationInvoiceRow[] = inputs.map((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    invoice_date: i.invoice_date,
    supplier_name: i.supplier_name,
    status: i.status,
    verdict: i.control.verdict,
    overcharge_amount: r2(i.control.overchargeAmount),
    deviating_lines: i.control.lines.filter((l) => l.verdict === 'overcharge' || l.verdict === 'undercharge').length,
    controlled_lines: i.control.controlledLines,
    total_lines: i.control.totalLines,
  }))
  const sup = new Map<string, DeviationSupplierRow>()
  for (const r of rows) {
    if (r.deviating_lines === 0) continue
    const k = r.supplier_name ?? 'Ukendt leverandør'
    const s = sup.get(k) ?? { supplier_name: k, invoices: 0, overcharge_amount: 0, deviating_lines: 0 }
    s.invoices++
    s.overcharge_amount = r2(s.overcharge_amount + r.overcharge_amount)
    s.deviating_lines += r.deviating_lines
    sup.set(k, s)
  }
  const controlled = rows.reduce((a, r) => a + r.controlled_lines, 0)
  const total = rows.reduce((a, r) => a + r.total_lines, 0)
  return {
    invoices: rows.length,
    with_deviation: rows.filter((r) => r.deviating_lines > 0).length,
    overcharge_total: r2(rows.reduce((a, r) => a + r.overcharge_amount, 0)),
    controlled_lines: controlled,
    total_lines: total,
    coverage_pct: total ? Math.round((controlled / total) * 100) : 0,
    rows: rows.filter((r) => r.deviating_lines > 0).sort((a, b) => b.overcharge_amount - a.overcharge_amount),
    by_supplier: [...sup.values()].sort((a, b) => b.overcharge_amount - a.overcharge_amount),
  }
}
