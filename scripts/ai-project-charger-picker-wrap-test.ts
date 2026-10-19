/**
 * Ladestander-vaelgerens ramme kan krympe. Kostprisen er uaendret.
 *   npx tsx scripts/ai-project-charger-picker-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const id = 'data-testid="charger-picker"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('mt-3 rounded-lg border border-dashed p-3 break-words min-w-0'), 'rammen kan krympe')
ok(row.includes('border-dashed'), 'stregen bliver')
ok(!row.includes('ai-project-charger-label'), 'etiketten er en anden')
ok(!row.includes('formatCurrency(charger.cost_price)'), 'kostprisen er en anden')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split('mt-3 rounded-lg border border-dashed p-3').length === 2, 'rammeklassen findes en gang')
ok(view.includes('data-testid="ai-project-charger-label"'), 'etiketten bliver')
ok(view.includes('formatCurrency(charger.cost_price)'), 'kostprisen bliver')
ok(view.includes('aria-label="Søg ladestander"'), 'soegefeltet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-charger-picker-wrap-test')
