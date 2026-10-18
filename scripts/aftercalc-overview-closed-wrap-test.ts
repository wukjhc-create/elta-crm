/**
 * Den lukkede efterkalk-oversigt ombryder skjult kost. Sætningen er uændret.
 *   npx tsx scripts/aftercalc-overview-closed-wrap-test.ts
 */
import { readFileSync } from 'node:fs'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const start = view.indexOf('data-testid="aftercalc-overview-closed-hint"')
const row = start >= 0 ? view.slice(start - 160, start + 120) : ''
ok(row.includes('break-words min-w-0'), 'teksten ombrydes')
ok(row.includes('Kost og DB er skjult, indtil du åbner oversigten.'), 'sætningen er uændret')
ok(row.includes('{!open &&'), 'teksten vises kun når oversigten er lukket')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'teksten klippes ikke')

const panel = readFileSync('src/app/dashboard/orders/[id]/case-aftercalc-panel.tsx', 'utf8')
ok(panel.includes('Tilbudt mod faktisk. Kost og DB er skjult, indtil du åbner.'), 'sagspanelets sætning er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-closed-wrap-test')
