/**
 * Common interface for supplier invoice API adapters (Phase 15.3).
 *
 * Each adapter pulls invoices from a single supplier's API/EDI feed
 * and returns a normalised array. The orchestrator
 * (incoming-invoices.ts → ingestFromSupplierAPI) handles dedup +
 * insert + parseAndMatch — adapters do not touch the database.
 */

export type InvoiceAdapterProvider = 'AO' | 'LM'

export interface NormalisedInvoiceLine {
  lineNumber: number
  description: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  totalPrice: number | null
  supplierProductCode: string | null
}

export interface NormalisedInvoice {
  /** Supplier-side invoice number (e.g. "FA12345"). */
  invoiceNumber: string
  /** ISO yyyy-mm-dd. */
  invoiceDate: string | null
  dueDate: string | null
  currency: string
  amountExclVat: number | null
  vatAmount: number | null
  amountInclVat: number | null
  paymentReference: string | null
  iban: string | null
  /** Full text representation — used by the parser for fields the
      adapter didn't structure (CVR, address, etc.) and for file-hash
      dedup when no PDF is attached. */
  rawText: string
  /** Optional URL to the original PDF/XML file (for archive). */
  fileUrl: string | null
  fileName: string | null
  mimeType: string | null
  /** Supplier-side order references found on the invoice (AO ordrenr,
      LM ordre, pakkeseddel) — fed to the matcher's order-ref signal. */
  supplierOrderRefs: string[]
  /** Hint we trust enough to use as a workOrder reference (case_number
      when supplier prints it on the invoice). */
  workOrderHints: string[]
  lines: NormalisedInvoiceLine[]
}

export interface SupplierInvoiceAdapter {
  readonly provider: InvoiceAdapterProvider
  /** Returns invoices in the time window. The "since" date is inclusive. */
  fetchInvoices(opts: { sinceIso: string }): Promise<{
    invoices: NormalisedInvoice[]
    skipped: boolean
    skipReason?: string
  }>
}
