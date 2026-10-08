/**
 * S2 — ladestander-hardware fra leverandør-/produktkataloget (Henrik 2026-10-07).
 *
 * Prisen for en elbillader bygges af: laderens hardware (VALGT supplier_product) + MONT-LADESTAND (kun montage/arbejde)
 * + kabel (motorens kabelberegning) + beskyttelse/tavlemateriel (laderens egen gruppe) + evt. gravearbejde/øvrigt.
 * Hardware vælges ALDRIG automatisk (kataloget blander ladebokse og tilbehør) — uden valgt produkt markeres den
 * "Ikke prissat". Kun til motorens interne beregning (admin-klient; værktøjet kræver tools.ai_project = kostroller).
 */
import { createAdminClient } from '@/lib/supabase/admin'

export type ChargerProduct = { id: string; name: string; sku: string | null; supplier: string | null; costPrice: number; available: boolean }

export async function loadChargerProduct(productId: string): Promise<ChargerProduct | null> {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_products')
    .select('id, supplier_name, supplier_sku, cost_price, is_available, supplier:suppliers(name)')
    .eq('id', productId)
    .maybeSingle()
  if (error || !data) return null
  const r = data as { id: string; supplier_name: string | null; supplier_sku: string | null; cost_price: number | null; is_available: boolean | null; supplier: { name?: string } | Array<{ name?: string }> | null }
  const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier
  if (r.cost_price == null || Number(r.cost_price) <= 0) return null
  return { id: r.id, name: r.supplier_name ?? 'Ladestander', sku: r.supplier_sku, supplier: sup?.name ?? null, costPrice: Number(r.cost_price), available: r.is_available !== false }
}
