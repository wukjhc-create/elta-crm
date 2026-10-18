/**
 * Tomme højdepunkter ombrydes. Teksterne er uændret.
 *   npx tsx scripts/aftercalc-highlight-empty-wrap-test.ts
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
ok(highlight.includes('data-testid="aftercalc-highlight-empty"'), 'den tomme tekst kan findes')
ok(highlight.includes('break-words min-w-0" data-testid="aftercalc-highlight-empty">{empty}'), 'den tomme tekst ombrydes')
ok(highlight.includes('{empty}'), 'teksten kommer stadig fra kaldet')
ok(!highlight.includes('truncate'), 'teksten klippes ikke')
ok(panel.includes('Ingen linje er dyrere end tilbudt.'), 'tom merkost er uændret')
ok(panel.includes('Ingen brugt linje er billigere end tilbudt.'), 'tom besparelse er uændret')
ok(panel.includes('Alle tilbudslinjer er brugt eller mangler kost.'), 'tomme tilbudslinjer er uændret')
ok(panel.includes('Intet registreret forbrug ligger uden for tilbuddet.'), 'tomt ekstraforbrug er uændret')
ok(panel.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), 'kr() er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-highlight-empty-wrap-test')
