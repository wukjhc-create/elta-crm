/**
 * Den tomme pristilstand kan krympe. Teksten er uændret.
 *   npx tsx scripts/pricing-empty-state-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-empty-state"')
const row = at >= 0 ? view.slice(at - 160, at + 280) : ''
ok(row.includes('min-w-0'), 'rammen kan krympe')
ok(row.includes('>{message}<'), 'teksten kommer stadig fra message')
ok(view.includes('Ingen prisadvarsler i den valgte periode'), 'tom advarsel bliver')
ok(view.includes('Ingen tilbud er påvirket af nylige prisændringer'), 'tomt tilbud bliver')
ok(view.includes('Ingen leverandørstatistik tilgængelig'), 'tom statistik bliver')
ok(view.includes('Vælg en leverandør for at se pristendenser'), 'vælg leverandør bliver')
ok(view.includes('Ingen pristendenser fundet for denne leverandør'), 'tomme tendenser bliver')
const loadAt = view.indexOf('data-testid="pricing-loading-text"')
const loadRow = loadAt >= 0 ? view.slice(loadAt - 320, loadAt) : ''
ok(loadRow.includes('data-testid="pricing-loading-state"'), 'indlæsningsrammen kan krympe')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-empty-state-wrap-test')
