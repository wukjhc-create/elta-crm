/**
 * Den tomme kundeliste i AI-projekt kan krympe. Teksterne er uaendret.
 *   npx tsx scripts/ai-project-customer-empty-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-empty"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'listen kan krympe')
ok(row.includes("{customerSearch ? 'Ingen kunder fundet' : 'Ingen kunder'}"), 'teksterne er uaendret')
ok(view.split(id).length === 2, 'listen findes en gang')
ok(view.split("'Ingen kunder'").length === 2, 'den korte tekst findes en gang')
ok(view.includes("'Ingen kunder fundet'"), 'den lange tekst bliver')
ok(view.includes('Det tælles ikke som ingen kunder.'), 'fejlteksten bliver')
ok(view.includes('data-testid="ai-project-customer-search"'), 'soegefeltet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-empty-wrap-test')
