/**
 * Unit-tests for dublet-varenumre i prisfiler (src/lib/import/dedupe-sku.ts). Ingen DB.
 *   npx tsx scripts/dedupe-sku-test.ts
 */
import { dedupeRowsBySku } from '../src/lib/import/dedupe-sku'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
const R = (sku: string | null, price: number) => ({ parsed: { sku, price } })

const r = dedupeRowsBySku([R('A', 1), R('B', 2), R('A', 3), R(null, 4), R(' B ', 5)])
ok(r.rows.length === 3 && r.duplicates === 2, 'to dubletter fjernet (A og B med mellemrum)')
ok(r.rows.find((x) => x.parsed.sku === 'A')?.parsed.price === 3, 'sidste række for A vinder')
ok(r.rows.some((x) => x.parsed.sku === null), 'række uden varenummer bevares (afvises af valideringen)')
ok(dedupeRowsBySku([]).rows.length === 0, 'tom fil')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle dublet-tests bestået')
process.exitCode = bad ? 1 : 0
