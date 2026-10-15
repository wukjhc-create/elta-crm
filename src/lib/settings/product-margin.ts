/**
 * Global produkt-avance (calculation_settings 'margin_products') til SERVER-beregning af salgspriser.
 * Grossist-review 2026-10-14 (GP-1): avancen må ikke udleveres til roller uden kostadgang (salg kunne ellers regne
 * nettoindkøbsprisen baglæns fra den estimerede salgspris) — derfor læses den her med admin-klienten, mens server
 * action getCalculationSettings nulstiller indkøbsavancerne for de roller. Bevidst IKKE 'use server'.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { CALC_DEFAULTS } from '@/lib/constants'

export async function loadDefaultProductMargin(): Promise<number> {
  try {
    const { data } = await createAdminClient().from('calculation_settings').select('setting_value').eq('setting_key', 'margin_products').maybeSingle()
    const v = (data?.setting_value as { percentage?: unknown } | null)?.percentage
    return typeof v === 'number' && Number.isFinite(v) ? v : CALC_DEFAULTS.MARGINS.PRODUCTS
  } catch {
    return CALC_DEFAULTS.MARGINS.PRODUCTS
  }
}
