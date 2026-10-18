/**
 * Toleranceteksten under fakturakontrollen ombrydes. Beløbet er uændret.
 *   npx tsx scripts/invoice-control-tolerance-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="invoice-control-tolerance"')
const row = start >= 0 ? view.slice(start - 80, start + 180) : ''
ok(row.includes('data-testid="invoice-control-tolerance"'), 'tolerancen kan findes')
ok(row.includes('break-words min-w-0'), 'tolerancen ombrydes')
ok(row.includes('Sammenlignet med kostpris i leverandørkataloget (tolerance 2 % / 0,50 kr pr. enhed).'), 'tolerancen er uændret')
ok(!row.includes('truncate'), 'tolerancen klippes ikke')
ok(view.includes('data-testid="invoice-control-overcharge"'), 'overprisen kan findes')
ok(view.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), 'nul-linjen er uændret')
ok(view.includes('Fragt og gebyr er markeret i teksten. Overprisen er uændret.'), 'fragt-noten er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-tolerance-wrap-test')
