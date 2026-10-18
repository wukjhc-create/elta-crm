/**
 * Sætningen om fragt og gebyr ombrydes. Sætningen er uændret.
 *   npx tsx scripts/invoice-control-charges-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const at = view.indexOf('data-testid="invoice-control-charges"')
const row = at >= 0 ? view.slice(at - 220, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'sætningen ombrydes')
ok(row.includes('Fragt og gebyr er markeret i teksten. Overprisen er uændret.'), 'sætningen er uændret')
ok(row.includes('chargeLabel(l.description)'), 'noten vises kun når linjen er fragt eller gebyr')
ok(view.includes('data-testid="invoice-control-tolerance"'), 'tolerancen bliver')
ok(view.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), 'nul-linjen er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'sætningen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-charges-wrap-test')
