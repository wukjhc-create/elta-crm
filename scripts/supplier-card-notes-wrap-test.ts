/**
 * Leverandørnotatet på leverandørkortet ombrydes. Teksten er uændret.
 *   npx tsx scripts/supplier-card-notes-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/components/modules/suppliers/suppliers-list.tsx', 'utf8')
const at = view.indexOf('data-testid="supplier-card-notes"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'notatet ombrydes')
ok(row.includes('>{supplier.notes}'), 'teksten er uændret')
ok(!row.includes('line-clamp-2'), 'det klippes ikke til to linjer')
ok(view.includes('supplier.contact_email'), 'mailen bliver')
ok(view.includes('break-all') && view.includes('supplier.website'), 'websitet ombrydes stadig')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-card-notes-wrap-test')
