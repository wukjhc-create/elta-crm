import { AOInvoiceAdapter } from './ao-api-client'
import { LemvigInvoiceAdapter } from './lemvig-api-client'
import type { InvoiceAdapterProvider, SupplierInvoiceAdapter } from './types'

export const INVOICE_ADAPTERS: Record<InvoiceAdapterProvider, () => SupplierInvoiceAdapter> = {
  AO: () => new AOInvoiceAdapter(),
  LM: () => new LemvigInvoiceAdapter(),
}

export function getInvoiceAdapter(provider: InvoiceAdapterProvider): SupplierInvoiceAdapter {
  return INVOICE_ADAPTERS[provider]()
}
