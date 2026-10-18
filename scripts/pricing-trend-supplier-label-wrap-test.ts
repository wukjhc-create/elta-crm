/**
 * Etiketten Leverandør på pristendenser ombrydes. Valget er uændret.
 *   npx tsx scripts/pricing-trend-supplier-label-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-trend-supplier-label"')
const row = at >= 0 ? view.slice(at - 120, at + 280) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>Leverandør:<'), 'ordet bliver')
ok(row.includes('value={selectedSupplierId}'), 'valget bliver')
ok(row.includes('onChange={(e) => onSupplierChange(e.target.value)}'), 'skiftet bliver')
ok(view.includes('Vælg leverandør...'), 'placeholder bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-supplier-label-wrap-test')
