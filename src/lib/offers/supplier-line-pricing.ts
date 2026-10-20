/**
 * Prisberegning for leverandørlinjer på tilbud (oprettelse og opdatering). Flyttet fra lib/actions/offers.ts
 * 2026-10-14 så den kan testes (scripts/test-harness: supplier-line-pricing-check). Bevidst IKKE 'use server' — kaldes kun
 * fra gatede server actions; læser kost/aftaler med admin-klienten.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { CALC_DEFAULTS } from '@/lib/constants'
import { calculateSalePrice } from '@/lib/logic/pricing'
import { onlyValidAgreements } from '@/lib/pricing/agreement-validity'

/**
 * Kalkulations-review 2026-10-09 (#1/#2): ÉN prisberegning for leverandørlinjer (oprettelse og opdatering).
 *   kost (effektiv) = leverandørens kostpris × (1 − kundens leverandørrabat)
 *   avance = egen avance (kost-roller) → avanceregel (inkl. fast tillæg/afrunding) → kundens aftale-avance → produktets
 *   avance → standard. Kost/aftaler læses med admin-klienten bag kaldernes gate (00192/00201).
 */
export async function supplierLinePricing(input: {
  supplierId: string
  supplierProductId: string
  customerId: string | null
  costPrice: number
  productMargin: number | null | undefined
  customMargin?: number
  /** Til test (harness mod staging) — ellers admin-klienten */
  admin?: SupabaseClient
}): Promise<{ unitPrice: number; marginPercentage: number; effectiveCost: number }> {
  const admin = input.admin ?? createAdminClient()
  // Grossist-review 2026-10-14 (GP-3): kategori-/underkategoriregler gjaldt aldrig (p_category null)
  const { data: prodCat } = await admin.from('supplier_products').select('category, sub_category').eq('id', input.supplierProductId).maybeSingle()
  const cat = prodCat as { category: string | null; sub_category: string | null } | null
  // GP-2: en udløbet/ikke-startet kundeaftale må ikke give rabat (onlyValidAgreements)
  const [{ data: marginData }, customerRes, productPriceRes] = await Promise.all([
    admin.rpc('get_effective_margin', {
      p_supplier_id: input.supplierId,
      p_supplier_product_id: input.supplierProductId,
      p_category: cat?.category ?? null,
      p_sub_category: cat?.sub_category ?? null,
      p_customer_id: input.customerId,
    }),
    input.customerId
      ? onlyValidAgreements(admin.from('customer_supplier_prices').select('discount_percentage, custom_margin_percentage')
          .eq('customer_id', input.customerId).eq('supplier_id', input.supplierId).eq('is_active', true))
          .limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    // GP-2: produktspecifik kundepris (customer_product_prices) går FORAN leverandøraftalen — samme forrang som
    // DB-funktionen get_customer_product_price (pakkestien); før blev den ignoreret ved manuelle linjer
    input.customerId
      ? onlyValidAgreements(admin.from('customer_product_prices').select('custom_cost_price, custom_discount_percentage')
          .eq('customer_id', input.customerId).eq('supplier_product_id', input.supplierProductId).eq('is_active', true))
          .limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const productPrice = productPriceRes.data as { custom_cost_price: number | null; custom_discount_percentage: number | null } | null
  const agreement = productPrice
    ? null // produktprisen erstatter leverandøraftalen helt (rabat og aftale-avance)
    : (customerRes.data as { discount_percentage: number | null; custom_margin_percentage: number | null } | null)
  const baseCost = productPrice?.custom_cost_price != null && Number(productPrice.custom_cost_price) > 0 ? Number(productPrice.custom_cost_price) : input.costPrice
  const discountPct = Number(productPrice ? productPrice.custom_discount_percentage ?? 0 : agreement?.discount_percentage ?? 0)
  const effectiveCost = discountPct > 0 ? baseCost * (1 - discountPct / 100) : baseCost

  const rule = (marginData as Array<{ margin_percentage: number; fixed_markup: number | null; round_to: number | null; rule_type?: string | null }> | null)?.[0]
  // FIN3-1 (finans-review 2 2026-10-20): fælles forrang — produkt-/kunderegel → kundeaftalens avance → kategori-/
  // leverandørregel → produktets avance → standard. Før slog ENHVER regel (også leverandørens standardregel) aftalen,
  // mens kalkia/sagsmateriale/DB-funktionen brugte aftalen → kunden fik et dyrere tilbud end aftalt.
  const specificRule = !!rule && (rule.rule_type === 'product' || rule.rule_type === 'customer')
  const agreementMargin = agreement?.custom_margin_percentage !== null && agreement?.custom_margin_percentage !== undefined
    ? Number(agreement.custom_margin_percentage) : null
  let marginPercentage: number
  let fixedMarkup = 0
  let roundTo: number | undefined
  if (input.customMargin !== undefined && input.customMargin !== null) {
    marginPercentage = input.customMargin
  } else if (rule && specificRule) {
    marginPercentage = Number(rule.margin_percentage)
    fixedMarkup = Number(rule.fixed_markup ?? 0)
    roundTo = rule.round_to ?? undefined
  } else if (agreementMargin !== null) {
    marginPercentage = agreementMargin
  } else if (rule) {
    marginPercentage = Number(rule.margin_percentage)
    fixedMarkup = Number(rule.fixed_markup ?? 0)
    roundTo = rule.round_to ?? undefined
  } else {
    // OF-4 (review 2026-10-17): firmaets standard-produktavance (calculation_settings), ikke en fast 20 % — samme som
    // leverandørsøgningen viste
    if (input.productMargin != null) marginPercentage = input.productMargin
    else {
      const { loadDefaultProductMargin } = await import('@/lib/settings/product-margin')
      marginPercentage = await loadDefaultProductMargin().catch(() => CALC_DEFAULTS.MARGINS.PRODUCTS)
    }
  }
  const unitPrice = Math.round(calculateSalePrice(effectiveCost, marginPercentage, { fixedMarkup, roundTo }) * 100) / 100
  return { unitPrice, marginPercentage, effectiveCost }
}
