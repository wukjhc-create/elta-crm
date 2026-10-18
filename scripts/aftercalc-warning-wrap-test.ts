/**
 * Sagspanelets advarsler ombrydes. Advarselsteksten er uændret.
 *   npx tsx scripts/aftercalc-warning-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data.warnings.map')
const end = panel.indexOf('</ul>', start)
const warnings = start >= 0 && end > start ? panel.slice(start, end) : ''
ok(warnings.includes('break-words min-w-0'), 'advarslen ombrydes')
ok(warnings.includes('{DATA_QUALITY_LABELS[w.code]}'), 'koden vises stadig')
ok(warnings.includes('{w.message}'), 'teksten er uændret')
ok(!warnings.includes('truncate'), 'advarslen klippes ikke')

const calc = readFileSync(join('src', 'lib', 'cases', 'aftercalc.ts'), 'utf8')
ok(calc.includes('tilbudslinje(r) mangler kostpris'), 'motorens advarsel er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-warning-wrap-test')
