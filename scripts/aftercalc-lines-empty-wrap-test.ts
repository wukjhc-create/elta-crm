/**
 * Tom linjeliste på sagspanelet ombrydes. Teksten er uændret.
 *   npx tsx scripts/aftercalc-lines-empty-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-lines-empty"')
const empty = start >= 0 ? panel.slice(start - 70, start + 220) : ''
ok(empty.includes('data-testid="aftercalc-lines-empty"'), 'den tomme liste kan findes')
ok(empty.includes('break-words min-w-0'), 'den tomme liste ombrydes')
ok(empty.includes('Ingen linjer eller forbrug endnu. Linjer kommer fra tilbuddet. Forbrug kommer fra timer, materialer og andre omkostninger.'), 'teksten er uændret')
ok(!empty.includes('truncate'), 'teksten klippes ikke')
ok(panel.includes('data.lines.length === 0'), 'tom-tjekket er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-lines-empty-wrap-test')
