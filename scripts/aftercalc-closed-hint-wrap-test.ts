/**
 * Den lukkede efterkalk-linje ombrydes. Teksten er uændret.
 *   npx tsx scripts/aftercalc-closed-hint-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-closed-hint"')
const hint = start >= 0 ? panel.slice(start - 80, start + 180) : ''
ok(hint.includes('data-testid="aftercalc-closed-hint"'), 'linjen kan findes')
ok(hint.includes('break-words min-w-0'), 'linjen ombrydes')
ok(hint.includes('Tilbudt mod faktisk. Kost og DB er skjult, indtil du åbner.'), 'teksten er uændret')
ok(!hint.includes('truncate'), 'linjen klippes ikke')
ok(panel.includes('data-testid="aftercalc-toggle"'), 'åbn-knappen er uændret')
ok(panel.includes('aria-expanded={open}'), 'åbn-tilstanden er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-closed-hint-wrap-test')
