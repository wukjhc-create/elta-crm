/**
 * Kundevaelgerens hoved kan krympe. Tekst og luk er uaendret.
 *   npx tsx scripts/ai-project-customer-head-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-head"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 600) : ''
ok(row.includes('break-words min-w-0'), 'hovedet kan krympe')
ok(row.includes('>Vælg kunde<'), 'teksten er uaendret')
ok(row.includes('aria-label="Luk"'), 'luk er uaendret')
ok(row.includes('data-testid="ai-project-customer-close"'), 'luk-knappen bliver')
ok(view.split(id).length === 2, 'hovedet findes en gang')
ok(view.split('>Vælg kunde<').length === 2, 'teksten findes en gang')
ok(view.includes('font-semibold break-words min-w-0">Vælg kunde'), 'overskriften ombrydes som foer')
ok(view.includes('aria-label="Søg efter kunde"'), 'soegningen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-head-wrap-test')
