/**
 * Sagsbeskrivelsen i kundeportalen ombrydes. Teksten er uændret.
 *   npx tsx scripts/portal-case-description-wrap-test.ts
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

const view = readFileSync('src/components/modules/portal/portal-dashboard.tsx', 'utf8')
const at = view.indexOf('data-testid="portal-case-description"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'beskrivelsen ombrydes')
ok(row.includes('>{sc.description}'), 'teksten er uændret')
ok(!row.includes('line-clamp-2'), 'den klippes ikke til to linjer')
ok(view.includes('font-medium text-gray-900 mt-1 break-words">{sc.title}'), 'sagstitlen bliver')
ok(view.includes('formatCurrency(offer.final_amount, currency)'), 'beløbet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  portal-case-description-wrap-test')
