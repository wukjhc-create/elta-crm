/**
 * Pakkebeskrivelsen i pakkevælgeren ombrydes. Teksten er uændret.
 *   npx tsx scripts/package-picker-description-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/components/modules/packages/package-picker-dialog.tsx', 'utf8')
const at = view.indexOf('data-testid="package-picker-description"')
const row = at >= 0 ? view.slice(at - 140, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'beskrivelsen ombrydes')
ok(row.includes('>{pkg.description}'), 'teksten er uændret')
ok(!row.includes('line-clamp-1'), 'den klippes ikke til en linje')
ok(view.includes('onSelect(pkg.id, pkg.name)'), 'valget er uændret')
ok(view.includes('formatCurrency(pkg.total_sale_price)'), 'prisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  package-picker-description-wrap-test')
