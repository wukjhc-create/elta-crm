/**
 * DL-3 (slette-review 2026-10-18): sletning af en leverandør/et leverandørprodukt kaskaderede pris- og aftalehistorik
 * (price_history, kundeaftaler, avanceregler) og satte supplier_id/supplier_product_id til NULL på bogførte
 * leverandørfakturaer, sagsmaterialer og fakturalinjer — så dublet-værnet (leverandør + fakturanr.) og kostsporet forsvandt.
 * Nu: sletning afvises, når der er historik; deaktivér i stedet. Bevidst IKKE 'use server' (kaldes server-side efter gate).
 */
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

async function count(admin: Admin, table: string, column: string, value: string): Promise<number> {
  const { count: n, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(column, value)
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

/** null = må slettes; ellers dansk begrundelse */
export async function supplierDeleteBlockReason(supplierId: string): Promise<string | null> {
  const admin = createAdminClient()
  const invoices = await count(admin, 'incoming_invoices', 'supplier_id', supplierId)
  if (invoices > 0) return `Leverandøren har ${invoices} leverandørfaktura${invoices === 1 ? '' : 'er'} og kan ikke slettes — deaktivér den i stedet`
  const products = await count(admin, 'supplier_products', 'supplier_id', supplierId)
  if (products > 0) return `Leverandøren har ${products} produkt${products === 1 ? '' : 'er'} (med prishistorik og aftaler) og kan ikke slettes — deaktivér den i stedet`
  const agreements = await count(admin, 'customer_supplier_prices', 'supplier_id', supplierId)
  if (agreements > 0) return `Leverandøren indgår i ${agreements} kundeaftale${agreements === 1 ? '' : 'r'} og kan ikke slettes — deaktivér den i stedet`
  return null
}

export async function supplierProductDeleteBlockReason(productId: string): Promise<string | null> {
  const admin = createAdminClient()
  const checks: Array<[string, string, string]> = [
    ['case_materials', 'supplier_product_id', 'sagsmaterialer'],
    ['incoming_invoice_lines', 'supplier_product_id', 'leverandørfakturalinjer'],
    ['offer_line_items', 'supplier_product_id', 'tilbudslinjer'],
    ['customer_product_prices', 'supplier_product_id', 'kundepriser'],
  ]
  for (const [table, column, label] of checks) {
    const n = await count(admin, table, column, productId)
    if (n > 0) return `Produktet bruges i ${n} ${label} og kan ikke slettes — deaktivér det i stedet`
  }
  return null
}
