/**
 * Netto faktureret på en sag (ren logik). Bevidst IKKE 'use server'.
 *
 * Sags-review 2026-10-05 (Q16): "Faktureret"/"Rest at fakturere" summerede ALLE fakturaer — kladder, annullerede og
 * kreditnotaer som plus (60k + kredit 60k + 40k viste 160k). Kun udstedte (sendt/betalt), ikke-annullerede fakturaer
 * tæller; kreditnotaer trækkes fra uanset hvilket fortegn de er gemt med.
 */
export type InvoiceAmountRow = {
  total_amount: number | string | null
  status: string | null
  invoice_type: string | null
  voided_at: string | null
}

export const ISSUED_INVOICE_STATUSES: ReadonlySet<string> = new Set(['sent', 'paid'])

export function isIssuedActiveInvoice(r: Pick<InvoiceAmountRow, 'status' | 'voided_at'>): boolean {
  return !r.voided_at && ISSUED_INVOICE_STATUSES.has(r.status ?? '')
}

/** Netto udstedt ekskl. moms: sendte/betalte, ikke-annullerede fakturaer minus udstedte kreditnotaer. */
export function netInvoicedExVat(rows: InvoiceAmountRow[]): number {
  let net = 0
  for (const r of rows) {
    if (!isIssuedActiveInvoice(r)) continue
    const amt = Math.abs(Number(r.total_amount ?? 0))
    net += r.invoice_type === 'credit' ? -amt : amt
  }
  return Math.round(net * 100) / 100
}
