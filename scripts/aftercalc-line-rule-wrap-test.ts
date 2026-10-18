/**
 * Linje-forklaringen ombrydes. Koblingsreglen og beløb er uændret.
 *   npx tsx scripts/aftercalc-line-rule-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-line-rule"')
const end = panel.indexOf('data-testid="aftercalc-lines-mobile"', start)
const rule = start >= 0 && end > start ? panel.slice(start - 90, end) : ''
ok(rule.includes('data-testid="aftercalc-line-rule"'), 'forklaringen kan findes')
ok(rule.includes('break-words min-w-0'), 'forklaringen ombrydes')
ok(rule.includes('En linje kobles kun, når materialet peger på tilbudslinjen eller på samme leverandørvare.'), 'koblingsreglen er uændret')
ok(rule.includes('Ens tekst alene står som ikke matchet.'), 'ikke-matchet bliver')
ok(rule.includes('Linjelisten slår ikke antal eller kost sammen, heller ikke når teksten er ens.'), 'sammenlægningen er uændret')
ok(!rule.includes('truncate'), 'forklaringen klippes ikke')
ok(panel.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), 'kr() er uændret')
ok(panel.includes("const qty = (n: number | null) => (n == null ? '—' : n.toLocaleString('da-DK', { maximumFractionDigits: 2 }))"), 'qty() er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-line-rule-wrap-test')
