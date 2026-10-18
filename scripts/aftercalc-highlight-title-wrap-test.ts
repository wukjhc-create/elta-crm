/**
 * Højdepunktets overskrift ombrydes. Titlerne er uændret.
 *   npx tsx scripts/aftercalc-highlight-title-wrap-test.ts
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
ok(highlight.includes('data-testid="aftercalc-highlight-title"'), 'overskriften kan findes')
ok(highlight.includes('break-words min-w-0" data-testid="aftercalc-highlight-title">{title}'), 'overskriften ombrydes')
ok(highlight.includes('{title}'), 'teksten kommer stadig fra kaldet')
ok(!highlight.includes('truncate'), 'overskriften klippes ikke')
ok(panel.includes('title="Største merkost"'), 'merkost-titlen er uændret')
ok(panel.includes('title="Største besparelse"'), 'besparelses-titlen er uændret')
ok(panel.includes('title="Ikke brugte tilbudslinjer"'), 'ubrugte linjer er uændret')
ok(panel.includes('title="Ekstra, ikke i tilbuddet"'), 'ekstra-titlen er uændret')
ok(highlight.includes('data-testid="aftercalc-highlight-empty">{empty}'), 'den tomme tekst er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-highlight-title-wrap-test')
