/**
 * Sagens efterkalkulation viser hvor mange linjer der mangler kost.
 *   npx tsx scripts/aftercalc-missing-cost-count-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
ok(panel.includes('data-testid="aftercalc-missing-cost-count"'), 'panelet har tællingen')
ok(panel.includes('Mangler kostdata ({data.missing_cost_lines.length})'), 'antallet er listens længde')
ok(panel.includes('data.missing_cost_lines.map((r) => <li key={r.key} className="break-words">{r.description}</li>)'), 'linjerne vises stadig')
ok(panel.includes('{w.message}'), 'advarselsteksten er uændret')

const calc = readFileSync(join('src', 'lib', 'cases', 'aftercalc.ts'), 'utf8')
ok(calc.includes('tilbudslinje(r) mangler kostpris'), 'motorens advarsel er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-missing-cost-count-test')
