/**
 * Højdepunktets beløb ombrydes. kr() er uændret.
 *   npx tsx scripts/aftercalc-highlight-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('function Highlight')
const highlight = start >= 0 ? panel.slice(start) : ''
ok(highlight.includes('data-testid="aftercalc-highlight-amount"'), 'beløbet kan findes')
ok(highlight.includes('tabular-nums break-words min-w-0 text-right'), 'beløbet ombrydes')
ok(highlight.includes('{kr(r.amount)}'), 'beløbet er stadig kr()')
ok(!highlight.includes('shrink-0'), 'beløbet klippes ikke af flex')
ok(panel.includes('Ingen linje er dyrere end tilbudt.'), 'tom merkost er uændret')
ok(panel.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), 'kr() er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-highlight-wrap-test')
