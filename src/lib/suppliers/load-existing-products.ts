/**
 * Indlæs ALLE eksisterende leverandørprodukter (sku → række) til prissynk — side for side, parallelt, med tidsbudget.
 *
 * Pris-review 2026-10-07 (X4): LM/FTP-synken lavede én `.select().eq('supplier_id')` → PostgREST gav højst 1.000 rækker.
 * Prod: 322.517 LM-produkter, men hver uge kun ~960 "opdateret" — resten blev behandlet som NYE (upsert overskrev
 * status/kilde) og der blev ALDRIG skrevet price_history (0 rækker i prod) → fakturakontrol på fakturadato havde
 * ingen historik. Cronen har 300 s og bruger i dag 150–200 s, så opslaget er parallelt (sider à 1.000) og stopper ved
 * tidsbudgettet: så er resultatet aldrig værre end før (complete=false → resten behandles som i dag).
 */
type Client = { from: (t: string) => any }

export type ExistingProduct = { id: string; supplier_sku: string; cost_price: number | null; list_price: number | null }

export async function loadExistingSupplierProducts(
  supabase: Client,
  supplierId: string,
  opts: { budgetMs?: number; concurrency?: number; pageSize?: number; now?: () => number } = {},
): Promise<{ bySku: Map<string, ExistingProduct>; complete: boolean; loaded: number; total: number; ms: number }> {
  const budgetMs = opts.budgetMs ?? 60_000
  const concurrency = opts.concurrency ?? 8
  const pageSize = opts.pageSize ?? 1000
  const clock = opts.now ?? Date.now
  const start = clock()
  const bySku = new Map<string, ExistingProduct>()

  const { count, error: cErr } = await supabase.from('supplier_products').select('id', { count: 'exact', head: true }).eq('supplier_id', supplierId)
  if (cErr) throw cErr
  const total = count ?? 0
  const pages = Math.ceil(total / pageSize)
  let complete = true
  for (let p = 0; p < pages; p += concurrency) {
    if (clock() - start > budgetMs) { complete = false; break }
    const wave = []
    for (let k = p; k < Math.min(p + concurrency, pages); k++) {
      wave.push(supabase.from('supplier_products').select('id, supplier_sku, cost_price, list_price')
        .eq('supplier_id', supplierId).order('id').range(k * pageSize, (k + 1) * pageSize - 1))
    }
    const results = await Promise.all(wave)
    for (const r of results as Array<{ data: ExistingProduct[] | null; error: unknown }>) {
      if (r.error) throw r.error
      for (const row of r.data ?? []) bySku.set(row.supplier_sku, row)
    }
  }
  return { bySku, complete: complete && bySku.size >= total, loaded: bySku.size, total, ms: clock() - start }
}
