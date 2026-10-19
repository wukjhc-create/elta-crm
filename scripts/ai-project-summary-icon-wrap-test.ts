/**
 * Opsummeringskortets ikon kan krympe. Ikonet er uaendret.
 *   npx tsx scripts/ai-project-summary-icon-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
const cell = 'w-10 h-10 rounded-lg break-words min-w-0 ${colors[color]} flex items-center justify-center mb-3'
ok(row.includes('w-10 h-10 rounded-lg break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('{icon}'), 'ikonet bliver i boksen')
ok(row.includes('colors[color]'), 'farven bliver')
ok(!row.includes('{value}'), 'tallet er et andet')
ok(!row.includes('{label}'), 'etiketten er en anden')
ok(!row.includes('{sublabel}'), 'noten er en anden')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split('{icon}').length === 2, 'ikonet bruges en gang')
ok(view.includes('data-testid="ai-project-summary-value">{value}'), 'tallet bliver')
ok(view.includes('data-testid="ai-project-summary-label">{label}'), 'etiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-icon-wrap-test')
