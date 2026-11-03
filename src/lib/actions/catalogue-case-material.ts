'use server'

/**
 * Lægger en kendt katalogvare på sagen via den eksisterende materialehandling.
 * Ukendt eller skjult kost oprettes ikke: kolonnen kan ikke gemme "ukendt", kun 0.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createCaseMaterial } from '@/lib/actions/case-materials'
import { userCanViewCase } from '@/lib/auth/case-scope'
import { createAdminClient } from '@/lib/supabase/admin'
import { presentPurchasePrice } from '@/lib/suppliers/product-lookup'
import { validateUUID } from '@/lib/validations/common'

const PRICE_PERMISSION = 'materials.view.cost_prices' as const

export async function addKnownCatalogueProductToCase(input: {
  caseId: string
  supplierProductId: string
  quantity: number
}): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    validateUUID(input.caseId, 'sag')
    validateUUID(input.supplierProductId, 'vare')
  } catch {
    return { success: false, error: 'Sagen eller varen er ugyldig. Intet er oprettet.' }
  }
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) {
    return { success: false, error: 'Antal skal være større end 0. Intet er oprettet.' }
  }

  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('materials.add_to_case')) {
    return { success: false, error: 'Manglende tilladelse: materials.add_to_case' }
  }
  if (!ctx.hasPermission(PRICE_PERMISSION)) {
    return { success: false, error: 'Indkøbsprisen er skjult. Linjen oprettes ikke, fordi kost ellers bliver gemt som 0.' }
  }
  if (!(await userCanViewCase(input.caseId, ctx))) {
    return { success: false, error: 'Sagen er ikke tildelt dig. Intet er oprettet.' }
  }

  const admin = createAdminClient()
  const product = await admin.from('supplier_products').select('id, supplier_id, supplier_sku, supplier_name, unit, cost_price, margin_percentage').eq('id', input.supplierProductId).maybeSingle()
  if (product.error || !product.data) {
    return { success: false, error: 'Varen kunne ikke læses. Linjen er ikke oprettet.' }
  }
  const row = product.data as {
    id: string
    supplier_id: string
    supplier_sku: string | null
    supplier_name: string | null
    unit: string | null
    cost_price: unknown
    margin_percentage: number | null
  }
  const cataloguePrice = presentPurchasePrice(row.cost_price)
  if (cataloguePrice == null) {
    return { success: false, error: 'Kataloget har ingen indkøbspris. Linjen er ikke oprettet som 0 kr.' }
  }

  const sag = await ctx.supabase.from('service_cases').select('customer_id').eq('id', input.caseId).maybeSingle()
  if (sag.error || !sag.data) return { success: false, error: 'Sagen kunne ikke læses. Intet er oprettet.' }
  const customerId = (sag.data as { customer_id: string | null }).customer_id

  const orders = await ctx.supabase.from('work_orders').select('id').eq('case_id', input.caseId).in('status', ['planned', 'in_progress']).limit(2)
  if (orders.error) return { success: false, error: 'Arbejdsordrerne kunne ikke læses. Linjen er ikke oprettet.' }
  const openOrders = (orders.data ?? []) as Array<{ id: string }>
  const workOrderId = openOrders.length === 1 ? openOrders[0].id : null

  const { supplierLinePricingBatch } = await import('@/lib/offers/supplier-line-pricing')
  let priced: { unitPrice: number; effectiveCost: number } | undefined
  try {
    const map = await supplierLinePricingBatch({
      customerId,
      admin,
      items: [{
        supplierId: row.supplier_id,
        supplierProductId: row.id,
        costPrice: cataloguePrice,
        productMargin: row.margin_percentage && row.margin_percentage > 0 ? row.margin_percentage : null,
      }],
    })
    priced = map.get(row.id)
  } catch {
    priced = undefined
  }
  const unitCost = presentPurchasePrice(priced?.effectiveCost)
  const unitSale = presentPurchasePrice(priced?.unitPrice)
  if (unitCost == null || unitSale == null) {
    return { success: false, error: 'Prisen kunne ikke beregnes. Linjen er ikke oprettet, og kost er ikke sat til 0.' }
  }

  const supplier = await ctx.supabase.from('suppliers').select('name').eq('id', row.supplier_id).maybeSingle()
  const supplierName = supplier.error ? null : ((supplier.data as { name: string | null } | null)?.name ?? null)

  const created = await createCaseMaterial({
    case_id: input.caseId,
    work_order_id: workOrderId,
    supplier_product_id: row.id,
    description: (row.supplier_name ?? row.supplier_sku ?? 'Katalogvare').trim(),
    sku_snapshot: row.supplier_sku,
    supplier_name_snapshot: supplierName,
    unit: row.unit || 'stk',
    quantity,
    unit_cost: unitCost,
    unit_sales_price: unitSale,
    source: 'manual',
  })
  if (!created.success) return { success: false, error: created.error ?? 'Linjen blev ikke oprettet.' }
  const where = openOrders.length === 1
    ? 'Varen er lagt på sagen og den åbne arbejdsordre.'
    : openOrders.length > 1
      ? 'Varen er lagt på sagen. Der er flere åbne arbejdsordrer, så der er ikke valgt en.'
      : 'Varen er lagt på sagen.'
  return { success: true, message: `${where} Der er ikke afgivet en ordre.` }
}
