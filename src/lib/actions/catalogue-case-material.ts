'use server'

/**
 * Lægger en kendt katalogvare på sagen via den eksisterende materialehandling.
 * Ukendt eller skjult kost oprettes ikke her. Efter 00248 kan kolonnen godt gemme "ukendt", men genvejen er bevidst uændret:
 * en kendt katalogvare skal have en kendt kost. En linje med ukendt kost er et aktivt valg i "Tilføj materiale".
 * Linjen lægges på sagen uden arbejdsordre, som "Tilføj materiale" gør. Ingen sti gætter en arbejdsordre, og
 * RLS kan skjule andres ordrer, så "præcis én åben ordre" kan ikke afgøres med brugerens klient.
 */
import { formatError, getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createCaseMaterial } from '@/lib/actions/case-materials'
import { userCanViewCase } from '@/lib/auth/case-scope'
import { caseAcceptsCatalogueMaterial } from '@/lib/materials/catalogue-case-rules'
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

  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('materials.add_to_case')) {
      return { success: false, error: 'Manglende tilladelse: materials.add_to_case' }
    }
    if (!ctx.hasPermission(PRICE_PERMISSION)) {
      return { success: false, error: 'Indkøbsprisen er skjult. Linjen oprettes ikke uden kendt kost. Brug "Tilføj materiale" på sagen.' }
    }
    if (!(await userCanViewCase(input.caseId, ctx))) {
      return { success: false, error: 'Sagen er ikke tildelt dig. Intet er oprettet.' }
    }

    const sag = await ctx.supabase.from('service_cases').select('customer_id, status, is_proposal').eq('id', input.caseId).maybeSingle()
    if (sag.error || !sag.data) return { success: false, error: 'Sagen kunne ikke læses. Intet er oprettet.' }
    const caseRow = sag.data as { customer_id: string | null; status: string | null; is_proposal: boolean | null }
    const refusal = caseAcceptsCatalogueMaterial(caseRow)
    if (refusal) return { success: false, error: refusal }

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
      return { success: false, error: 'Kataloget har ingen indkøbspris. Linjen er ikke oprettet.' }
    }

    // Som søgningen i "Tilføj materiale": kun varer fra en aktiv leverandør
    const supplier = await admin.from('suppliers').select('name, is_active').eq('id', row.supplier_id).maybeSingle()
    if (supplier.error || !supplier.data) return { success: false, error: 'Leverandøren kunne ikke læses. Linjen er ikke oprettet.' }
    const supplierRow = supplier.data as { name: string | null; is_active: boolean | null }
    if (supplierRow.is_active === false) return { success: false, error: 'Leverandøren er ikke aktiv. Linjen er ikke oprettet.' }

    const { supplierLinePricingBatch } = await import('@/lib/offers/supplier-line-pricing')
    const map = await supplierLinePricingBatch({
      customerId: caseRow.customer_id,
      admin,
      items: [{
        supplierId: row.supplier_id,
        supplierProductId: row.id,
        costPrice: cataloguePrice,
        productMargin: row.margin_percentage && row.margin_percentage > 0 ? row.margin_percentage : null,
      }],
    })
    const priced = map.get(row.id)
    const unitCost = presentPurchasePrice(priced ? Math.round(priced.effectiveCost * 100) / 100 : null)
    const unitSale = presentPurchasePrice(priced?.unitPrice)
    if (unitCost == null || unitSale == null) {
      return { success: false, error: 'Prisen kunne ikke beregnes. Linjen er ikke oprettet, og kost er ikke sat til 0.' }
    }

    const created = await createCaseMaterial({
      case_id: input.caseId,
      work_order_id: null,
      supplier_product_id: row.id,
      description: (row.supplier_name ?? row.supplier_sku ?? 'Katalogvare').trim(),
      sku_snapshot: row.supplier_sku,
      supplier_name_snapshot: supplierRow.name,
      unit: row.unit || 'stk',
      quantity,
      unit_cost: unitCost,
      unit_sales_price: unitSale,
      source: 'manual',
    })
    if (!created.success) return { success: false, error: created.error ?? 'Linjen blev ikke oprettet.' }
    return { success: true, message: 'Varen er lagt på sagen. Der er ikke valgt en arbejdsordre og ikke afgivet en ordre.' }
  } catch (err) {
    return { success: false, error: formatError(err, 'Linjen blev ikke oprettet. Prøv igen.') }
  }
}
