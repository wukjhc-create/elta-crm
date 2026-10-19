/**
 * Navnet på kalkulationstypen ombrydes. Teksten er uændret.
 *   npx tsx scripts/calculation-mode-label-wrap-test.ts
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
const id = 'data-testid="calculation-mode-label"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'navnet ombrydes')
ok(row.includes('>{CALCULATION_MODE_LABELS[mode]}'), 'teksten er uændret')
ok(view.includes('onClick={() => onChange(mode)}'), 'valget bliver')
ok(view.includes('materialer og arbejdsløn'), 'arbejdsløn bliver')
ok(view.includes('Solcelleanlæg med ROI og besparelsesberegning'), 'solcelle bliver')
ok(view.includes('data-testid="calculation-mode-description"'), 'beskrivelsen bliver')
ok(view.includes('{MODE_DESCRIPTIONS[mode]}'), 'beskrivelsesteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calculation-mode-label-wrap-test')
