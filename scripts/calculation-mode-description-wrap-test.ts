/**
 * Tilstandsbeskrivelsen i kalkulationstypen ombrydes. Teksten er uændret.
 *   npx tsx scripts/calculation-mode-description-wrap-test.ts
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

const view = readFileSync('src/components/modules/calculations/calculation-mode-selector.tsx', 'utf8')
const at = view.indexOf('data-testid="calculation-mode-description"')
const row = at >= 0 ? view.slice(at - 160, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'beskrivelsen ombrydes')
ok(row.includes('{MODE_DESCRIPTIONS[mode]}'), 'teksten er uændret')
ok(!row.includes('line-clamp-2'), 'den klippes ikke til to linjer')
ok(view.includes('onClick={() => onChange(mode)}'), 'valget bliver')
ok(view.includes('materialer og arbejdsløn'), 'arbejdsløn bliver')
ok(view.includes('Solcelleanlæg med ROI og besparelsesberegning'), 'solcelle bliver')
ok(view.includes('{CALCULATION_MODE_LABELS[mode]}'), 'navnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calculation-mode-description-wrap-test')
