/**
 * SU-1/SU-2/SU-3/SU-5 (review 2026-10-17): fælles anvendelse af LEMU-prisfil (cron + manuel). Ren logik med falsk klient.
 *   npx tsx scripts/lemu-apply-test.ts
 */
import { applyLemuRows } from '../src/lib/suppliers/lemu-apply'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — fik ${JSON.stringify(got)}, ville have ${JSON.stringify(want)}`}`)
}

type Rec = Record<string, unknown>
function fakeClient(failUpdateSkus: Set<string> = new Set()) {
  const upserts: Rec[][] = []
  const history: Rec[] = []
  const client = {
    from: (t: string) => ({
      upsert: async (batch: Rec[]) => {
        if (batch.some((r) => failUpdateSkus.has(String(r.supplier_sku)))) return { error: { message: 'boom' } }
        upserts.push(batch); return { error: null }
      },
      insert: async (rows: Rec[]) => { if (t === 'price_history') history.push(...rows); return { error: null } },
    }),
  }
  return { client, upserts, history }
}
const row = (sku: string, cost: number | null, extra: Rec = {}) => ({ parsed: { sku, name: `Vare ${sku}`, cost_price: cost, list_price: null, unit: 'stk', category: 'Kabel', sub_category: null, ean: null, manufacturer: null, ...extra }, errors: [] as string[] })
const loadExisting = (async () => ({
  bySku: new Map([
    ['A', { id: 'id-a', supplier_sku: 'A', cost_price: 10, list_price: 20 }],
    ['B', { id: 'id-b', supplier_sku: 'B', cost_price: 10, list_price: 20 }],
  ]),
  complete: true, loaded: 2, total: 2, ms: 1,
})) as never

async function main() {
  {
    const f = fakeClient()
    const r = await applyLemuRows(f.client, 'sup', [row('A', 12), row('B', 0), row('N1', 5), row('N0', 0), row('A', 13)] as never, { loadExisting })
    eq('dedupe: sidste A vinder', r.deduplicated, 4)
    eq('opdaterede/nye', [r.updatedProducts, r.newProducts], [2, 1])
    eq('SU-2: ny vare uden kost springes over', r.skippedNoCost, 1)
    const all = f.upserts.flat()
    const b = all.find((x) => x.supplier_sku === 'B')!
    eq('SU-2: kost 0 bevarer kendt kost', b.cost_price, 10)
    eq('SU-5: ingen kategori/ean ved opdatering', ['category', 'ean', 'sub_category', 'manufacturer'].some((k) => k in b), false)
    eq('ny vare får kategori', all.find((x) => x.supplier_sku === 'N1')!.category, 'Kabel')
    eq('SU-3: historik kun for ændret kost (A 10→13)', f.history.map((h) => [h.supplier_product_id, h.new_cost_price]), [['id-a', 13]])
    eq('prisændringer', r.priceChanges, 1)
  }
  {
    const f = fakeClient(new Set(['A']))
    const r = await applyLemuRows(f.client, 'sup', [row('A', 12)] as never, { loadExisting })
    eq('SU-3: fejlet batch → ingen historik', f.history.length, 0)
    eq('fejlet batch tælles ikke som opdateret', [r.updatedProducts, r.priceChanges, r.errors.length], [0, 0, 1])
  }
  console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
  process.exitCode = bad ? 1 : 0
}
main()
