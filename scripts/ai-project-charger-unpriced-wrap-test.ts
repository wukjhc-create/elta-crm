/**
 * Hjaelpeteksten om en lader der ikke er prissat ombrydes. Saetningen er uaendret.
 *   npx tsx scripts/ai-project-charger-unpriced-wrap-test.ts
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
const sentence = 'Uden valgt lader markeres hardwaren &quot;Ikke prissat&quot; — der gættes aldrig.'
const id = 'data-testid="ai-project-charger-unpriced"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'teksten ombrydes')
ok(row.includes(sentence), 'saetningen er uaendret')
ok(view.split(sentence).length === 2, 'saetningen findes en gang')
ok(view.includes('&quot;Ikke prissat&quot;'), 'anfoerselstegnene bliver')
ok(view.includes('formatCurrency(charger.cost_price)'), 'kostprisen bliver')
ok(view.includes('data-testid="ai-project-charger-label"'), 'etiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-charger-unpriced-wrap-test')
