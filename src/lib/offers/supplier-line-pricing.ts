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
  return finishSupplierLinePricing({
    rule: (marginData as MarginRuleRow[] | null)?.[0] ?? null,
    agreement: customerRes.data as AgreementRow | null,
    productPrice: productPriceRes.data as ProductPriceRow | null,
    costPrice: input.costPrice,
    productMargin: input.productMargin,
    customMargin: input.customMargin,
  })
}

type MarginRuleRow = { margin_percentage: number; fixed_markup: number | null; round_to: number | null; rule_type?: string | null }
type AgreementRow = { discount_percentage: number | null; custom_margin_percentage: number | null }
type ProductPriceRow = { custom_cost_price: number | null; custom_discount_percentage: number | null }

/** Fælles beregning (én forrang for enkelt- og batch-stien) ud fra de indlæste regler/aftaler. */
async function finishSupplierLinePricing(i: {
  rule: MarginRuleRow | null
  agreement: AgreementRow | null
  productPrice: ProductPriceRow | null
  costPrice: number
  productMargin: number | null | undefined
  customMargin?: number
  defaultMargin?: () => Promise<number>
}): Promise<{ unitPrice: number; marginPercentage: number; effectiveCost: number }> {
  const productPrice = i.productPrice
  const agreement = productPrice
    ? null // produktprisen erstatter leverandøraftalen helt (rabat og aftale-avance)
    : i.agreement
  const baseCost = productPrice?.custom_cost_price != null && Number(productPrice.custom_cost_price) > 0 ? Number(productPrice.custom_cost_price) : i.costPrice
  const discountPct = Number(productPrice ? productPrice.custom_discount_percentage ?? 0 : agreement?.discount_percentage ?? 0)
  const effectiveCost = discountPct > 0 ? baseCost * (1 - discountPct / 100) : baseCost

  const rule = i.rule
  // FIN3-1 (finans-review 2 2026-10-20): fælles forrang — produkt-/kunderegel → kundeaftalens avance → kategori-/
  // leverandørregel → produktets avance → standard. Før slog ENHVER regel (også leverandørens standardregel) aftalen,
  // mens kalkia/sagsmateriale/DB-funktionen brugte aftalen → kunden fik et dyrere tilbud end aftalt.
  const specificRule = !!rule && (rule.rule_type === 'product' || rule.rule_type === 'customer')
  const agreementMargin = agreement?.custom_margin_percentage !== null && agreement?.custom_margin_percentage !== undefined
    ? Number(agreement.custom_margin_percentage) : null
  let marginPercentage: number
  let fixedMarkup = 0
  let roundTo: number | undefined
  if (i.customMargin !== undefined && i.customMargin !== null) {
    marginPercentage = i.customMargin
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
    if (i.productMargin != null) marginPercentage = i.productMargin
    else if (i.defaultMargin) marginPercentage = await i.defaultMargin()
    else {
      const { loadDefaultProductMargin } = await import('@/lib/settings/product-margin')
      marginPercentage = await loadDefaultProductMargin().catch(() => CALC_DEFAULTS.MARGINS.PRODUCTS)
    }
  }
  const unitPrice = Math.round(calculateSalePrice(effectiveCost, marginPercentage, { fixedMarkup, roundTo }) * 100) / 100
  return { unitPrice, marginPercentage, effectiveCost }
}

/**
 * R3-8 (finans-review 3 2026-10-20): samme prisberegning for MANGE varer (sagsmaterialesøgningen) — kategorier,
 * kundeaftaler og kundespecifikke produktpriser hentes én gang for alle (før ~4 opslag pr. vare); avancereglen er en
 * DB-funktion pr. vare. Resultat pr. supplier_product_id; en vare der fejler, mangler i kortet.
 */
export async function supplierLinePricingBatch(input: {
  customerId: string | null
  items: Array<{ supplierId: string; supplierProductId: string; costPrice: number; productMargin: number | null | undefined }>
  admin?: SupabaseClient
}): Promise<Map<string, { unitPrice: number; marginPercentage: number; effectiveCost: number }>> {
  const out = new Map<string, { unitPrice: number; marginPercentage: number; effectiveCost: number }>()
  if (!input.items.length) return out
  const admin = input.admin ?? createAdminClient()
  const productIds = [...new Set(input.items.map((x) => x.supplierProductId))]
  const supplierIds = [...new Set(input.items.map((x) => x.supplierId))]
  const [catRes, agrRes, ppRes] = await Promise.all([
    admin.from('supplier_products').select('id, category, sub_category').in('id', productIds),
    input.customerId
      ? onlyValidAgreements(admin.from('customer_supplier_prices').select('supplier_id, discount_percentage, custom_margin_percentage')
          .eq('customer_id', input.customerId).in('supplier_id', supplierIds).eq('is_active', true))
      : Promise.resolve({ data: [] as unknown[] }),
    input.customerId
      ? onlyValidAgreements(admin.from('customer_product_prices').select('supplier_product_id, custom_cost_price, custom_discount_percentage')
          .eq('customer_id', input.customerId).in('supplier_product_id', productIds).eq('is_active', true))
      : Promise.resolve({ data: [] as unknown[] }),
  ])
  const catBy = new Map(((catRes.data ?? []) as Array<{ id: string; category: string | null; sub_category: string | null }>).map((r) => [r.id, r]))
  // som enkeltstien (.limit(1)): første gyldige aftale pr. leverandør / produktpris pr. vare
  const agrBy = new Map<string, AgreementRow>()
  for (const a of (agrRes.data ?? []) as Array<AgreementRow & { supplier_id: string }>) if (!agrBy.has(a.supplier_id)) agrBy.set(a.supplier_id, a)
  const ppBy = new Map<string, ProductPriceRow>()
  for (const r of (ppRes.data ?? []) as Array<ProductPriceRow & { supplier_product_id: string }>) if (!ppBy.has(r.supplier_product_id)) ppBy.set(r.supplier_product_id, r)
  let defaultP: Promise<number> | null = null
  const defaultMargin = () => {
    if (!defaultP) defaultP = import('@/lib/settings/product-margin').then((m) => m.loadDefaultProductMargin()).catch(() => CALC_DEFAULTS.MARGINS.PRODUCTS)
    return defaultP
  }
  await Promise.all(input.items.map(async (it) => {
    try {
      const cat = catBy.get(it.supplierProductId)
      const { data: marginData } = await admin.rpc('get_effective_margin', {
        p_supplier_id: it.supplierId,
        p_supplier_product_id: it.supplierProductId,
        p_category: cat?.category ?? null,
        p_sub_category: cat?.sub_category ?? null,
        p_customer_id: input.customerId,
      })
      out.set(it.supplierProductId, await finishSupplierLinePricing({
        rule: (marginData as MarginRuleRow[] | null)?.[0] ?? null,
        agreement: agrBy.get(it.supplierId) ?? null,
        productPrice: ppBy.get(it.supplierProductId) ?? null,
        costPrice: it.costPrice,
        productMargin: it.productMargin,
        defaultMargin,
      }))
    } catch { /* varen vises uden pris */ }
  }))
  return out
}
