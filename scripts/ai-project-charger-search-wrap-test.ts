/**
 * Soegefeltet til ladestander kan krympe. Pladsholder og aria-label er uaendret.
 *   npx tsx scripts/ai-project-charger-search-wrap-test.ts
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
const id = 'data-testid="ai-project-charger-search"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 320) : ''
ok(row.includes('break-words min-w-0'), 'soegefeltet kan krympe')
ok(row.includes('placeholder="Søg ladeboks i produktkataloget (fx Zaptec, Easee, EVlink)…"'), 'pladsholderen er uaendret')
ok(row.includes('aria-label="Søg ladestander"'), 'aria-label er uaendret')
ok(view.split(id).length === 2, 'feltet findes en gang')
ok(view.includes('value={chargerQuery}'), 'vaerdien bliver')
ok(view.includes('formatCurrency(charger.cost_price)'), 'kostprisen bliver')
ok(view.includes('data-testid="ai-project-charger-remove"'), 'fjern-knappen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-charger-search-wrap-test')
